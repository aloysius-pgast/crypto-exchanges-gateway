import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import routeRegistry from '../../lib/RouteRegistry';
import serviceRegistry from '../../lib/ServiceRegistry';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class MarketOverviewTickers extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        loaded:false,
        loadedTimestamp:0,
        err: null,
        data:[]
    };
    this._pairsPerExchange = {};
    this._baseUrlList = {};
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
}

_handleManualRefresh()
{
    this._loadData();
}

_reloadData()
{
    this.setState((prevState, props) => {
        return {err:null, loaded:false, data:null};
    }, function(){
        this._loadData();
    });
}

_loadData()
{
    let self = this;
    let arr = [];
    _.forEach(this._pairsPerExchange, (pairs,exchange) => {
        arr.push(new Promise((resolve, reject) => {
            restClient.getTickers(exchange, pairs).then(function(data){
                resolve({exchange:exchange,data:data,success:true});
            }).catch (function(err){
                resolve({exchange:exchange,data:null,success:false,err:err});
            });
        }));
    });
    Promise.all(arr).then(function(values){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let err = null;
        let map = {};
        _.forEach(values, (entry) => {
            if (!entry.success)
            {
                err = entry.err;
            }
            else
            {
                map[entry.exchange] = entry.data;
            }
        });
        let data = [];
        _.forEach(self.props.pairs, (entry) => {
            if (undefined !== map[entry.exchange] && undefined !== map[entry.exchange][entry.pair])
            {
                let obj = map[entry.exchange][entry.pair];
                obj.exchange = entry.exchange;
                obj.exchangeName = serviceRegistry.getExchangeName(obj.exchange);
                obj.pricesUrl = self._baseUrlList[obj.exchange].prices + entry.pair;
                obj.orderBookUrl = self._baseUrlList[obj.exchange].orderBooks + entry.pair;
                data.push(obj);
            }
        });
        self.setState({loaded:true,err:err,data:data,loadedTimestamp:timestamp});
    });
}

_getBaseUrlList()
{
    let routes = routeRegistry.getExchangesRoutes();
    _.forEach(routes, (item, exchange) => {
        this._baseUrlList[exchange] = {
            prices:'#' + routes[exchange]['prices']['path'] + '/',
            orderBooks:'#' + routes[exchange]['orderBooks']['path'] + '/'
        }
    });
}

_buildPairsPerExchange()
{
    if (0 == this.props.pairs)
    {
        return;
    }
    _.forEach(this.props.pairs, (obj) => {
        if (undefined === this._pairsPerExchange[obj.exchange])
        {
            this._pairsPerExchange[obj.exchange] = [];
        }
        this._pairsPerExchange[obj.exchange].push(obj.pair);
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps) {}

componentDidMount()
{
    this._isMounted = true;
    this._getBaseUrlList();
    this._buildPairsPerExchange();
    this._loadData();
}

render()
{
    // do nothing if we have no pairs
    if (0 == this.props.pairs.length)
    {
        return null
    }
    if (!this.state.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }
    return (
      <div className="animated fadeIn col-lg-6 p-0">
        <ComponentLoadedTimestamp timestamp={this.state.loadedTimestamp} err={this.state.err} onManualRefresh={this._handleManualRefresh}/>
        <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
          <thead className="thead-inverse">
            <tr>
              <th>EXCHANGE</th>
              <th>PAIR</th>
              <th className="text-right">24H CHANGE</th>
              <th className="text-right">LAST</th>
              <th className="text-right">BID</th>
              <th className="text-right">ASK</th>
              <th className="text-right">24H HIGH</th>
              <th className="text-right">24H LOW</th>
              <th className="text-right">VOL</th>
            </tr>
            </thead>
            <tbody>
            {
              _.map(this.state.data, (item, index) => {
                let percent_change = item.priceChangePercent;
                let className_percent_change = '';
                if (percent_change < 0)
                {
                    className_percent_change = 'text-danger';
                }
                else if (percent_change > 0)
                {
                    className_percent_change = 'text-success';
                }
                return <tr key={index}>
                    <td>{item.exchangeName}</td>
                    <td><a href={item.pricesUrl}>{item.pair}</a></td>
                    <td className="text-right"><span className={className_percent_change}>{percent_change.toFixed(3)} %</span></td>
                    <td className="text-right"><a href={item.orderBookUrl}>{item.last.toFixed(8)}</a></td>
                    <td className="text-right"><a href={item.orderBookUrl}>{item.buy.toFixed(8)}</a></td>
                    <td className="text-right"><a href={item.orderBookUrl}>{item.sell.toFixed(8)}</a></td>
                    <td className="text-right">{item.high.toFixed(8)}</td>
                    <td className="text-right">{item.low.toFixed(8)}</td>
                    <td className="text-right">{item.volume.toFixed(8)}</td>
                </tr>
              })
            }
            </tbody>
          </table>
      </div>
  )
}

}

export default MarketOverviewTickers;
