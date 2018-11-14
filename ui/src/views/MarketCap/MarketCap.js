import React, { Component } from 'react';

import restClient from '../../lib/RestClient';

//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import MarketCapTickers from '../../components/MarketCapTickers';
import MarketCapSymbolChooser from '../../components/MarketCapSymbolChooser';

const limit = 20;

class MarketCap extends Component
{

constructor(props) {
   super(props);
   this.state = {
       symbol:null,
       symbols:{loaded:false, err:null, data: null}
   }
   this._handleSelectSymbol = this._handleSelectSymbol.bind(this);
}

_handleSelectSymbol(symbol)
{
    this.setState((prevState, props) => {
        return {symbol:symbol};
        return newState;
    });
}

componentWillReceiveProps(nextProps) {}

componentDidMount()
{
    this._isMounted = true;
    this._loadSymbols();
}

_loadSymbols()
{
    let self = this;
    restClient.getMarketCapSymbols().then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
            return {symbols:{loaded:true, err:null, data: data}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
            return {symbols:{loaded:false, err:err, data: null}};
        });
    });
}

render()
{
    if (!this.state.symbols.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }
    if (null !== this.state.symbols.err)
    {
        return null;
    }

    const Tickers = () => {

        if (null === this.state.symbol)
        {
            return null;
        }
        return (
            <MarketCapTickers symbol={this.state.symbol} limit={limit}/>
        )
    }

    return (
      <div>
        <br/>
        <div>
            Data provided by<br/>
            <a target="_blank" href="https://coincodex.com/"><img width="125" src="img/coincodex.png"/></a>
        </div>
        <br/>
        <MarketCapSymbolChooser limit={limit} symbols={this.state.symbols.data} symbol={this.state.symbol} OnSelectSymbol={this._handleSelectSymbol}/>
        <br/>
        <Tickers/>
      </div>
    )
}

}

export default MarketCap;
