import React, { Component } from 'react';

import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PortfolioBalances from '../../components/PortfolioBalances';
import PortfolioChart from '../../components/PortfolioChart';

class Portfolio extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   // exchanges with balance support
   this._exchanges = {};
   _.forEach(serviceRegistry.getExchanges(), (e,id) => {
      if (undefined === e.features['balances'] || !e.features['balances'].enabled)
      {
          return;
      }
      this._exchanges[id] = {id:id,name:e.name};
   });
   this.state = {
       exchange:null,
       isFirstLoad:true,
       loaded:false,
       isRefreshing:false,
       updateTimestamp:0,
       err:null,
       data:null
   }
   this._handleRefresh = this._handleRefresh.bind(this);
   this._handleSelectExchange = this._handleSelectExchange.bind(this);
}

_handleRefresh()
{
    this.setState((prevState, props) => {
        let newState = {
            isRefreshing:true
        }
        return newState;
    },function(){
        this._loadData();
    });
}

_handleSelectExchange(e)
{
    let exchange = e.target.value;
    if ('' === exchange)
    {
        exchange = null;
    }
    this.setState((prevState, props) => {
        let newState = {loaded:false,isFirstLoad:true,exchange:exchange};
        return newState;
    },function(){
        this._loadData();
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
    this._loadData();
}

_loadData()
{
    let self = this;
    restClient.portfolio(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let balances = [];
        _.forEach(data.balances, (obj, currency) => {
            obj.currency = currency;
            balances.push(obj);
        });
        balances.sort(function(a,b) {
            return b.price - a.price;
        });
        let d = {price:data.price,balances:balances}
        let newState = {loaded:true, isRefreshing:false, updateTimestamp:timestamp, firstLoad:false, data:d};
        self.setState(newState);
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let newState = {isRefreshing:false, updateTimestamp:timestamp, firstLoad:false};
        self.setState(newState);
    });
}

render()
{
    if (!this.state.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }
    if (null !== this.state.err && !this.state.loaded)
    {
        return null;
    }
    let classNames = '';
    if (this.state.isFirstLoad)
    {
        classNames = 'animated fadeIn';
    }

    return (
      <div className={classNames}>
        <br/>
        <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectExchange.bind(this)} value={null === this.state.exchange ? '' : this.state.exchange}>
          <option value="">Overall</option>
          {
            _.map(this._exchanges).map((e, index) => {
              return <option key={index} value={e.id}>{e.name}</option>
            })
          }
        </select>
        <br/><br/>
        <h6>PORTFOLIO VALUE =~ {this.state.data.price.toFixed(4)} $</h6>
        <br/>
        <PortfolioChart isRefreshing={this.state.isRefreshing} isFirstLoad={this.state.isFirstLoad} loaded={this.state.loaded} updateTimestamp={this.state.updateTimestamp} err={this.state.err} data={this.state.data} OnRefresh={this._handleRefresh}/>
        <PortfolioBalances isRefreshing={this.state.isRefreshing} isFirstLoad={this.state.isFirstLoad} loaded={this.state.loaded} updateTimestamp={this.state.updateTimestamp} err={this.state.err} data={this.state.data} OnRefresh={this._handleRefresh}/>
      </div>
    )
}

}

export default Portfolio;
