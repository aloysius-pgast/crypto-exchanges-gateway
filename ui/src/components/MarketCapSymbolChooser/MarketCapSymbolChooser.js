import React, { Component } from 'react';
import {
  Input,
  InputGroup,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import dataStore from '../../lib/DataStore';

class MarketCapSymbolChooser extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        symbols:props.symbols,
        symbol:props.symbol,
        symbolFilter:'',
        filteredSymbols:[]
    }
    if (null === this.state.symbol)
    {
        this.state.symbol = '';
    }
    // ensure symbol exists
    if ('' != this.state.symbol)
    {
        if (-1 == this.state.symbols.indexOf(this.state.symbol))
        {
            this.state.symbol = '';
        }
    }
    // call symbol event handler in parent ?
    if (undefined !== this.props.OnSelectSymbol)
    {
        this.props.OnSelectSymbol(this.state.symbol);
    }
}

_handleClearSymbol(event)
{
    this.setState((prevState, props) => {
        return {symbol:'',symbolFilter:'',filteredSymbols:[]};
    }, function(){
        // call symbol event handler in parent ?
        if (undefined !== this.props.OnSelectSymbol)
        {
            this.props.OnSelectSymbol(this.state.symbol);
        }
    });
}

_handleClearSymbolFilter(event)
{
    this.setState((prevState, props) => {
        return {symbolFilter:'',filteredSymbols:[]};
    });
}

_handleSetSymbolFilter(event)
{
    let filter = event.target.value.trim().toUpperCase();
    let list = [];
    if ('' != filter)
    {
        _.forEach(this.state.symbols, (c) => {
            // found matching symbol
            if (-1 != c.indexOf(filter))
            {
                list.push(c);
            }
        });
    }
    this.setState((prevState, props) => {
        return {symbolFilter:filter,filteredSymbols:list};
    });
}

_handleSelectFilteredSymbol(event)
{
    let symbol = event.target.id;
    this.setState((prevState, props) => {
        return {symbol:symbol,symbolFilter:'',filteredSymbols:[]};
    }, function(){
        // call event handler if defined
        if (undefined !== this.props.OnSelectSymbol)
        {
            this.props.OnSelectSymbol(this.state.symbol);
        }
    });
}

_handleSelectSymbol(event)
{
    let symbol = event.target.value;
    this.setState((prevState, props) => {
        return {symbol:symbol};
    }, function(){
        // call handler
        if (undefined !== this.props.OnSelectSymbol)
        {
            this.props.OnSelectSymbol(this.state.symbol);
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

// Nothing to do, we already know the symbol
componentWillReceiveProps(nextProps) {
    this.setState({symbol:nextProps.symbol});
}

render()
{
    const Symbols = () => {
        return (
            <div style={{marginBottom:'5px'}}>
              <span style={{minWidth:'70px',display:'inline-block'}}>C<small>URRENCY</small></span>&nbsp;&nbsp;
              <InputGroup style={{maxWidth:"250px",marginBottom:'5px'}}>
                <select className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectSymbol.bind(this)} value={this.state.symbol}>
                  <option value="">Top {this.props.limit}</option>
                  {
                    _.map(this.state.symbols).map((item, index) => {
                      return <option key={index} value={item}>{item}</option>
                    })
                  }
                </select>
                <button type="button" className="input-group-addon btn btn-link" onClick={this._handleClearSymbol.bind(this)}>
                    <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
                </button>
              </InputGroup>
            </div>
        )
    }

    const SymbolsDropDown = () => {
      return (
          <Dropdown isOpen={0 != this.state.filteredSymbols.length} toggle={() => {}}>
            <DropdownMenu className={0 != this.state.filteredSymbols.length ? 'show' : ''}>
              {
                _.map(this.state.filteredSymbols).map((item, index) => {
                  return  <DropdownItem key={index} id={item} onClick={this._handleSelectFilteredSymbol.bind(this)}>{item}</DropdownItem>
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
              <Input type="text" placeholder="Enter currency or use menu" value={this.state.symbolFilter} onChange={this._handleSetSymbolFilter.bind(this)}/>
              <button type="button" className="input-group-addon btn btn-link" onClick={this._handleClearSymbolFilter.bind(this)}>
                  <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
              </button>
            </InputGroup>
            <SymbolsDropDown/>
            <Symbols/>
        </div>
    )
}

}

export default MarketCapSymbolChooser;
