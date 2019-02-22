import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import dateTimeHelper from '../../lib/DateTimeHelper';
import routeRegistry from '../../lib/RouteRegistry';
import dataStore from '../../lib/DataStore';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

class Ticker extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        loaded:false,
        loadedTimestamp:0,
        autoRefresh:60000,
        err: null,
        pair:undefined === this.props.pair ? null : this.props.pair,
        data:[]
    };
    // do we have autoRefresh value in datastore ?
    let autoRefresh = dataStore.getData('autoRefresh');
    if (null !== autoRefresh)
    {
        this.state.autoRefresh = autoRefresh;
    }
    this._baseUrl = '#/';
    this._getBaseUrl();
    this._autoRefreshTimer = null;
}

_getBaseUrl()
{
    let routes = routeRegistry.getExchangesRoutes(this.props.exchange);
    this._baseUrl = '#' + routes[this.props.exchange]['orderBooks']['path'] + '/';
}

_handleSetAutoRefresh(event)
{
    let value = parseInt(event.target.value);
    // cancel previous timer
    if (null !== this._autoRefreshTimer)
    {
        clearTimeout(this._autoRefreshTimer);
    }
    this.setState((prevState, props) => {
        return {autoRefresh:value};
    }, function(){
        // update datastore
        dataStore.setData('autoRefresh', value);
        if (0 != value)
        {
            this._startAutoRefresh();
        }
    });
}

_startAutoRefresh()
{
    let self = this;
    let timeout = this.state.autoRefresh;
    // remove previous timer if it exists
    if (undefined !== this._startAutoRefresh)
    {
        clearTimeout(this._startAutoRefresh);
    }
    if (0 == timeout)
    {
        return;
    }
    let reload = function(){
        if (!self._isMounted)
        {
            return;
        }
        self._autoRefreshTimer = setTimeout(function(){
            if (!self._isMounted)
            {
                return;
            }
            self._loadData(function(){
                reload();
            });
        }, timeout);
    }
    reload();
}

/**
 * @param {function} cb callback to call after loading data (optional)
 */
_reloadData(cb)
{
    this.setState((prevState, props) => {
        return {err:null, loaded:false};
    }, function(){
        this._loadData(cb);
    });
}

/**
 * @param {function} cb callback to call after loading data (optional)
 */
_loadData(cb)
{
    let self = this;
    restClient.getTickers(this.props.exchange, [this.state.pair]).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        if (undefined === data[self.state.pair])
        {
            let message = `No ticker for ${self.state.pair}`;
            console.warn(message);
            self.setState((prevState, props) => {
                return {loaded:true, data:null, err:message, loadedTimestamp:timestamp};
            });
            if (undefined !== cb)
            {
                cb.call(self);
            }
            return;
        }
        // update window title
        try
        {
            let title = data[self.state.pair].last.toFixed(8) + ' / ' + self.state.pair;
            document.title = title;
        }
        catch (e)
        {
            // just ignore
        }
        self.setState((prevState, props) => {
            return {err:null, loaded:true, data: data[self.state.pair], loadedTimestamp:timestamp};
        });
        if (undefined !== cb)
        {
            cb.call(self);
        }
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
            return {loaded:true, data:null, err:err, loadedTimestamp:timestamp};
        });
        if (undefined !== cb)
        {
            cb.call(self);
        }
    });
}

componentWillUnmount()
{
    this._isMounted = false;
    if (null !== this._autoRefreshTimer)
    {
        clearTimeout(this._autoRefreshTimer);
    }
    // reset document title
    document.title = 'My Personal Exchange';
}

componentWillReceiveProps(nextProps)
{
    let self = this;
    let reload = false;
    let newPair = undefined === nextProps.pair ? null : nextProps.pair;
    if (nextProps.exchange !== this.props.exchange)
    {
        reload = true;
    }
    else if (this.state.pair != newPair)
    {
        reload = true;
    }
    this.setState((prevState, props) => {
        return {
            pair:newPair
        }
    }, function(){
        if (!reload)
        {
            return;
        }
        self._reloadData(function(){
            this._startAutoRefresh();
        });
    });
}


