import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import dateTimeHelper from '../../lib/DateTimeHelper';
import routeRegistry from '../../lib/RouteRegistry';
import serviceRegistry from '../../lib/ServiceRegistry';
import starredPairs from '../../lib/StarredPairs';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class CompletedOrders extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        loaded:false,
        loadedTimestamp:0,
        err: null,
        pair:props.pair,
        data:[]
    };
    this._withoutPair = true;
    this._pricesBaseUrl = '#';
    this._newOrderBaseUrl = '#';
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
}

_getBaseUrls(exchange)
{
    let routes = routeRegistry.getExchangesRoutes(exchange);
    this._pricesBaseUrl = '#' + routes[this.props.exchange]['prices']['path'] + '/';
    this._newOrderBaseUrl = '#' + routes[this.props.exchange]['newOrder']['path'] + '/';
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
    let pairs;
    // no pair
    if (undefined === this.state.pair)
    {
        if (!this._withoutPair)
        {
            pairs = _.map(starredPairs.getStarredPairs({exchange:this.props.exchange}), (e) => {
                return e.pair;
            });
        }
    }
    else
    {
        pairs = [this.state.pair];
    }
    restClient.getClosedOrders(this.props.exchange, pairs).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        // add url
        _.forEach(data, (item, orderNumber) => {
            let arr = item.pair.split('-');
            if (null === item.closedTimestamp)
            {
                item.closedTimestamp = item.openTimestamp;
            }
            item.pricesUrl = self._pricesBaseUrl + item.pair;
            item.newOrderUrl = self._newOrderBaseUrl + item.pair + '/' + item.actualRate;
        });
        // sort by timestamp
        let list = _.values(data).sort(function(a,b){
            return (b.closedTimestamp - a.closedTimestamp);
        });
        self.setState((prevState, props) => {
          return {err:null, loaded:true, data: list, loadedTimestamp:timestamp};
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
    this.setState(function(prevState, props){
        return {
            pair:props.pair
        };
    }, function(){
        this._loadData();
    });
}

componentDidMount()
{
    this._isMounted = true;
    let features = serviceRegistry.getExchangeFeatures(this.props.exchange, ['closedOrders']);
    this._withoutPair = features['closedOrders'].withoutPair;
    this._getBaseUrls(this.props.exchange);
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

    const orderType = (type) => {
        let s = type.toUpperCase();
        let style = {color:'#009933'};
        if ('sell' == type)
        {
            style.color = '#cc3300';
        }
        return <span style={style}>{s}</span>
    }

    const RetrieveOnlyStarredPairs = () => {
        if (undefined !== this.props.pair || this._withoutPair)
        {
            return null
        }
        return (
            <div style={{color:'#e64400'}}>
                For performance reasons, completed orders will be retrieved only for starred pairs
            </div>
        )
    }

    const formatClosedTimestamp = (item) => {
        if (null !== item.closedTimestamp)
        {
            return dateTimeHelper.formatDateTime(item.closedTimestamp * 1000);
        }
        if (null !== item.openTimestamp)
        {
            return dateTimeHelper.formatDateTime(item.openTimestamp * 1000);
        }
        // order was cancelled
        return 'N/A';
    }

    const styleCancelled = {color:'#e64400'};

    const getNewOrderUrl = (item) => {
        if (null === item.actualRate)
        {
            return ('N/A')
        }
        return (<a href={item.newOrderUrl}>{item.actualRate.toFixed(8)}</a>)
    }

    return (
      <div className="animated fadeIn col-lg-5 p-0">
        <RetrieveOnlyStarredPairs/>
        <ComponentLoadedTimestamp timestamp={this.state.loadedTimestamp} err={this.state.err} onManualRefresh={this._handleManualRefresh}/>
        <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
          <thead className="thead-inverse">
            <tr>
              <th>DATE</th>
              <th>TYPE</th>
              <th>PAIR</th>
              <th className="text-right">RATE</th>
              <th className="text-right">QTY</th>
              <th className="text-right">PRICE</th>
            </tr>
          </thead>
          <tbody>
            {
              _.map(this.state.data).map((item, index) => {
                let style = {};
                if (0 == item.quantity)
                {
                    style = styleCancelled;
                }
                return <tr key={index}>
                    <td>{formatClosedTimestamp(item)}</td>
                    <td>{orderType(item.orderType)}</td>
                    <td><a href={item.pricesUrl}>{item.pair}</a></td>
                    <td className="text-right" style={style}>{getNewOrderUrl(item)}</td>
                    <td className="text-right" style={style}>{item.quantity.toFixed(8)}</td>
                    <td className="text-right" style={style}>{item.actualPrice.toFixed(8)}</td>
                </tr>
              })
            }
          </tbody>
        </table>
      </div>
    )
}

}

export default CompletedOrders;
