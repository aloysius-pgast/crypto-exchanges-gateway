import React, { Component } from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';
import dataStore from '../../lib/DataStore';

class PairChooser extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.callPairEventHandler = false;
    this.state = {
        pairs:props.pairs,
        market:null,
        marketPairs:null,
        pair:undefined === this.props.pair ? null : this.props.pair
    }
    // check datastore if we don't have a pair in props
    if (null === this.state.pair)
    {
        let pair = dataStore.getExchangeData(this.props.exchange, 'pair');
        if (null !== pair)
        {
            this.state.pair = pair;
            // we should call pair event handler in parent
            this.callPairEventHandler = true;
        }
    }
    // update datastore
    else
    {
        dataStore.setExchangeData(this.props.exchange, 'pair', this.state.pair);
    }
    if (null !== this.state.pair)
    {
        // unknown pair ?
        if (undefined === this.state.pairs[this.state.pair])
        {
            this.state.pair = null;
        }
    }
    this.state.markets = this._getMarkets(this.state.pairs);
    // get market & marketPairs
    if (null !== this.state.pair)
    {
        let arr = this.state.pair.split('-');
        this.state.market = arr[0];
        this.state.marketPairs = this._getMarketPairs(this.state.pairs, this.state.market);
    }
    // do we need to call pair event handler in parent ?
    if (this.callPairEventHandler)
    {
        if (undefined !== this.props.OnSelectPair)
        {
            this.props.OnSelectPair(this.state.pair);
        }
    }
}

_handleStarPair(flag)
{
    let key = 'starredPair:' + this.state.pair;
    // add to favorites
    if (flag)
    {
        let timestamp = parseInt(new Date().getTime() / 1000);
        let data = JSON.stringify({exchange:this.props.exchange,pair:this.state.pair,timestamp:timestamp});
        window.localStorage.setItem(key, data);
    }
    else
    {
        // remove from favorites
        window.localStorage.removeItem(key);
    }
    this.setState((prevState, props) => {
        return {starred:flag};
    });
}

_handleSelectMarket(event)
{
    let market = event.target.value;
    if ('' === market)
    {
        market = null;
    }
    let marketPairs = this._getMarketPairs(this.state.pairs, market);
    this.setState((prevState, props) => {
        return {market:market,marketPairs:marketPairs,pair:null};
    }, function(){
        // don't update datastore here
        this.props.OnSelectPair(null);
    });
}

_handleSelectPair(event)
{
    let pair = event.target.value;
    if ('' === pair)
    {
        pair = null;
    }
    this.setState((prevState, props) => {
        return {pair:pair};
    }, function(){
        // update datastore
        dataStore.setExchangeData(this.props.exchange, 'pair', pair);
        // call handler
        if (undefined !== this.props.OnSelectPair)
        {
            this.props.OnSelectPair(pair);
        }
    });
}

_getMarkets(pairs)
{
    let markets = {};
    _.forEach(pairs, function(item){
        markets[item.baseCurrency] = true;
    });
    let marketList = Object.keys(markets).sort();
    return marketList;
}

_getMarketPairs(pairs, market)
{
    if (null === market)
    {
        return null;
    }
    let marketPairs = [];
    _.forEach(pairs, (item, index) => {
        if (item.baseCurrency == market)
        {
            marketPairs.push(item);
        }
    });
    return marketPairs.sort(function(a,b){
        return (a.currency < b.currency) ? -1 : 1;
    });
}

componentDidMount()
{
    this._isMounted = true;
}

componentWillUnmount()
{
    this._isMounted = false;
}

// nothing to do, we already know the pair
componentWillReceiveProps(nextProps) {}

render()
{
    const StarPair = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        if (!window.ctx.hasLocalStorage)
        {
            return null;
        }
        // already starred
        let key = 'starredPair:' + this.state.pair;
        let value = window.localStorage.getItem(key);
        if (null !== value)
        {
            return (
                <button type="button" className="btn btn-link" style={{fontSize:'1.4rem'}} onClick={this._handleStarPair.bind(this, false)}>
                  <i className="fa fa-star"/>
                </button>
            )
        }
        return (
            <button type="button" className="btn btn-link" style={{fontSize:'1.4rem'}} onClick={this._handleStarPair.bind(this, true)}>
              <i className="fa fa-star-o"/>
            </button>
        )
    }

    const MarketPairs = () => {
        if (null === this.state.marketPairs)
        {
            return null;
        }
        return (
            <div>
              <span style={{minWidth:'70px',display:'inline-block'}}>C<small>URRENCY</small></span>&nbsp;&nbsp;
              <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectPair.bind(this)} value={null === this.state.pair ? '' : this.state.pair}>
                <option value="">Choose</option>
                {
                  _.map(this.state.marketPairs).map((item, index) => {
                    return <option key={index} value={item.pair}>{item.currency}</option>
                  })
                }
              </select>
              <StarPair/>
            </div>
        )
    }

    const Markets = () => {
        return (
            <div style={{marginBottom:'5px'}}>
              <span style={{minWidth:'70px',display:'inline-block'}}>M<small>ARKET</small></span>&nbsp;&nbsp;
              <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectMarket.bind(this)} value={null === this.state.market ? '' : this.state.market}>
                <option value="">Choose</option>
                {
                  _.map(this.state.markets).map((item, index) => {
                    return <option key={index} value={item}>{item}</option>
                  })
                }
              </select>
            </div>
        )
    }

    return (
        <div>
            <Markets/>
            <MarketPairs/>
        </div>
    )
}

}

export default PairChooser;