componentDidMount()
{
    this._isMounted = true;
    this._loadData(function(){
        this._startAutoRefresh();
    });
}

render()
{
    if (null === this.state.pair)
    {
        return null;
    }
    if (!this.state.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }

    const LastRefresh = () => {
        if (0 == this.state.loadedTimestamp)
        {
            return null
        }
        let timestamp = dateTimeHelper.formatTime(this.state.loadedTimestamp);
        let classNames = "text-success";
        if (null !== this.state.err)
        {
            classNames = "text-danger";
        }
        return (
            <span className={classNames} style={{marginLeft:'8px',display:'inline-block'}}>{timestamp}</span>
        )
    }

    const AutoRefreshComponent = () => {
        let refreshValues = [
            {text:'Never',value:0},
            {text:'Every 30 seconds',value:30000},
            {text:'Every minute',value:60000},
            {text:'Every 5 minutes',value:300000},
            {text:'Every 15 minutes',value:1500000}
        ]
        return (
          <div style={{marginBottom:'5px'}}>
            <span style={{minWidth:'70px',display:'inline-block'}}>R<small>EFRESH</small></span>&nbsp;&nbsp;
            <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSetAutoRefresh.bind(this)} value={this.state.autoRefresh}>
            {
              _.map(refreshValues).map((item, index) => {
                return <option key={index} value={item.value}>{item.text}</option>
              })
            }
            </select>
            <LastRefresh/>
         </div>
       )
    }

    const getChange = () => {
        if (null === this.state.data.priceChangePercent)
        {
            return (
                <span style={{color:'#e64400'}}>N/A</span>
            );
        }
        let className_percent_change = '';
        if (this.state.data.priceChangePercent < 0)
        {
            className_percent_change = 'text-danger';
        }
        else if (this.state.data.priceChangePercent > 0)
        {
            className_percent_change = 'text-success';
        }
        return (
            <span className={className_percent_change}>{this.state.data.priceChangePercent.toFixed(3)} %</span>
        );
    }

    const getBuyPrice = (url) => {
        if (null === this.state.data.buy)
        {
            return (
                <span style={{color:'#e64400'}}>N/A</span>
            );
        }
        let a = this.state.data.buy.toFixed(8);
        return (
            <a href={url}>{this.state.data.buy.toFixed(8)}</a>
        );
    }

    const getSellPrice = (url) => {
        if (null === this.state.data.sell)
        {
            return (
                <span style={{color:'#e64400'}}>N/A</span>
            );
        }
        return (
            <a href={url}>{this.state.data.sell.toFixed(8)}</a>
        );
    }

    const TickerRow = () => {
        if (null !== this.state.err)
        {
            return null;
        }
        let url = this._baseUrl + this.props.pair;
        return (
            <tr key="1">
              <td className="text-right"><a href={url}>{this.state.data.last.toFixed(8)}</a></td>
              <td className="text-right">{getBuyPrice(url)}</td>
              <td className="text-right">{getSellPrice(url)}</td>
              <td className="text-right">{this.state.data.high.toFixed(8)}</td>
              <td className="text-right">{this.state.data.low.toFixed(8)}</td>
              <td className="text-right">{getChange()}</td>
              <td className="text-right">{this.state.data.volume.toFixed(8)}</td>
           </tr>
       )
    }

    return (
        <div className="animated fadeIn col-lg-5 p-0">
          <AutoRefreshComponent/>
          <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
            <thead className="thead-inverse">
              <tr>
                <th className="text-right">LAST</th>
                <th className="text-right">BID</th>
                <th className="text-right">ASK</th>
                <th className="text-right">24H HIGH</th>
                <th className="text-right">24H LOW</th>
                <th className="text-right">24H CHANGE</th>
                <th className="text-right">VOL</th>
              </tr>
            </thead>
            <tbody>
                <TickerRow/>
            </tbody>
          </table>
        </div>
    )
}

}

export default Ticker;
