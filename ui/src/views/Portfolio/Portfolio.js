import React, { Component } from 'react';

import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import CoinMarketCapCurrencyChooser from '../../components/CoinMarketCapCurrencyChooser';
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
       currency:null,
       currencies:{
           loaded:false,
           data:null,
           err:null
       },
       balances:{
           isFirstLoad:true,
           loaded:false,
           isRefreshing:false,
           updateTimestamp:0,
           err:null,
           data:null
       }
   }
   this._handleRefresh = this._handleRefresh.bind(this);
   this._handleSelectExchange = this._handleSelectExchange.bind(this);
   this._handleSelectCurrency = this._handleSelectCurrency.bind(this);
}

_handleRefresh()
{
    this.setState((prevState, props) => {
        let newState = {
            balances:prevState.balances
        }
        newState.balances.isRefreshing = true;
        newState.balances.isFirstLoad = false;
        return newState;
    },function(){
        this._loadBalances(false);
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
        let newState = {
            exchange:exchange,
            balances:{loaded:false, isRefreshing:false, isFirstLoad:true, data:null, err:null}
        };
        return newState;
    },function(){
        this._loadBalances(true);
    });
}

_handleSelectCurrency(currency)
{
    this.setState((prevState, props) => {
        let newState = {
            currency:currency,
            balances:{loaded:false, isRefreshing:false, isFirstLoad:true, data:null, err:null}
        };
        return newState;
    },function(){
        this._loadBalances(true);
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
    this._loadCurrencies();
}

_loadCurrencies()
{
    let self = this;
    restClient.getCoinMarketCapCurrencies().then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
            return {currencies:{loaded:true, currency:null, err:null, data: data}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
            return {currencies:{loaded:false, currency:null, err:err, data: null}};
        });
    });
}

_loadBalances(isFirstLoad)
{
    let self = this;
    let convertCurrency = this.state.currency;
    restClient.portfolio(this.state.exchange, convertCurrency).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let balances = [];
        _.forEach(data.balances, (obj, currency) => {
            obj.currency = currency;
            if ('USD' != convertCurrency)
            {
                if (undefined !== obj.convertedPrice[convertCurrency])
                {
                    obj.price = obj.convertedPrice[convertCurrency];
                }
                else
                {
                    obj.price = 0;
                }
            }
            balances.push(obj);
        });
        balances.sort(function(a,b) {
            return b.price - a.price;
        });
        if ('USD' != convertCurrency)
        {
            if (undefined !== data.convertedPrice[convertCurrency])
            {
                data.price = data.convertedPrice[convertCurrency];
            }
            else
            {
                data.price = 0;
            }
        }
        let d = {convertCurrency:convertCurrency, price:data.price, balances:balances};
        let newState = {balances:{loaded:true, isRefreshing:false, updateTimestamp:timestamp, isFirstLoad:isFirstLoad, data:d, err:null}};
        self.setState(newState);
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let newState = {balances:{loaded:true, isRefreshing:false, updateTimestamp:timestamp, isFirstLoad:isFirstLoad, data:null, err:err}};
        self.setState(newState);
    });
}

render()
{
    if (!this.state.currencies.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }
    if (null !== this.state.currencies.err)
    {
        return null;
    }

    const Exchanges = () => {
        return (
            <div>
                <h7>EXCHANGES</h7>
                <br/>
                <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectExchange.bind(this)} value={null === this.state.exchange ? '' : this.state.exchange}>
                  <option value="">All</option>
                  {
                    _.map(this._exchanges).map((e, index) => {
                      return <option key={index} value={e.id}>{e.name}</option>
                    })
                  }
                </select>
            </div>
        )
    }

    const Portfolio = () => {

        if (!this.state.balances.loaded)
        {
            return (
                <div className="animated fadeIn">
                  <br/>
                  <ComponentLoadingSpinner/>
                </div>
            )
        }
        if (null !== this.state.balances.err)
        {
            return null;
        }
        let classNames = '';
        if (this.state.balances.isFirstLoad)
        {
            classNames = 'animated fadeIn';
        }
        let precision = 4;
        if ('USD' != this.state.balances.data.convertCurrency)
        {
            precision = 8;
        }
        return (
            <div className={classNames}>
                <h7>PORTFOLIO VALUE =~ {this.state.balances.data.price.toFixed(precision)} {this.state.balances.data.convertCurrency}</h7>
                <br/>
                <br/>
                <PortfolioChart isRefreshing={this.state.balances.isRefreshing} isFirstLoad={this.state.balances.isFirstLoad} loaded={this.state.balances.loaded} updateTimestamp={this.state.balances.updateTimestamp} err={this.state.balances.err} data={this.state.balances.data} OnRefresh={this._handleRefresh}/>
                <PortfolioBalances currency={this.state.balances.data.convertCurrency} isRefreshing={this.state.balances.isRefreshing} isFirstLoad={this.state.balances.isFirstLoad} loaded={this.state.balances.loaded} updateTimestamp={this.state.balances.updateTimestamp} err={this.state.balances.err} data={this.state.balances.data} OnRefresh={this._handleRefresh}/>
            </div>
        )
    }

    return (
      <div>
        <br/>
        <Exchanges/>
        <br/>
        <CoinMarketCapCurrencyChooser currencies={this.state.currencies.data} currency={this.state.currency} OnSelectCurrency={this._handleSelectCurrency}/>
        <br/>
        <Portfolio/>
      </div>
    )
}

}

export default Portfolio;
