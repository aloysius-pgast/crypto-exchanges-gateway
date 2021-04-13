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

class AlertConditionForExchange extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       exchange:props.exchange,
       field:'last',
       pair:'',
       pairFilter:'',
       filteredPairs:[],
       pairs:{loaded:false, isLoading:false, loadedTimestamp:0, err:null, data:null},
       isLoading:false
   };
   this._fields = [];
   conditionHelper.getExchangeFields().forEach((id, i) => {
       this._fields.push({id:id, description:conditionHelper.getFieldDescriptionForExchangeField(id)});
   });
   this._operators = [];
   conditionHelper.getOperators().forEach((id, i) => {
       this._operators.push({id:id, description:conditionHelper.getOperatorDescription(id)});
   });
   this._operatorValue = null;
}

_loadPairs()
{
    let timer = setTimeout(() => {
        this.setState((prevState, props) => {
            let state = prevState.pairs;
            state.isLoading = true;
            return {pairs:state}
        });
    }, WAIT_TIMER_DELAY);
    let exchange = this.state.exchange;
    restClient.getPairs(exchange).then((data) => {
        clearTimeout(timer);
        if (!this._isMounted)
        {
            return;
        }
        if (exchange != this.state.exchange)
        {
            return;
        }
        let timestamp = Date.now();
        let state = {loaded:true, isLoading:false, loadedTimestamp:timestamp, data:Object.values(data), err:null};
        this.setState({pairs:state});
    }).catch ((err) => {
        clearTimeout(timer);
        if (!this._isMounted)
        {
            return;
        }
        if (exchange != this.state.exchange)
        {
            return;
        }
        let timestamp = Date.now();
        let state = {loaded:true, isLoading:false, loadedTimestamp:timestamp, err:err, data:null};
        this.setState({pairs:state});
    });
}

_handleClearPairFilter(event)
{
    this.setState((prevState, props) => {
        return {pair:'', pairFilter:'',filteredPairs:[]};
    }, () => {
        this._emitCondition();
    });
}

_handleSetPairFilter(event)
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
        _.forEach(this.state.pairs.data, (e) => {
            // found matching pair
            if (-1 != e.currency.toUpperCase().indexOf(currency))
            {
                list.push(e.pair);
            }
        });
    }
    this.setState((prevState, props) => {
        return {pair:'',pairFilter:filter,filteredPairs:list};
    });
}

_handleSelectPair(event)
{
    let pair = event.target.id;
    this.setState((prevState, props) => {
        let state = {pairFilter:pair,filteredPairs:[],pair:pair};
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
    if (null === this._operatorValue || '' === this.state.pair) {
        this.props.onCondition(null);
        return;
    }
    const condition = {
        field:this.state.field,
        operator:this._operatorValue.operator,
        value:this._operatorValue.value,
        pair:this.state.pair
    }
    this.props.onCondition(condition);
}

_handleChangeOperatorValue(obj) {
    this._operatorValue = obj;
    this._emitCondition();
}

componentWillReceiveProps(nextProps) {
    const state = {
        exchange:nextProps.exchange,
    };
    let shouldLoad = false;
    if (state.exchange != this.state.exchange) {
        if ('' != state.exchange) {
            shouldLoad = true;
        }
        state.pair = '';
        state.pairFilter = '';
        state.filteredPairs = [];
        state.pairs = {loaded:false, isLoading:false, loadedTimestamp:0, err:null, data:null};
    }
    this.setState(state, () => {
        if (shouldLoad) {
            this._loadPairs();
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
    if ('' != this.state.exchange) {
        this._loadPairs();
    }
}

render()
{
    if ('' == this.state.exchange)
    {
        return null;
    }

    const isLoading = () => {
        if (!this.state.pairs.isLoading)
        {
            return null;
        }
        return (<ComponentLoadingSpinner/>);
    }

    const pairsErrMessage = () => {
        if (null === this.state.pairs.err)
        {
            return null;
        }
        let errMessage = this.state.pairs.err.message;
        if (undefined !== this.state.pairs.err.error) {
            errMessage = this.state.pairs.err.error;
        }
        return (<span className="text-danger"><strong>Error: {errMessage}</strong></span>)
    }

    let exchange = this.state.exchange;
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
            <div style={{display:'' != this.state.exchange && (this.state.pairs.loaded || this.state.pairs.isLoading) ? '' : 'none'}}>
                <FormGroup>
                  <Label htmlFor="type">P<small>AIR</small>
                  </Label>
                  <InputGroup style={{display:this.state.pairs.loaded && null === this.state.pairs.err ? '' : 'none'}}>
                    <Input disabled={this.state.isDisabled} type="text" placeholder="Enter pair" value={this.state.pairFilter} onChange={this._handleSetPairFilter.bind(this)}/>
                    <button disabled={this.state.isDisabled} type="button" className="input-group-addon btn btn-link" onClick={this._handleClearPairFilter.bind(this)}>
                        <i className="fa fa-remove" style={{fontSize:'1rem'}}></i>
                    </button>
                  </InputGroup>
                  <InputGroup style={{display:null !== this.state.pairs.err || this.state.pairs.isLoading ? '' : 'none'}}>
                    {isLoading()}
                    {pairsErrMessage()}
                  </InputGroup>
                  <Dropdown isOpen={0 != this.state.filteredPairs.length} toggle={() => {}}>
                    <DropdownMenu className={0 != this.state.filteredPairs.length ? 'show' : ''}>
                      {
                        _.map(this.state.filteredPairs).map((item, index) => {
                          return  <DropdownItem key={index} id={item} onClick={this._handleSelectPair.bind(this)}>{item}</DropdownItem>
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

export default AlertConditionForExchange;
