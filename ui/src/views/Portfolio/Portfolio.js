import React, { Component } from 'react';

//-- components
import restClient from '../../lib/RestClient';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PortfolioBalances from '../../components/PortfolioBalances';
import PortfolioChart from '../../components/PortfolioChart';

class Portfolio extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isFirstLoad:true,
       loaded:false,
       isRefreshing:false,
       updateTimestamp:0       ,
       err:null,
       data:null
   }
   this._handleRefresh = this._handleRefresh.bind(this);
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
    restClient.portfolio().then(function(data){
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
            b.price - a.price;
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
        <h6>PORTFOLIO VALUE: {this.state.data.price.toFixed(4)} $</h6>
        <br/>
        <PortfolioChart isRefreshing={this.state.isRefreshing} isFirstLoad={this.state.isFirstLoad} loaded={this.state.loaded} updateTimestamp={this.state.updateTimestamp} err={this.state.err} data={this.state.data} OnRefresh={this._handleRefresh}/>
        <PortfolioBalances isRefreshing={this.state.isRefreshing} isFirstLoad={this.state.isFirstLoad} loaded={this.state.loaded} updateTimestamp={this.state.updateTimestamp} err={this.state.err} data={this.state.data} OnRefresh={this._handleRefresh}/>
      </div>
    )
}

}

export default Portfolio;
