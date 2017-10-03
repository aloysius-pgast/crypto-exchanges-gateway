import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class Balances extends Component
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
    restClient.getBalances(this.props.exchange).then(function(data){
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
    this._reloadData();
}


componentDidMount()
{
    this._isMounted = true;
    this._loadData();
}

_formatFloat(value)
{
    let roundedValue = parseFloat(value.toFixed(8));
    // ensure we don't round value up
    if (roundedValue > value)
    {
        roundedValue = roundedValue - 0.00000001;
    }
    return roundedValue.toFixed(8);
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
              <th style={{width:'10%'}}>CURRENCY</th>
              <th className="text-right">AVAILABLE</th>
              <th className="text-right">ON ORDERS</th>
              <th className="text-right">TOTAL</th>
            </tr>
            </thead>
            <tbody>
            {
              _.map(this.state.data, (item, index) => {
                return <tr key={index}>
                    <td>{item.currency}</td>
                    <td className="text-right">{this._formatFloat(item.available)}</td>
                    <td className="text-right">{this._formatFloat(item.onOrders)}</td>
                    <td className="text-right">{this._formatFloat(item.total)}</td>
                </tr>
              })
            }
            </tbody>
          </table>
      </div>
    )
}

}

export default Balances;
