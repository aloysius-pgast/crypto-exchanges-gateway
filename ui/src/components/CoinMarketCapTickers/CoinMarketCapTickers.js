import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class CoinMarketCapTickers extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        limit:10,
        loaded:false,
        loadedTimestamp:0,
        err: null,
        data:[]
    };
    if (undefined !== this.props.limit)
    {
        this.state.limit = parseInt(this.props.limit);
    }
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
}

_handleManualRefresh()
{
    this._loadData();
}

_reloadData()
{
    this.setState((prevState, props) => {
        return {err:null, loaded:false};
    }, function(){
        this._loadData();
    });
}

_loadData()
{
    let self = this;
    restClient.coinMarketCap(this.state.limit).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let list = _.values(data).sort(function(a,b){
            return (a.currency < b.currency) ? 1 : -1;
        });
        self.setState((prevState, props) => {
          return {err:null, loaded:true, data: data, loadedTimestamp:timestamp};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
          return {loaded:true, err:err, loadedTimestamp:timestamp};
        });
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps)
{
    let limit = nextProps.limit;
    if (undefined !== limit)
    {
        limit = parseInt(limit);
    }
    this.setState({limit:limit}, function(){
        this._reloadData();
    });
}


componentDidMount()
{
    this._isMounted = true;
    this._loadData();
}

render()
{
    if (!this.state.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }
    if (null !== this.state.err)
    {
        return null;
    }
    return (
      <div className="animated fadeIn col-lg-5 p-0">
        <ComponentLoadedTimestamp timestamp={this.state.loadedTimestamp} err={this.state.err} onManualRefresh={this._handleManualRefresh}/>
        <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
          <thead className="thead-inverse">
            <tr>
              <th style={{width:'10%'}}>#</th>
              <th>NAME</th>
              <th>SYMBOL</th>
              <th className="text-right">PRICE ($)</th>
              <th className="text-right">CHANGE 24H</th>
              <th className="text-right">CHANGE 7D</th>
              <th className="text-right">VOLUME 24H ($)</th>
            </tr>
            </thead>
            <tbody>
            {
              _.map(this.state.data, (item, index) => {
                // % change last 24H
                let percent_change_24h = item.percent_change_24h;
                let className_percent_change_24h = '';
                if (null === percent_change_24h)
                {
                    percent_change_24h = 0.0;
                }
                if (percent_change_24h < 0)
                {
                    className_percent_change_24h = 'text-danger';
                }
                else if (percent_change_24h > 0)
                {
                    className_percent_change_24h = 'text-success';
                }
                // % change last 7 days
                let percent_change_7d = item.percent_change_7d;
                let className_percent_change_7d = '';
                if (null === percent_change_7d)
                {
                    percent_change_7d = 0.0;
                }
                if (percent_change_7d < 0)
                {
                    className_percent_change_7d = 'text-danger';
                }
                else if (percent_change_7d > 0)
                {
                    className_percent_change_7d = 'text-success';
                }
                // price & volume
                let price_usd = item.price_usd;
                if (null === price_usd)
                {
                    price_usd = 0.0;
                }
                let volume_24h = item.volume_24h_usd;
                if (null === volume_24h)
                {
                    volume_24h = 0;
                }
                return <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.symbol}</td>
                    <td className="text-right">{price_usd.toFixed(6)}</td>
                    <td className="text-right"><span className={className_percent_change_24h}>{percent_change_24h.toFixed(3)} %</span></td>
                    <td className="text-right"><span className={className_percent_change_7d}>{percent_change_7d.toFixed(3)} %</span></td>
                    <td className="text-right">{parseInt(volume_24h)}</td>
                </tr>
              })
            }
            </tbody>
          </table>
      </div>
    )
}

}

export default CoinMarketCapTickers;
