import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import dataStore from '../../lib/DataStore';

//-- components
import DemoModeWarning from '../../components/DemoModeWarning';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import Order from '../../components/Order';

class NewOrder extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   let rate = null;
   let quantity = null;
   if (undefined !== this.props.match.params.rate && !isNaN(this.props.match.params.rate))
   {
       let floatValue = parseFloat(this.props.match.params.rate);
       if (0 != floatValue)
       {
           rate = floatValue.toFixed(8);
       }
   }
   if (undefined !== this.props.match.params.quantity && !isNaN(this.props.match.params.quantity))
   {
       let floatValue = parseFloat(this.props.match.params.quantity);
       if (0 != floatValue)
       {
           quantity = floatValue.toFixed(8);
       }
   }
   let pair = undefined === this.props.match.params.pair ? null : this.props.match.params.pair;
   if (null === pair)
   {
       pair = dataStore.getExchangeData(this.props.data.exchange, 'pair');
   }
   this.state = {
       exchange:this.props.data.exchange,
       pairs:{
           loaded:false,
           err:null,
           data:null
       },
       balances:{
           loaded:false,
           loading:false,
           loadedTimestamp:0,
           err:null,
           data:null
       },
       ticker:{
           loaded:false,
           loading:false,
           loadedTimestamp:0,
           err:null,
           data:null
       },
       pair:pair,
       rate:rate,
       quantity:quantity
   };
   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._handleCloseOrder = this._handleCloseOrder.bind(this);
   this._demoMode = false;
   this._feesPercent = serviceRegistry.getFees(this.props.data.exchange)
}

_handleSelectPair(pair)
{
    let previousPair = this.state.pair;
    this.setState((prevState, props) => {
        return {
            pair:pair,
            ticker:{loaded:false,loadedTimestamp:0,err:null,data:null},
            balances:{loaded:false,loadedTimestamp:0,err:null,data:null}
        };
    }, function(){
        if (null !== pair && previousPair != pair)
        {
            this._loadTicker(pair);
            this._loadBalances(pair);
        }
    });
}

_handleCloseOrder()
{
    let pair = this.state.pair;
    this.setState((prevState, props) => {
        return {
            ticker:{loaded:false,loadedTimestamp:0,err:null,data:null},
            balances:{loaded:false,loadedTimestamp:0,err:null,data:null}
        };
    }, function(){
        if (null !== pair)
        {
            this._loadTicker(pair);
            this._loadBalances(pair);
        }
    });
}

_loadTicker(pair)
{
    let self = this;
    restClient.getTickers(this.state.exchange, [this.state.pair]).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        // pair has changed
        if (self.state.pair != pair)
        {
            return;
        }
        let timestamp = new Date().getTime();
        // no ticker for this pair ?
        if (undefined === data[pair])
        {
            let err = 'No ticker found for ' + pair;
            self.setState((prevState, props) => {
                return {ticker:{err:err, loaded:true, data: null, loadedTimestamp:timestamp}};
            });
            return;
        }
        self.setState((prevState, props) => {
            return {ticker:{err:null, loaded:true, data: data[pair], loadedTimestamp:timestamp}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
            return {ticker:{err:err, loaded:true, data: null, loadedTimestamp:timestamp}};
        });
    });
}

_loadBalances(pair)
{
    let self = this;
    let arr = pair.split('-');
    restClient.getBalances(this.state.exchange, [arr[0],arr[1]]).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        // pair has changed
        if (self.state.pair != pair)
        {
            return;
        }
        let balances = {
            baseCurrency:0,
            currency:0
        }
        if (undefined !== data[arr[0]])
        {
            balances.baseCurrency = data[arr[0]].available;
        }
        if (undefined !== data[arr[1]])
        {
            balances.currency = data[arr[1]].available;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
          return {balances:{loaded:true, data:balances, err:null, loadedTimestamp:timestamp}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        //alert(err);
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
            return {balances:{loaded:true, data:null, err:err, loadedTimestamp:timestamp}};
        });
    });
}

_loadPairs(cb)
{
    let self = this;
    restClient.getPairs(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          let pair = self.state.pair;
          if (undefined === data[pair])
          {
            pair = null;
          }
          return {pairs:{loaded:true, data:data, err:null},pair:pair};
      }, function(){
          cb.call(self);
      });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
            return {pairs:{loaded:true, data:null, err:err}};
        });
    });
}

