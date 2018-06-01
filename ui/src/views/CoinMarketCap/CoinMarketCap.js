import React, { Component } from 'react';

import restClient from '../../lib/RestClient';

//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import CoinMarketCapTickers from '../../components/CoinMarketCapTickers';
import CoinMarketCapSymbolChooser from '../../components/CoinMarketCapSymbolChooser';

const limit = 20;

class CoinMarketCap extends Component
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
    restClient.getCoinMarketCapSymbols().then(function(data){
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
            <CoinMarketCapTickers symbol={this.state.symbol} limit={limit}/>
        )
    }

    return (
      <div>
        <br/>
        <CoinMarketCapSymbolChooser limit={limit} symbols={this.state.symbols.data} symbol={this.state.symbol} OnSelectSymbol={this._handleSelectSymbol}/>
        <br/>
        <Tickers/>
      </div>
    )
}

}

export default CoinMarketCap;
