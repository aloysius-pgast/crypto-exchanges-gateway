import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import dateTimeHelper from '../../lib/DateTimeHelper';
import routeRegistry from '../../lib/RouteRegistry';
import serviceRegistry from '../../lib/ServiceRegistry';
import starredPairs from '../../lib/StarredPairs';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class OpenOrders extends Component
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

_handleCancel(orderNumber)
{
    let self = this;
    restClient.cancelOrder(this.props.exchange, orderNumber).then(function(data){
        self._reloadData();
    }).catch (function(err){
        if (undefined !== err.response && undefined !== err.response.data && undefined !== err.response.data.error)
        {
            alert(err.response.data.error);
            return;
        }
        alert('An error ocurred');
    });
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
    restClient.getOpenOrders(this.props.exchange, pairs).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        // add url
        _.forEach(data, (item, orderNumber) => {
            item.pricesUrl = self._pricesBaseUrl + item.pair;
            item.newOrderUrl = self._newOrderBaseUrl + item.pair + '/' + item.targetRate;
        });
        // sort by timestamp
        let list = _.values(data).sort(function(a,b){
            return (b.openTimestamp - a.openTimestamp);
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
    let features = serviceRegistry.getExchangeFeatures(this.props.exchange, ['openOrders']);
    this._withoutPair = features['openOrders'].withoutPair;
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

    const cancelButton = (orderNumber) => {
        return (
            <button type="button" className="btn btn-link p-0" onClick={this._handleCancel.bind(this, orderNumber)}>
                <i className="fa fa-remove" style={{fontSize:'1.2rem',color:'#cc3300'}}></i>
            </button>
        )
    }

    const RetrieveOnlyStarredPairs = () => {
        if (this._withoutPair)
        {
            return null
        }
        return (
            <div style={{color:'#e64400'}}>
                For performance reasons, open orders will be retrieved only for starred pairs
            </div>
        )
    }

    let self = this;
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
              <th className="text-right">REM</th>
              <th className="text-right">PRICE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {
              _.map(this.state.data).map((item, index) => {
                let classNamesRemainingQuantity = "text-right";
                // if order is partially field change color
                if (item.remainingQuantity != item.quantity)
                {
                    classNamesRemainingQuantity += " text-success";
                }
                return <tr key={index}>
                    <td>{dateTimeHelper.formatDateTime(item.openTimestamp * 1000)}</td>
                    <td>{orderType(item.orderType)}</td>
                    <td><a href={item.pricesUrl}>{item.pair}</a></td>
                    <td className="text-right"><a href={item.newOrderUrl}>{item.targetRate.toFixed(8)}</a></td>
                    <td className="text-right">{item.quantity.toFixed(8)}</td>
                    <td className={classNamesRemainingQuantity}>{item.remainingQuantity.toFixed(8)}</td>
                    <td className="text-right">{item.targetPrice.toFixed(8)}</td>
                    <td>{cancelButton(item.orderNumber)}</td>
                </tr>
              })
            }
          </tbody>
        </table>
      </div>
    )
}

}

export default OpenOrders;
