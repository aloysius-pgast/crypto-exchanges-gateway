import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';
import restClient from '../../lib/RestClient';
import dataStore from '../../lib/DataStore';
import conditionHelper from '../../lib/ConditionHelper';

import ComponentLoadingSpinner from '../ComponentLoadingSpinner';
import AlertConditionOperatorValue from '../AlertConditionOperatorValue';

import {
  FormGroup,
  Label,
  Input,
  InputGroup,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";

const WAIT_TIMER_DELAY = 250;

class AlertConditionForMarketCap extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isVisible:props.isVisible,
       field:'price_usd',
       symbol:'',
       symbolFilter:'',
       filteredSymbols:[],
       symbols:{loaded:false, isLoading:false, loadedTimestamp:0, err:null, data:null},
       isLoading:false
   };
   this._fields = [];
   conditionHelper.getMarketCapFields().forEach((id, i) => {
       this._fields.push({id:id, description:conditionHelper.getFieldDescriptionForMarketCapField(id)});
   });
   this._operators = [];
   conditionHelper.getOperators().forEach((id, i) => {
       this._operators.push({id:id, description:conditionHelper.getOperatorDescription(id)});
   });
   this._operatorValue = null;
}

_loadSymbols() {
    let timer = setTimeout(() => {
        this.setState((prevState, props) => {
            let state = prevState.symbols;
            state.isLoading = true;
            return {symbols:state}
        });
    }, WAIT_TIMER_DELAY);
    restClient.getMarketCapSymbols().then((data) => {
        clearTimeout(timer);
        if (!this._isMounted)
        {
            return;
        }
        if (!this.state.isVisible) {
            return;
        }
        let timestamp = Date.now();
        let state = {loaded:true, isLoading:false, loadedTimestamp:timestamp, data:Object.values(data), err:null};
        this.setState({symbols:state});
    }).catch ((err) => {
        clearTimeout(timer);
        if (!this._isMounted) {
            return;
        }
        if (!this.state.isVisible) {
            return;
        }
        console.error(err);
        let timestamp = Date.now();
        let state = {loaded:true, isLoading:false, loadedTimestamp:timestamp, err:err, data:null};
        this.setState({symbols:state});
    });
}

_handleClearSymbolFilter(event)
{
    this.setState((prevState, props) => {
        return {symbol:'', symbolFilter:'',filteredSymbols:[]};
    }, () => {
        this._emitCondition();
    });
}

_handleSetSymbolFilter(event)
{
    let filter = event.target.value.trim().toUpperCase();
    let list = [];
    _.forEach(this.state.symbols.data, (e) => {
        // found matching symbol
        if (-1 != e.indexOf(filter))
        {
            list.push(e);
        }
    });
    this.setState((prevState, props) => {
        return {symbol:'',symbolFilter:filter,filteredSymbols:list};
    });
}

_handleSelectSymbol(event)
{
    let symbol = event.target.id;
    this.setState((prevState, props) => {
        let state = {symbolFilter:symbol,filteredSymbols:[],symbol:symbol};
        return state;
    }, () => {
        this._emitCondition();
    });
}

_handleSelectField(event)
{
    let field = event.target.value;
    this.setState({field:field}, () => {
        this._emitCondition();
    });
}

_emitCondition() {
    if (undefined === this.props.onCondition) {
        return;
    }
    if (null === this._operatorValue || '' === this.state.symbol) {
        this.props.onCondition(null);
        return;
    }
    const condition = {
        field:this.state.field,
        operator:this._operatorValue.operator,
        value:this._operatorValue.value,
        symbol:this.state.symbol
    }
    this.props.onCondition(condition);
}

_handleChangeOperatorValue(obj) {
    this._operatorValue = obj;
    this._emitCondition();
}

componentWillReceiveProps(nextProps) {
    const state = {
        isVisible:nextProps.isVisible,
    };
    let shouldLoad = false;
    if (this.state.isVisible != state.isVisible) {
        shouldLoad = true;
    }
    if (!state.isVisible) {
        state.symbol = '';
        state.symbolFilter = '';
        state.filteredSymbols = [];
        state.symbols = {loaded:false, isLoading:false, loadedTimestamp:0, err:null, data:null};
    }
    this.setState(state, () => {
        if (shouldLoad) {
            this._loadSymbols();
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
    if (this.state.isVisible) {
        this._loadSymbols();
    }
}

render()
{
    if (!this.state.isVisible)
    {
        return null;
    }

    const isLoading = () => {
        if (!this.state.symbols.isLoading)
        {
            return null;
        }
        return (<ComponentLoadingSpinner/>);
    }

    const symbolsErrMessage = () => {
        if (null === this.state.symbols.err)
        {
            return null;
        }
        let errMessage = this.state.symbols.err.message;
        if (undefined !== this.state.symbols.err.error) {
            errMessage = this.state.symbols.err.error;
        }
        return (<span className="text-danger"><strong>Error: {errMessage}</strong></span>)
    }

    return (
        <div>
            <div>
                <FormGroup>
                    <Label htmlFor="field">F<small>IELD</small></Label>
                    <InputGroup>
                        <select id="field" className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectField.bind(this)} value={this.state.field}>
                          {
                            _.map(this._fields).map((field, index) => {
                              return <option key={field.id} value={field.id}>{field.description}</option>
                            })
                          }
                        </select>
                    </InputGroup>
                </FormGroup>
            </div>
            <div style={{display:(this.state.symbols.loaded || this.state.symbols.isLoading) ? '' : 'none'}}>
                <FormGroup>
                  <Label htmlFor="type">S<small>YMBOL</small>
                  </Label>
                  <InputGroup style={{display:this.state.symbols.loaded && null === this.state.symbols.err ? '' : 'none'}}>
                    <Input disabled={this.state.isDisabled} type="text" placeholder="Enter symbol" value={this.state.symbolFilter} onChange={this._handleSetSymbolFilter.bind(this)}/>
                    <button disabled={this.state.isDisabled} type="button" className="input-group-addon btn btn-link" onClick={this._handleClearSymbolFilter.bind(this)}>
                        <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
                    </button>
                  </InputGroup>
                  <InputGroup style={{display:null !== this.state.symbols.err || this.state.symbols.isLoading ? '' : 'none'}}>
                    {isLoading()}
                    {symbolsErrMessage()}
                  </InputGroup>
                  <Dropdown isOpen={0 != this.state.filteredSymbols.length} toggle={() => {}}>
                    <DropdownMenu className={0 != this.state.filteredSymbols.length ? 'show' : ''}>
                      {
                        _.map(this.state.filteredSymbols).map((item, index) => {
                          return  <DropdownItem key={index} id={item} onClick={this._handleSelectSymbol.bind(this)}>{item}</DropdownItem>
                        })
                      }
                    </DropdownMenu>
                  </Dropdown>
                </FormGroup>
            </div>
            <AlertConditionOperatorValue
                onChange={this._handleChangeOperatorValue.bind(this)}
            />
        </div>
    )
}

}

export default AlertConditionForMarketCap;
