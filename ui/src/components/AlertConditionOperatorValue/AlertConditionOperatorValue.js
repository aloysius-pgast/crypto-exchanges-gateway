import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';
import restClient from '../../lib/RestClient';
import dataStore from '../../lib/DataStore';
import conditionHelper from '../../lib/ConditionHelper';

import {
  FormGroup,
  Label,
  Input,
  InputGroup,
} from "reactstrap";

class AlertConditionOperatorValue extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       operator:'gte',
       value:{
           value:'',
           numValue:0.0,
           valid:true,
           err:null
       },
       min:{
           value:'',
           numValue:0.0,
           valid:true,
           err:null
       },
       max:{
           value:'',
           numValue:0.0,
           valid:true,
           err:null
       },
   };
   this._operators = [];
   conditionHelper.getOperators().forEach((id, i) => {
       this._operators.push({id:id, description:conditionHelper.getOperatorDescription(id)});
   });
}

_emitChange() {
    if (undefined === this.props.onChange) {
        return;
    }
    let operatorValue = null;
    if ('in' != this.state.operator && 'out' != this.state.operator) {
        if ('' !== this.state.value.value && this.state.value.valid) {
            operatorValue = {operator:this.state.operator, value:this.state.value.numValue};
        }
    }
    else {
        if ('' !== this.state.min.value && this.state.min.valid &&
            '' !== this.state.max.value && this.state.max.valid
        ) {
            operatorValue = {operator:this.state.operator, value:[this.state.min.numValue, this.state.max.numValue]};
        }
    }
    this.props.onChange(operatorValue)
}

_handleSelectOperator(event) {
    let operator = event.target.value;
    this.setState({operator:operator}, () => {
        this._emitChange();
    });
}

_handleChangeValue(event) {
    let value = event.target.value.trim();
    const state = {value:value, valid:true, err:null};
    if ('' == value || isNaN(value)) {
        state.valid = false;
        state.err = 'NAN';
    }
    else {
        state.numValue = parseFloat(value);
    }
    this.setState({value:state}, () => {
        this._emitChange();
    });
}

_handleChangeMin(event) {
    let value = event.target.value.trim();
    const state = {value:value, valid:true, err:null};
    if ('' == value || isNaN(value)) {
        state.valid = false;
        state.err = 'NAN';
    }
    else {
        state.numValue = parseFloat(value);
    }
    this.setState({min:state}, () => {
        this._emitChange();
    });
}

_handleChangeMax(event) {
    let value = event.target.value.trim();
    const state = {value:value, valid:true, err:null};
    if ('' == value || isNaN(value)) {
        state.valid = false;
        state.err = 'NAN';
    }
    else {
        state.numValue = parseFloat(value);
    }
    this.setState({max:state}, () => {
        this._emitChange();
    });
}

componentWillReceiveProps(nextProps) {}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    const invalidValue = (list) => {
        for (let i = 0; i < list.length; ++i) {
            if (list[i].item.valid) {
                continue;
            }
            if ('NAN' == list[i].item.err) {
                if ('value' == list[i].id) {
                    return <span>Please provide a number</span>
                }
                if ('min' == list[i].id) {
                    return <span>Please provide a number for min value</span>
                }
                // invalid max value
                return <span>Please provide a number for max value</span>
            }
            return <span>Unknown error {list[i].item.err}</span>
        }
        return null;
    }

    const valueField = () => {
        if ('in' != this.state.operator && 'out' != this.state.operator) {
            return (
                <div>
                    <Input className="form-control-sm" style={{maxWidth:'100px'}} type="text" id="value" placeholder="Value" onChange={this._handleChangeValue.bind(this)} value={this.state.value.value}/>
                    <div className="invalid-feedback" style={{display:!this.state.value.valid ? 'inline' : 'none'}}>
                    {invalidValue([{item:this.state.value,id:'value'}])}
                    </div>
                </div>
            )
        }
        return (
            <div>
                <InputGroup>
                    <Input className="form-control-sm" style={{maxWidth:'100px',marginRight:'10px'}} type="text" id="min" placeholder="Min" onChange={this._handleChangeMin.bind(this)} value={this.state.min.value}/>
                    <Input className="form-control-sm" style={{maxWidth:'100px'}} type="text" id="max" placeholder="Max" onChange={this._handleChangeMax.bind(this)} value={this.state.max.value}/>
                </InputGroup>
                <div className="invalid-feedback" style={{display:(!this.state.min.valid || !this.state.max.valid) ? 'inline' : 'none'}}>
                {invalidValue([{item:this.state.min,id:'min'},{item:this.state.max,id:'max'}])}
                </div>
            </div>
        )
    }

    return (
        <div>
            <FormGroup>
                <Label htmlFor="field">O<small>PERATOR</small></Label>
                <InputGroup>
                    <select id="field" className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectOperator.bind(this)} value={this.state.operator}>
                      {
                        _.map(this._operators).map((operator, index) => {
                          return <option key={operator.id} value={operator.id}>{operator.description}</option>
                        })
                      }
                    </select>
                </InputGroup>
            </FormGroup>
            <FormGroup>
                <Label htmlFor="field">V<small>ALUE</small></Label>
                {valueField()}
            </FormGroup>
        </div>
    )
}

}

export default AlertConditionOperatorValue;