componentWillReceiveProps(nextProps)
{
    let exchange = nextProps.data.exchange;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchange);
    this._feesPercent = serviceRegistry.getFees(exchange);
    let rate = null;
    let quantity = null;
    if (undefined !== nextProps.match.params.rate && !isNaN(nextProps.match.params.rate))
    {
        let floatValue = parseFloat(nextProps.match.params.rate);
        if (0 != floatValue)
        {
            rate = floatValue.toFixed(8);
        }
    }
    if (undefined !== nextProps.match.params.quantity && !isNaN(nextProps.match.params.quantity))
    {
        let floatValue = parseFloat(nextProps.match.params.quantity);
        if (0 != floatValue)
        {
            quantity = floatValue.toFixed(8);
        }
    }
    this.setState(function(prevState, props){
        return {
            exchange:exchange,
            pairs:{
                loaded:false,
                err:null,
                data:null
            },
            balances:{
                loaded:false,
                loadedTimestamp:0,
                err:null,
                data:null
            },
            ticker:{
                loaded:false,
                loadedTimestamp:0,
                err:null,
                data:null
            },
            pair:undefined === nextProps.match.params.pair ? null : nextProps.match.params.pair,
            rate:rate,
            quantity:quantity
        };
    }, function(){
        this._loadPairs(function(){
            // do we already have a pair ? => load ticker
            if (null !== this.state.pair)
            {
                this._loadTicker(this.state.pair);
                this._loadBalances(this.state.pair);
            }
        });
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    let exchange = this.props.data.exchange;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchange);
    this._feesPercent = serviceRegistry.getFees(exchange);
    this._loadPairs(function(){
        // do we already have a pair ? => load ticker & balance
        if (null !== this.state.pair)
        {
            if (!this.state.ticker.loading && !this.state.ticker.loaded)
            {
                this._loadTicker(this.state.pair);
            }
            if (!this.state.balances.loading && !this.state.balances.loaded)
            {
                this._loadBalances(this.state.pair);
            }
        }
    });
}

render() {
    if (null !== this.state.pairs.err || null !== this.state.balances.err || null !== this.state.ticker.err)
    {
        if (null !== this.state.balances.err)
        {
            if (undefined !== this.state.balances.err.extError &&
                'ExchangeError.Forbidden.InvalidAuthentication' == this.state.balances.err.extError.errorType)
            {
                return (
                    <div>
                        <br/>
                        <h6 className="text-danger">Authentication was refused by exchange</h6>
                    </div>
                );
            }
        }
        return null;
    }

    if (!this.state.pairs.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }

    const DemoMode = () => {
        if (!this._demoMode)
        {
            return null
        }
        return (
            <div>
                <br/>
                <DemoModeWarning type="exchange" exchange={this.state.exchange}/>
            </div>
        )
    }

    const BuyOrderComponent = () => {
        let arr = this.state.pair.split('-');
        let classNames = "float-lg-left mr-sm-auto mr-md-5";
        return (
            <div className={classNames} style={{minWidth:'40%'}}>
              <Order orderType="buy" exchange={this.state.exchange} feesPercent={this._feesPercent} quantity={this.state.quantity} rate={this.state.rate} pair={this.state.pair} ticker={this.state.ticker.data} balance={this.state.balances.data.baseCurrency} limits={this.state.pairs.data[this.state.pair].limits} balanceCurrency={arr[0]} baseCurrency={arr[0]} currency={arr[1]} onClose={this._handleCloseOrder}/>
            </div>
        )
    }

    const SellOrderComponent = () => {
        let arr = this.state.pair.split('-');
        let classNames = "float-lg-left mr-sm-auto mr-md-5";
        return (
            <div className={classNames} style={{minWidth:'40%'}}>
              <Order orderType="sell" exchange={this.state.exchange} feesPercent={this._feesPercent} quantity={this.state.quantity} rate={this.state.rate} pair={this.state.pair} ticker={this.state.ticker.data} balance={this.state.balances.data.currency} limits={this.state.pairs.data[this.state.pair].limits} balanceCurrency={arr[1]} baseCurrency={arr[0]} currency={arr[1]} onClose={this._handleCloseOrder}/>
            </div>
        )
    }

    const FormContainer = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        if (!this.state.ticker.loaded || !this.state.balances.loaded)
        {
            return (
                <ComponentLoadingSpinner/>
            )
        }
        return (
            <div>
              <BuyOrderComponent/>
              <SellOrderComponent/>
            </div>
        )
    }
    return (
        <div className="animated fadeIn">
            <DemoMode/>
            <br/>
            <PairChooser exchange={this.state.exchange} pairs={this.state.pairs.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            <br/>
            <FormContainer/>
        </div>
    );
}

}

export default NewOrder;
