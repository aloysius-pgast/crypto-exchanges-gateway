import React, { Component } from 'react';
import {
  Input,
  InputGroup,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import dataStore from '../../lib/DataStore';

class CoinMarketCapCurrencyChooser extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        currencies:props.currencies,
        currency:props.currency,
        currencyFilter:'',
        filteredCurrencies:[]
    }
    // check datastore if we don't have a currency in props
    if (null === this.state.currency)
    {
        let currency = dataStore.getData('portfolioCurrency');
        if (null !== currency)
        {
            this.state.currency = currency;
        }
        else
        {
            this.state.currency = 'USD';
        }
    }
    // update datastore
    else
    {
        dataStore.setData('portfolioCurrency', this.state.currency);
    }
    // ensure currency exists
    // unknown currency, fallback to USD
    if (-1 == this.state.currencies.indexOf(this.state.currency))
    {
        this.state.currency = 'USD';
    }
    // call currency event handler in parent ?
    if (undefined !== this.props.OnSelectCurrency)
    {
        this.props.OnSelectCurrency(this.state.currency);
    }
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
    if ('' != filter)
    {
        _.forEach(this.state.currencies, (c) => {
            // found matching currency
            if (-1 != c.indexOf(filter))
            {
                list.push(c);
            }
        });
    }
    this.setState((prevState, props) => {
        return {currencyFilter:filter,filteredCurrencies:list};
    });
}

_handleSelectFilteredCurrency(event)
{
    let currency = event.target.id;
    this.setState((prevState, props) => {
        return {currency:currency,currencyFilter:'',filteredCurrencies:[]};
    }, function(){
        // update datastore
        dataStore.setData('portfolioCurrency', currency);
        // call event handler if defined
        if (undefined !== this.props.OnSelectCurrency)
        {
            this.props.OnSelectCurrency(this.state.currency);
        }
    });
}

_handleSelectCurrency(event)
{
    let currency = event.target.value;
    this.setState((prevState, props) => {
        return {currency:currency};
    }, function(){
        // update datastore
        dataStore.setData('portfolioCurrency', currency);
        // call handler
        if (undefined !== this.props.OnSelectCurrency)
        {
            this.props.OnSelectCurrency(this.state.currency);
        }
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

// Nothing to do, we already know the currency
componentWillReceiveProps(nextProps) {}

render()
{
    const Currencies = () => {
        return (
            <div style={{marginBottom:'5px'}}>
              <span style={{minWidth:'70px',display:'inline-block'}}>C<small>URRENCY</small></span>&nbsp;&nbsp;
              <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectCurrency.bind(this)} value={this.state.currency}>
                {
                  _.map(this.state.currencies).map((item, index) => {
                    return <option key={index} value={item}>{item}</option>
                  })
                }
              </select>
            </div>
        )
    }

    const CurrenciesDropDown = () => {
      return (
          <Dropdown isOpen={0 != this.state.filteredCurrencies.length} toggle={() => {}}>
            <DropdownMenu className={0 != this.state.filteredCurrencies.length ? 'show' : ''}>
              {
                _.map(this.state.filteredCurrencies).map((item, index) => {
                  return  <DropdownItem key={index} id={item} onClick={this._handleSelectFilteredCurrency.bind(this)}>{item}</DropdownItem>
                })
              }
            </DropdownMenu>
          </Dropdown>
      )
    }

    return (
        <div>
            <h7>CURRENCIES</h7><br/>
            <InputGroup style={{maxWidth:"250px",marginBottom:'5px'}}>
              <Input type="text" placeholder="Enter currency or use menu" value={this.state.currencyFilter} onChange={this._handleSetCurrencyFilter.bind(this)}/>
              <button type="button" className="input-group-addon btn btn-link" onClick={this._handleClearCurrencyFilter.bind(this)}>
                  <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
              </button>
            </InputGroup>
            <CurrenciesDropDown/>
            <Currencies/>
        </div>
    )
}

}

export default CoinMarketCapCurrencyChooser;
