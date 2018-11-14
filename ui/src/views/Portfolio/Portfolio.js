import React, { Component } from 'react';

import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import formatNumber from '../../lib/FormatNumber';
//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PortfolioCurrencyChooser from '../../components/PortfolioCurrencyChooser';
import PortfolioBalances from '../../components/PortfolioBalances';
import PortfolioChart from '../../components/PortfolioChart';

// list of fiat currencies
const fiatCurrencies = ['BGN','CAD','BRL','HUF','DKK','JPY','ILS','TRY','RON','GBP','PHP','HRK','NOK','ZAR','MXN','AUD','USD','KRW','HKD','EUR','ISK','CZK','THB','MYR','NZD','PLN','CHF','SEK','CNY','SGD','INR','IDR','RUB'];

class Portfolio extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   // exchanges with balance support
   this._exchanges = {};
   this._demoMode = false;
   _.forEach(serviceRegistry.getExchanges(), (e,id) => {
      if (undefined === e.features['balances'] || !e.features['balances'].enabled)
      {
          return;
      }
      if (e.demo)
      {
          this._demoMode = true;
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
    restClient.getPortfolioCurrencies().then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
            return {currencies:{loaded:true, err:null, data: data}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
            return {currencies:{loaded:false, err:err, data: null}};
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
                if (!obj.convertedPrice[convertCurrency].unknownPrice)
                {
                    obj.price = obj.convertedPrice[convertCurrency].price;
                }
                else
                {
                    obj.price = null;
                }
            }
            balances.push(obj);
        });
        balances.sort(function(a,b) {
            return b.price - a.price;
        });
        if ('USD' != convertCurrency)
        {
            if (!data.convertedPrice[convertCurrency].unknownPrice)
            {
                data.price = data.convertedPrice[convertCurrency].price;
            }
            else
            {
                data.price = null;
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

    const DemoMode = () => {
        if (!this._demoMode)
        {
            return null;
        }
        return (
            <div style={{color:'#e64400'}}>
                <br/>
                Some exchanges are running in <span className="font-italic">demo mode</span>. Random portfolio will be returned by gateway.
            </div>
        )
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
        // not a fiat currency
        if (-1 == fiatCurrencies.indexOf(this.state.balances.data.convertCurrency))
        {
            precision = 8;
        }
        let priceStr = 'N/A';
        if (null !== this.state.balances.data.price)
        {
            priceStr = formatNumber.formatFloat(this.state.balances.data.price, precision, {truncate:true});
        }
        return (
            <div className={classNames}>
                <h7>PORTFOLIO VALUE =~ {priceStr} {this.state.balances.data.convertCurrency}</h7>
                <br/>
                <br/>
                <PortfolioChart isRefreshing={this.state.balances.isRefreshing} isFirstLoad={this.state.balances.isFirstLoad} loaded={this.state.balances.loaded} updateTimestamp={this.state.balances.updateTimestamp} err={this.state.balances.err} data={this.state.balances.data} OnRefresh={this._handleRefresh}/>
                <PortfolioBalances currency={this.state.balances.data.convertCurrency} isRefreshing={this.state.balances.isRefreshing} isFirstLoad={this.state.balances.isFirstLoad} loaded={this.state.balances.loaded} updateTimestamp={this.state.balances.updateTimestamp} err={this.state.balances.err} data={this.state.balances.data} OnRefresh={this._handleRefresh}/>
            </div>
        )
    }

    return (
      <div>
        <DemoMode/>
        <br/>
        <Exchanges/>
        <br/>
        <PortfolioCurrencyChooser currencies={this.state.currencies.data} currency={this.state.currency} OnSelectCurrency={this._handleSelectCurrency}/>
        <br/>
        <Portfolio/>
      </div>
    )
}

}

export default Portfolio;
