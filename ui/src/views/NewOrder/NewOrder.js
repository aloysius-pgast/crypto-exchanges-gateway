import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';

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
   this.state = {
       exchange:this.props.data.exchange,
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
       pair:undefined === this.props.match.params.pair ? null : this.props.match.params.pair,
       rate:undefined === this.props.match.params.rate ? null : this.props.match.params.rate
   };
   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._handleCloseOrder = this._handleCloseOrder.bind(this);
   this._demoMode = false;
}

_handleSelectPair(pair)
{
    this.setState((prevState, props) => {
        return {
            pair:pair,
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
        alert(err);
        self.setState((prevState, props) => {
            return {pairs:{loaded:true, data:null, err:err, loadedTimestamp:timestamp}};
        });
    });
}

_loadPairs()
{
    let self = this;
    restClient.getPairs(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          return {pairs:{loaded:true, data:data, err:null}};
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
            rate:undefined === nextProps.match.params.rate ? null : this.props.match.params.rate
        };
    }, function(){
        this._loadPairs();
        // do we already have a pair ? => load ticker
        if (null !== this.state.pair)
        {
            this._loadTicker(this.state.pair);
            this._loadBalances(this.state.pair);
        }
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
    this._loadPairs();
    // do we already have a pair ? => load ticker & balance
    if (null !== this.state.pair)
    {
        this._loadTicker(this.state.pair);
        this._loadBalances(this.state.pair);
    }
}

render() {
    if (null !== this.state.pairs.err || null !== this.state.balances.err || null !== this.state.ticker.err)
    {
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
        let classNames = "float-lg-left mr-5";
        return (
            <div className={classNames} style={{minWidth:'40%'}}>
              <Order orderType="buy" exchange={this.state.exchange} rate={this.state.rate} pair={this.state.pair} ticker={this.state.ticker.data} balance={this.state.balances.data.baseCurrency} balanceCurrency={arr[0]} baseCurrency={arr[0]} currency={arr[1]} onClose={this._handleCloseOrder}/>
            </div>
        )
    }

    const SellOrderComponent = () => {
        let arr = this.state.pair.split('-');
        let classNames = "float-lg-left mr-5";
        return (
            <div className={classNames} style={{minWidth:'40%'}}>
              <Order orderType="sell" exchange={this.state.exchange} rate={this.state.rate} pair={this.state.pair} ticker={this.state.ticker.data} balance={this.state.balances.data.currency} balanceCurrency={arr[1]} baseCurrency={arr[0]} currency={arr[1]} onClose={this._handleCloseOrder}/>
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
