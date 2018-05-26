import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import dataStore from '../../lib/DataStore';

//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import DemoModeWarning from '../../components/DemoModeWarning';
import OpenOrders from '../../components/OpenOrders';
import CompletedOrders from '../../components/CompletedOrders';

class MyOrders extends Component
{

constructor(props) {
   super(props);
   let pair = undefined === this.props.match.params.pair ? null : this.props.match.params.pair;
   if (null === pair)
   {
       pair = dataStore.getExchangeData(this.props.data.exchange, 'pair');
   }
   this.state = {
       exchange:this.props.data.exchange,
       pair:pair,
       pairs:{
           loaded:false,
           err:null,
           data:null
       }
   };
   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._demoMode = false;
}

_handleSelectPair(pair)
{
    this.setState((prevState, props) => {
      return {pair:pair};
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
            let pair = self.state.pair;
            if (undefined === data[pair])
            {
                pair = null;
            }
            return {pairs:{loaded:true, data:data, err:null},pair:pair};
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
    let exchangeId = nextProps.data.exchange;
    let pair = undefined === nextProps.match.params.pair ? null : nextProps.match.params.pair;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchangeId);
    this.setState(function(prevState, props){
        return {
            pairs:{
                loaded:false,
                err:null,
                data:null
            },
            exchange:exchangeId,
            pair:pair
        };
    }, function(){
        this._loadPairs();
    });
}

shouldComponentUpdate(nextProps, nextState)
{
    if (null === this.state.pair || this.state.exchange != nextState.exchange || this.state.pair != nextState.pair || this.state.pairs.loaded != nextState.pairs.loaded)
    {
        return true;
    }
    return false;
}

componentDidMount()
{
    this._isMounted = true;
    let exchangeId = this.props.data.exchange;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchangeId);
    this._loadPairs();
}

render()
{
    if (null !== this.state.pairs.err)
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

    const Orders = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        return (
            <div>
                <br/>
                <h6>OPEN ORDERS</h6>
                <OpenOrders exchange={this.state.exchange} pair={this.state.pair}/>
                <br/>
                <h6>COMPLETED ORDERS</h6>
                <CompletedOrders exchange={this.state.exchange} pair={this.state.pair}/>
            </div>
        )
    }
    return (
      <div className="animated fadeIn">
        <DemoMode/>
        <br/>
        <PairChooser exchange={this.state.exchange} pairs={this.state.pairs.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
        <Orders/>
      </div>
    )
}

}

export default MyOrders;
