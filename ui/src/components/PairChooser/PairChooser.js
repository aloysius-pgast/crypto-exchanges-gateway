import React, { Component } from 'react';
import {
  Input,
  InputGroup,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import dataStore from '../../lib/DataStore';
import starredPairs from '../../lib/StarredPairs';

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
        pair:undefined === this.props.pair ? null : this.props.pair,
        currencyFilter:'',
        filteredCurrencies:[]
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

    let key = `starredPair:${this.props.exchange}:${this.state.pair}`;
    // add to favorites
    if (flag)
    {
        starredPairs.star(this.props.exchange, this.state.pair);
    }
    else
    {
        starredPairs.unstar(this.props.exchange, this.state.pair);
    }
    this.setState((prevState, props) => {
        return {starred:flag};
    });
}

_handleClearCurrencyFilter(event)
{
    this.setState((prevState, props) => {
        return {currencyFilter:'',filteredCurrencies:[]};
    });
}

_handleSetCurrencyFilter(event)
{
    let filter = event.target.value.trim().toUpperCase();
    let list = [];
    // extract currency if needed
    let currency = filter;
    let index = filter.indexOf('-');
    if (-1 !== index)
    {
        currency = currency.substr(index + 1);
    }
    if ('' != currency)
    {
        _.forEach(this.state.pairs, (e) => {
            // found matching pair
            if (-1 != e.currency.toUpperCase().indexOf(currency))
            {
                list.push(e.pair);
            }
        });
    }
    this.setState((prevState, props) => {
        return {currencyFilter:filter,filteredCurrencies:list};
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

_handleSelectFilteredPair(event)
{
    let pair = event.target.id;
    let arr = pair.split('-');
    let market = arr[0];
    let marketPairs = this._getMarketPairs(this.state.pairs, market);
    let starred = starredPairs.isStarred(this.props.exchange, pair);
    this.setState((prevState, props) => {
        return {market:market,marketPairs:marketPairs,pair:pair,currencyFilter:'',filteredCurrencies:[],starred:starred};
    }, function(){
        // update datastore
        dataStore.setExchangeData(this.props.exchange, 'pair', pair);
        // call event handler if defined
        if (undefined !== this.props.OnSelectPair)
        {
            this.props.OnSelectPair(this.state.pair);
        }
    });
}

_handleSelectPair(event)
{
    let pair = event.target.value;
    if ('' === pair)
    {
        pair = null;
    }
    let starred = false;
    if (null !== pair)
    {
        starred = starredPairs.isStarred(this.props.exchange, pair);
    }
    this.setState((prevState, props) => {
        return {pair:pair,starred:starred};
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

shouldComponentUpdate(nextProps, nextState)
{
    if (this.props.exchange != nextProps.exchange || this.props.pair != nextProps.pair ||
        this.state.market != nextState.market || this.state.currencyFilter != nextState.currencyFilter ||
        this.state.starred != nextState.starred
    )
    {
        return true;
    }
    return false;
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
componentWillReceiveProps(nextProps)
{
    let isNewPair = true;
    if (nextProps.exchange === this.props.exchange && nextProps.pair === this.props.pair)
    {
        isNewPair = false;
    }
    this.setState(function(prevState, props){
        return {
            exchange:nextProps.exchange,
            pair:nextProps.pair,
            pairs:nextProps.pairs
        };
    }, function(){
        if (null !== this.state.pair && isNewPair)
        {
            dataStore.setExchangeData(this.state.exchange, 'pair', this.state.pair);
        }
    });
}

render()
{
    const StarPair = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        if (!starredPairs.isSupported())
        {
            return null;
        }
        // already starred ?
        if (starredPairs.isStarred(this.props.exchange, this.state.pair))
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

    const PairsDropDown = () => {
      return (
          <Dropdown isOpen={0 != this.state.filteredCurrencies.length} toggle={() => {}}>
            <DropdownMenu className={0 != this.state.filteredCurrencies.length ? 'show' : ''}>
              {
                _.map(this.state.filteredCurrencies).map((item, index) => {
                  return  <DropdownItem key={index} id={item} onClick={this._handleSelectFilteredPair.bind(this)}>{item}</DropdownItem>
                })
              }
            </DropdownMenu>
          </Dropdown>
      )
    }

    return (
        <div>
            <InputGroup style={{maxWidth:'250px',marginBottom:'5px'}}>
              <Input type="text" placeholder="Enter currency or use menu" value={this.state.currencyFilter} onChange={this._handleSetCurrencyFilter.bind(this)}/>
              <button type="button" className="input-group-addon btn btn-link" onClick={this._handleClearCurrencyFilter.bind(this)}>
                  <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
              </button>
            </InputGroup>
            <PairsDropDown/>
            <Markets/>
            <MarketPairs/>
        </div>
    )
}

}

export default PairChooser;
