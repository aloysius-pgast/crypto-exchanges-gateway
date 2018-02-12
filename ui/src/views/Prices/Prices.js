import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import tradingViewHelper from '../../lib/TradingViewHelper';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import Ticker from '../../components/Ticker';
import CandleSticks from '../../components/CandleSticks';
import serviceRegistry from '../../lib/ServiceRegistry';

class Prices extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   let exchangeInstance = serviceRegistry.getExchange(this.props.data.exchange);
   this.state = {
       exchange:this.props.data.exchange,
       exchangeType:exchangeInstance.type,
       loaded:false,
       err: null,
       data:null,
       pair:undefined === this.props.match.params.pair ? null : this.props.match.params.pair
   };
   this._handleSelectPair = this._handleSelectPair.bind(this);
}

_handleSelectPair(pair)
{
    this.setState((prevState, props) => {
      return {pair:pair};
    });
}

_loadData()
{
    let self = this;
    restClient.getPairs(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          return {err:null, loaded:true, data: data};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
          return {loaded:true, err:err};
        });
    });
}

componentWillReceiveProps(nextProps)
{
    let exchangeId = nextProps.data.exchange;
    let exchangeInstance = serviceRegistry.getExchange(exchange);
    this.setState(function(prevState, props){
        return {
            loaded:false,
            exchange:exchange,
            exchangeType:exchangeInstance.type,
            pair:undefined === nextProps.match.params.pair ? null : nextProps.match.params.pair
        };
    }, function(){
        this._loadData();
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._loadData();
}

render() {
    if (!this.state.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }

    const TickerComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        return (
            <div className="animated fadeIn">
              <br/>
                <h6>TICKER</h6>
                <Ticker exchange={this.state.exchange} pair={this.state.pair}/>
            </div>
        )
    }

    const CandleSticksComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        // no chart support ?
        if (!tradingViewHelper.hasChartSupport(this.state.exchangeType))
        {
            return null;
        }
        return (
            <div className="animated fadeIn">
              <br/>
                <h6>CHART</h6>
                <CandleSticks exchange={this.state.exchangeType} pair={this.state.pair}/>
            </div>
        )
    }

    return (
        <div className="animated fadeIn">
            <br/>
            <PairChooser exchange={this.state.exchange} pairs={this.state.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            <TickerComponent/>
            <CandleSticksComponent/>
        </div>
    );
}

}

export default Prices;
