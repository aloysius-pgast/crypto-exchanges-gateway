import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import Big from 'big.js';
import {
  Row,
  Col,
  Card, CardHeader, CardBlock,
  FormGroup,
  Label,
  Input,
  InputGroup,
  DropdownMenu, DropdownItem, DropdownToggle, ButtonDropdown,
  Modal, ModalHeader, ModalBody, ModalFooter
} from "reactstrap";

import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

class Order extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    let rate = {
        floatValue:0.0,
        value:'',
        valid:true,
        err:null
    }
    let quantity = {
        floatValue:0.0,
        value:'',
        valid:true,
        err:null
    };
    let total = {
        floatValue:0.0,
        value:'',
        valid:true,
        err:null
    }
    let rawTotal = {
        floatValue:0.0,
        value:'',
        valid:true,
        err:null
    }
    let fees = {
        floatValue:0.0,
        value:''
    }

    //-- limits
    this._limits = this.props.limits;
    // update limits
    this._limits.rate.minStr = this._limits.rate.min.toFixed(this._limits.rate.precision);
    this._limits.rate.stepStr = this._limits.rate.step.toFixed(this._limits.rate.precision);
    this._limits.quantity.minStr = this._limits.quantity.min.toFixed(this._limits.quantity.precision);
    this._limits.quantity.stepStr = this._limits.quantity.step.toFixed(this._limits.quantity.precision);
    // override min_price with min_rate * min_quantity
    let price = new Big(this._limits.rate.min).times(this._limits.quantity.min);
    if (price.gt(this._limits.price.min))
    {
        this._limits.price.min = price;
    }
    this._limits.price.minStr = this._limits.price.min.toFixed(this._limits.quantity.precision);

    this._balance = {
        floatValue:new Big(this.props.balance)
    }
    this._balance.value = this._formatFloat(this._balance.floatValue);
    this._feesPercent = new Big(this.props.feesPercent).div(100.0);
    this._buyFeesFactor = new Big(1).plus(this._feesPercent);
    this._sellFeesFactor = new Big(1).minus(this._feesPercent);
    // initialize so that order can be fulfilled directly using market price
    if ('buy' == this.props.orderType)
    {
        rate.floatValue = new Big(this.props.ticker.sell);
        rate.value = this._formatFloat(rate.floatValue, this._limits.rate.precision);
    }
    else
    {
        rate.floatValue = new Big(this.props.ticker.buy);
        rate.value = this._formatFloat(rate.floatValue, this._limits.rate.precision);
    }
    if (null !== this.props.rate)
    {
        rate.floatValue = new Big(this.props.rate);
        // use the rate as it was provided
        rate.value = this._formatFloat(rate.floatValue);
        if (rate.floatValue.lt(this._limits.rate.min))
        {
            rate.valid = false;
            rate.err = 'MIN';
        }
        // not a multiple of step
        else if (!rate.floatValue.mod(this._limits.rate.step).eq(0))
        {
            rate.valid = false;
            rate.err = 'STEP';
        }
        // do we have a quantity ?
        if (null !== this.props.quantity)
        {
            quantity.floatValue = new Big(this.props.quantity);
            // use the quantity as it was provided
            quantity.value = this._formatFloat(quantity.floatValue);

            if (quantity.floatValue.lt(this._limits.quantity.min))
            {
                quantity.valid = false;
                quantity.err = 'MIN';
            }
            // not a multiple of step
            else if (!quantity.floatValue.mod(this._limits.quantity.step).eq(0))
            {
                quantity.valid = false;
                quantity.err = 'STEP';
            }

            if ('buy' == this.props.orderType)
            {
                let maxQuantity = this._balance.floatValue.div(this._buyFeesFactor).div(rate.floatValue);
                maxQuantity = new Big(this._getRoundedFloat(maxQuantity, this._limits.quantity.precision, this._limits.quantity.step));
                if (quantity.floatValue.lt(this._limits.quantity.min))
                {
                    quantity.valid = false;
                    quantity.err = 'MIN';
                }
                rawTotal.floatValue = quantity.floatValue.times(rate.floatValue);
                // ensure raw total is > min
                if (rawTotal.floatValue.lt(this._limits.price.min))
                {
                    rawTotal.valid = false;
                    rawTotal.err = 'MIN';
                }
                total.floatValue = rawTotal.floatValue.times(this._buyFeesFactor);
                if (total.floatValue.lte(0.00000001))
                {
                    total.valid = false;
                    total.err = 'NAN';
                }
                // ensure total is <= balance
                if (total.floatValue.gt(this._balance.floatValue))
                {
                    total.valid = false;
                    total.err = 'BALANCE';
                }
                rawTotal.value = this._formatFloat(rawTotal.floatValue);
                total.value = this._formatFloat(total.floatValue);
                fees.floatValue = total.floatValue.minus(rawTotal.floatValue);
                fees.value = this._formatFloat(fees.floatValue);
            }
            else
            {
                // ensure quantity is > min
                if (quantity.floatValue.lt(this._limits.quantity.min))
                {
                    quantity.valid = false;
                    quantity.err = 'MIN';
                }
                // ensure quantity is <= balance
                if (quantity.floatValue.gt(this._balance.floatValue))
                {
                    quantity.valid = false;
                    quantity.err = 'BALANCE';
                }
                rawTotal.floatValue = quantity.floatValue.times(rate.floatValue);
                // ensure raw total is > min
                if (rawTotal.floatValue.lt(this._limits.price.min))
                {
                    rawTotal.valid = false;
                    rawTotal.err = 'MIN';
                }
                total.floatValue = rawTotal.floatValue.times(this._sellFeesFactor);
                if (total.floatValue.lte(0.00000001))
                {
                    total.valid = false;
                    total.err = 'NAN';
                }
                fees.floatValue = rawTotal.floatValue.minus(total.floatValue);
                rawTotal.value = this._formatFloat(rawTotal.floatValue);
                fees.value = this._formatFloat(fees.floatValue);
                total.value = this._formatFloat(total.floatValue);
            }
        }
    }
    this.state = {
        showPriceDropdown:false,
        showQuantityDropdown:false,
        showTotalDropdown:false,
        quantity:{value:quantity.value,floatValue:quantity.floatValue,valid:quantity.valid,err:quantity.err,timestamp:null},
        rate:{value:rate.value,floatValue:rate.floatValue,valid:rate.valid,err:rate.err,timestamp:null},
        total:{value:total.value,floatValue:total.floatValue,valid:total.valid,err:total.err,timestamp:null},
        fees:{value:fees.value,floatValue:fees.floatValue},
        rawTotal:{value:rawTotal.value,floatValue:rawTotal.floatValue,valid:rawTotal.valid,err:rawTotal.err},
        order:{
            confirm:false,
            sending:false,
            sent:false,
            err:null,
            orderNumber:null
        }
    }
    this._handleSetRate = this._handleSetRate.bind(this);
    this._handleSetQuantity = this._handleSetQuantity.bind(this);
    this._handleSetTotal = this._handleSetTotal.bind(this);
    this._handleSetValue = this._handleSetValue.bind(this);
    this._handleSetMinQuantity = this._handleSetMinQuantity.bind(this);
    this._handleSetMinRawTotal = this._handleSetMinRawTotal.bind(this);
    this._handleCheckOrder = this._handleCheckOrder.bind(this);
    this._handleConfirmOrder = this._handleConfirmOrder.bind(this);
    this._handleCancelOrder = this._handleCancelOrder.bind(this);
    this._handleCloseOrder = this._handleCloseOrder.bind(this);
}

_getRoundedFloat(value, precision, step)
{
    if (undefined === precision)
    {
        precision = 8;
    }
    let type = typeof value;
    let str;
    if ('string' == type)
    {
        str = parseFloat(value).toFixed(precision + 1);
    }
    else if ('number' == type)
    {
        str = value.toFixed(precision + 1);
    }
    // probably a big number
    else
    {
        str = value.toFixed(precision + 1);
    }
    if (precision > 0)
    {
        // remove last digit
        str = str.substring(0, str.length - 1);
    }
    else
    {
        // remove . + last digit
        str = str.substring(0, str.length - 2);
    }
    // ensure we're using correct step
    if (undefined !== step)
    {
        let floatValue = new Big(str);
        // ensure we have a multiple of step
        let mod = floatValue.mod(step);
        // not a multiple of step
        if (!mod.eq(0))
        {
            floatValue = floatValue.minus(mod);
        }
        str = floatValue.toFixed(precision);
    }
    return parseFloat(str);
}

_formatFloat(value, precision)
{
    if (undefined === precision)
    {
        precision = 8;
    }
    return this._getRoundedFloat(value, precision).toFixed(precision);
}

_handleSetQuantity(e)
{
    let value;
    let floatValue;
    switch (e.target.id)
    {
        case 'min':
            value = this._limits.quantity.minStr;
            break;
        case '25%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.25), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case '50%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.5), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case '75%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.75), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case 'max':
            floatValue = this._getRoundedFloat(this._balance.floatValue, this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
    }
    this._setValue('quantity', value);
}

_handleSetTotal(e)
{
    let value;
    let floatValue;
    switch (e.target.id)
    {
        case '25%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.25), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case '50%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.5), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case '75%':
            floatValue = this._getRoundedFloat(this._balance.floatValue.times(0.75), this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
        case 'max':
            floatValue = this._getRoundedFloat(this._balance.floatValue, this._limits.quantity.precision, this._limits.quantity.step);
            value = floatValue.toFixed(this._limits.quantity.precision);
            break;
    }
    this._setValue('total', value);
}

_handleSetRate(e)
{
    let floatValue;
    switch (e.target.id)
    {
        case 'last':
            floatValue = this.props.ticker.last;
            break;
        case 'bid':
            floatValue = this.props.ticker.buy;
            break;
        case 'ask':
            floatValue = this.props.ticker.sell;
            break;
    }
    if (undefined !== floatValue)
    {
        let value = this._formatFloat(floatValue, this._limits.rate.precision);
        this._setValue('rate', value);
    }
}

_handleSetValue(e)
{
    this._setValue(e.target.id, e.target.value);
}

_handleSetMinRawTotal(e)
{
    this._setValue('rawTotal', this._limits.price.min.toFixed(8));
}

_handleSetMinQuantity(e)
{
    this._setValue('quantity', this._limits.quantity.minStr);
}

_setValue(id, value)
{
    let timestamp = new Date().getTime();
    let newState = {
        quantity:this.state.quantity,
        rate:this.state.rate,
        total:this.state.total,
        rawTotal:this.state.rawTotal,
        fees:this.state.fees
    }
    newState[id].value = value;
    newState[id].valid = true;
    if ('' == value || isNaN(value))
    {
        newState[id].valid = false;
        newState[id].err = 'NAN';
    }
    else
    {
        newState[id].floatValue = new Big(value);
        // control min(quantity), min(rate)
        switch (id)
        {
            case 'quantity':
                if (newState[id].floatValue.lt(this._limits.quantity.min))
                {
                    newState[id].valid = false;
                    newState[id].err = 'MIN';
                }
                else if (!newState[id].floatValue.mod(this._limits.quantity.step).eq(0))
                {
                    newState[id].valid = false;
                    newState[id].err = 'STEP';
                }
                break;
            case 'rate':
                if (newState[id].floatValue.lt(this._limits.rate.min))
                {
                    newState[id].valid = false;
                    newState[id].err = 'MIN';
                }
                else if (!newState[id].floatValue.mod(this._limits.rate.step).eq(0))
                {
                    newState[id].valid = false;
                    newState[id].err = 'STEP';
                }
                break;
            case 'total':
                if (newState[id].floatValue.lte(0.00000001))
                {
                    newState[id].valid = false;
                    newState[id].err = 'NAN';
                }
                break;
        }
        // control quantity/total to ensure we have enough to fullfil request
        if (('buy' == this.props.orderType && 'total' == id) ||
            ('sell' == this.props.orderType && 'quantity' == id))
        {
            if (newState[id].floatValue.gt(this._balance.floatValue))
            {
                newState[id].valid = false;
                newState[id].err = 'BALANCE';
            }
        }
        newState[id].value = value;
        if (newState[id].valid)
        {
            newState[id].timestamp = timestamp;
        }
    }
    this._updateState(newState, id);
}

_updateState(newState, field)
{
    // quantity was updated => recompute total
    if ('quantity' == field)
    {
        if (newState.quantity.valid)
        {
            if ('' != newState.rate.value && newState.rate.valid)
            {
                newState.rawTotal.floatValue = newState.quantity.floatValue.times(newState.rate.floatValue);
                newState.rawTotal.valid = true;
                // ensure rawTotal is above min price
                if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                {
                    newState.rawTotal.valid = false;
                    newState.rawTotal.err = 'MIN';
                }
                newState.total.valid = true;
                newState.fees.floatValue = newState.rawTotal.floatValue.times(this._feesPercent);
                if ('buy' == this.props.orderType)
                {
                    newState.total.floatValue = newState.rawTotal.floatValue.plus(newState.fees.floatValue);
                    // check if total is 0 or > balance
                    if (newState.total.floatValue.lte(0.00000001))
                    {
                        newState.total.valid = false;
                        newState.total.err = null;
                    }
                    else if (newState.total.floatValue.gt(this._balance.floatValue))
                    {
                        newState.total.valid = false;
                        newState.total.err = 'BALANCE';
                    }
                }
                else
                {
                    newState.total.floatValue = newState.rawTotal.floatValue.minus(newState.fees.floatValue);
                }
                newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                newState.total.value = this._formatFloat(newState.total.floatValue);
                newState.fees.value = this._formatFloat(newState.fees.floatValue);
            }
        }
    }
    // total was updated => recompute quantity
    else if ('total' == field)
    {
        if (newState.total.valid)
        {
            if ('' != newState.rate.value && newState.rate.valid)
            {
                if ('buy' == this.props.orderType)
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._buyFeesFactor);
                    newState.rawTotal.valid = true;
                    // ensure rawTotal is above min price
                    if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                    {
                        newState.rawTotal.valid = false;
                        newState.rawTotal.err = 'MIN';
                    }
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                }
                else
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._sellFeesFactor);
                    newState.rawTotal.valid = true;
                    // ensure rawTotal is above min price
                    if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                    {
                        newState.rawTotal.valid = false;
                        newState.rawTotal.err = 'MIN';
                    }
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                    // check if quantity > balance
                    else if (newState.quantity.floatValue.gt(this._balance.floatValue))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'BALANCE';
                    }
                }
                newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                newState.quantity.value = this._formatFloat(newState.quantity.floatValue, this._limits.quantity.precision);
                newState.fees.value = this._formatFloat(newState.fees.floatValue);
            }
        }
    }
    // raw total was updated => recompute quantity
    else if ('rawTotal' == field)
    {
        if (newState.rawTotal.valid)
        {
            // recompute total
            if ('buy' == this.props.orderType)
            {
                newState.total.floatValue = newState.rawTotal.floatValue.times(this._buyFeesFactor);
                newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
            }
            else
            {
                newState.total.floatValue = newState.rawTotal.floatValue.times(this._sellFeesFactor);
                newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
            }
            newState.total.valid = true;
            newState.total.value = this._formatFloat(newState.total.floatValue);
            newState.fees.value = this._formatFloat(newState.fees.floatValue);

            if ('' != newState.rate.value && newState.rate.valid)
            {
                if ('buy' == this.props.orderType)
                {
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                }
                else
                {
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                    // check if quantity > balance
                    else if (newState.quantity.floatValue.gt(this._balance.floatValue))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'BALANCE';
                    }
                }
                newState.quantity.value = this._formatFloat(newState.quantity.floatValue, this._limits.quantity.precision);
            }
        }
    }
    // rate was updated => recompute total or quantity
    else
    {
        if (newState.rate.valid)
        {
            if ('' != newState.quantity.value && newState.quantity.valid)
            {
                // total is valid & has been updated more recently => recompute quantity
                if ('' != newState.total.value && newState.total.valid &&
                    null !== newState.total.timestamp &&
                    (null === newState.quantity.timestamp || newState.total.timestamp > newState.quantity.timestamp)
                )
                {
                    newState.rawTotal.valid = true;
                    if ('buy' == this.props.orderType)
                    {
                        newState.rawTotal.floatValue = newState.total.floatValue.div(this._buyFeesFactor);
                        newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                        // ensure we have a multiple of step
                        newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                        newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                        newState.quantity.valid = true;
                        // check if quantity > min
                        if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                        {
                            newState.quantity.valid = false;
                            newState.quantity.err = 'MIN';
                        }
                    }
                    else
                    {
                        newState.rawTotal.floatValue = newState.total.floatValue.div(this._sellFeesFactor);
                        newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                        // ensure we have a multiple of step
                        newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                        newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                        newState.quantity.valid = true;
                        // check if quantity > min
                        if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                        {
                            newState.quantity.valid = false;
                            newState.quantity.err = 'MIN';
                        }
                        // check if quantity > balance
                        else if (newState.quantity.floatValue.gt(this._balance.floatValue))
                        {
                            newState.quantity.valid = false;
                            newState.quantity.err = 'BALANCE';
                        }
                    }
                    // ensure rawTotal is > min
                    if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                    {
                        newState.rawTotal.valid = false;
                        newState.rawTotal.err = 'MIN';
                    }
                    newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                    newState.quantity.value = this._formatFloat(newState.quantity.floatValue, this._limits.quantity.precision);
                    newState.fees.value = this._formatFloat(newState.fees.floatValue);
                }
                // recompute total
                else
                {
                    newState.rawTotal.floatValue = newState.quantity.floatValue.times(newState.rate.floatValue);
                    newState.total.valid = true;
                    newState.rawTotal.valid = true;
                    newState.fees.floatValue = newState.rawTotal.floatValue.times(this._feesPercent);
                    if ('buy' == this.props.orderType)
                    {
                        newState.total.floatValue = newState.rawTotal.floatValue.plus(newState.fees.floatValue);
                        // check if total > balance
                        if (newState.total.floatValue.gt(this._balance.floatValue))
                        {
                            newState.total.valid = false;
                            newState.total.err = 'BALANCE';
                        }
                    }
                    else
                    {
                        newState.total.floatValue = newState.rawTotal.floatValue.minus(newState.fees.floatValue);
                    }
                    // ensure rawTotal > min
                    if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                    {
                        newState.rawTotal.valid = false;
                        newState.rawTotal.err = 'MIN';
                    }
                    newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                    newState.total.value = this._formatFloat(newState.total.floatValue);
                    newState.fees.value = this._formatFloat(newState.fees.floatValue);
                }
            }
            // recompute quantity
            else if ('' != newState.total.value && newState.total.valid)
            {
                newState.rawTotal.valid = true;
                if ('buy' == this.props.orderType)
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._buyFeesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                }
                else
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._sellFeesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    // ensure we have a multiple of step
                    newState.quantity.floatValue = new Big(this._getRoundedFloat(newState.quantity.floatValue, this._limits.quantity.precision, this._limits.quantity.step));
                    newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity > min
                    if (newState.quantity.floatValue.lt(this._limits.quantity.min))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'MIN';
                    }
                    // check if quantity > balance
                    else if (newState.quantity.floatValue.gt(this._balance.floatValue))
                    {
                        newState.quantity.valid = false;
                        newState.quantity.err = 'BALANCE';
                    }
                }
                // ensure rawTotal is > min
                if (newState.rawTotal.floatValue.lt(this._limits.price.min))
                {
                    newState.rawTotal.valid = false;
                    newState.rawTotal.err = 'MIN';
                }
                newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                newState.quantity.value = this._formatFloat(newState.quantity.floatValue, this._limits.quantity.precision);
                newState.fees.value = this._formatFloat(newState.fees.floatValue);
            }
        }
    }
    this.setState(newState);
}

_handleCheckOrder(e)
{
    e.preventDefault();
    e.stopPropagation();
    let newState = {
        quantity:this.state.quantity,
        rate:this.state.rate,
        total:this.state.total,
        rawTotal:this.state.rawTotal
    }
    let valid = true;
    if ('' == this.state.quantity.value || !this.state.quantity.valid)
    {
        newState.quantity.valid = false;
        valid = false;
    }
    if ('' == this.state.rate.value || !this.state.rate.valid)
    {
        newState.rate.valid = false;
        valid = false;
    }
    if ('' == this.state.total.value || !this.state.total.valid)
    {
        newState.total.valid = false;
        valid = false;
    }
    if ('' == this.state.rawTotal.value || !this.state.rawTotal.valid)
    {
        newState.rawTotal.valid = false;
        valid = false;
    }
    this.setState(newState);
    if (!valid)
    {
        return false;
    }
    this.setState({order:{confirm:true,sending:false,sent:false,orderNumber:null,err:null}});
    return false;
}

_handleConfirmOrder(e)
{
    e.preventDefault();
    e.stopPropagation();
    let self = this;
    this.setState({order:{confirm:false,sending:true,sent:false,orderNumber:null,err:null}}, function(){
        let quantity = parseFloat(this.state.quantity.value);
        let rate = parseFloat(this.state.rate.value);
        restClient.createOrder(self.props.exchange, self.props.pair, self.props.orderType, quantity, rate).then(function(data){
            self.setState({order:{confirm:false,sending:false,sent:true,orderNumber:data.orderNumber,err:null}});
        }).catch(function(err){
            let error = 'Unknown error';
            if (undefined !== err.response && undefined !== err.response.data && undefined !== err.response.data.error)
            {
                error = err.response.data.error;
            }
            self.setState({order:{confirm:false,sending:false,sent:true,orderNumber:null,err:error}});
        });
    });
    return false;
}

_handleCancelOrder(e)
{
    e.preventDefault();
    e.stopPropagation();
    this.setState({order:{confirm:false,sending:false,sent:false,err:null,orderNumber:null}});
    return false;
}

_handleCloseOrder(e)
{
    e.preventDefault();
    e.stopPropagation();
    if (undefined !== this.props.onClose)
    {
        this.props.onClose();
    }
    return false;
}

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
    let orderType = 'BUY';
    let bidAskType = 'BID';
    let buySellAction = 'buy';
    if ('sell' == this.props.orderType)
    {
        orderType = 'SELL';
        bidAskType = 'ASK';
        buySellAction = 'sell';
    }

    const MinQuantityButton = () => {
        if ('buy' == this.props.orderType)
        {
            return (
                <button className="btn btn-secondary" onClick={this._handleSetMinQuantity}>M<small>IN</small></button>
            )
        }
        return null
    }

    const MinRawTotalButton = () => {
        return (
            <button className="btn btn-secondary" onClick={this._handleSetMinRawTotal}>M<small>IN</small></button>
        )
        return null
    }

    const ConfirmationForm = () => {
        if (!this.state.order.confirm && !this.state.order.sending && !this.state.order.sent)
        {
            return null
        }

        const Confirm = () => {
            if (!this.state.order.confirm)
            {
                return null
            }
            return (
                <div>
                  <ModalBody>
                    <div style={{marginBottom:'10px'}}>Do you want to {buySellAction} <strong>{this.state.quantity.value} {this.props.currency}</strong> at <strong>{this.state.rate.value} {this.props.baseCurrency}</strong> per unit, for a total of <strong>{this.state.total.value} {this.props.baseCurrency}</strong> ?</div>
                  </ModalBody>
                  <ModalFooter>
                    <button type="button" className="btn btn-secondary" style={{marginRight:'5px'}} onClick={this._handleConfirmOrder}>Y<small>ES</small></button>
                    <button type="button" className="btn btn-secondary" onClick={this._handleCancelOrder}>N<small>O</small></button>
                  </ModalFooter>
                </div>
            )
        }

        const Sending = () => {
            if (!this.state.order.sending)
            {
                return null
            }
            return (
                <div>
                  <ModalBody>
                    <center><i className="ml-auto mr-auto fa fa-spinner fa-spin" style={{fontSize:'2.0rem'}}/></center>
                  </ModalBody>
                  <ModalFooter/>
                </div>
            )
        }

        const OrderResult = () => {
            // an error occurred when sending the order
            if (null !== this.state.order.err)
            {
                return (
                    <div className="text-danger" style={{marginBottom:'10px'}}>Order failed : {this.state.order.err}</div>
                )
            }
            // successful order
            return (
                <div className="text-success" style={{marginBottom:'10px'}}>Order successfully created. New order is {this.state.order.orderNumber}</div>
            )
        }

        const Sent = () => {
            if (!this.state.order.sent)
            {
                return null
            }
            return (
                <div>
                  <ModalBody>
                    <OrderResult/>
                  </ModalBody>
                  <ModalFooter>
                    <button type="button" className="btn btn-secondary" onClick={this._handleCloseOrder}>C<small>LOSE</small></button>
                  </ModalFooter>
                </div>
            )
        }

        return (
            <form noValidate>
              <Modal isOpen={true} fade={this.state.order.confirm}>
                <CardHeader>
                  <strong>{orderType}</strong>
                  <small> {this.props.currency}</small>
                </CardHeader>
                <Confirm/>
                <Sending/>
                <Sent/>
              </Modal>
            </form>
        )
    }

    let balanceClassnames = "float-right";
    if (this._balance.floatValue.eq(0))
    {
        balanceClassnames += " text-danger";
    }

    const Fees = () => {
      return (
        <Row>
          <Col>
            <FormGroup>
              <Label htmlFor="fees">E<small>STIMATED FEES ({this.props.feesPercent.toFixed(2)}%)</small></Label>
              <InputGroup>
                <Input disabled={true} type="text" id="fees" placeholder="Estimated fees" value={this.state.fees.value}/>
                <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
              </InputGroup>
            </FormGroup>
          </Col>
        </Row>
      )
    }

    const RawTotal = () => {

      return (
        <Row>
          <Col>
            <FormGroup>
              <Label htmlFor="rawTotal">T<small>OTAL</small><br/>
              <small>MIN: {this._limits.price.minStr}</small>
              </Label>
              <InputGroup>
                <MinRawTotalButton/>
                <Input disabled={true} type="text" id="rawTotal" placeholder="Total" value={this.state.rawTotal.value}/>
                <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
              </InputGroup>
              <div className="invalid-feedback" style={{display:!this.state.rawTotal.valid ? 'inline' : 'none'}}>
              {invalidValue(this.state.rawTotal, 'price')}
              </div>
            </FormGroup>
          </Col>
        </Row>
      )
    }

    const RateWarning = () => {
        if (!this.state.rate.valid)
        {
            return null;
        }
        let msg;
        let warn = false;
        if ('buy' == this.props.orderType)
        {
            if (this.state.rate.floatValue.gt(this.props.ticker.sell))
            {
                warn = true;
                msg = `Rate is higher than lowest <i>Ask</i> value ${this.props.ticker.sell}`;
            }
        }
        else
        {
            if (this.state.rate.floatValue.lt(this.props.ticker.buy))
            {
                warn = true;
                msg = `Rate is lower than highest <i>Bid</i> value ${this.props.ticker.buy}`;
            }
        }
        if (!warn)
        {
            return null;
        }
        return (
            <div style={{color:'#e64400'}} dangerouslySetInnerHTML={{__html:msg}}/>
        );
    }

    const invalidValue = (value, limitId) => {
        if (value.valid)
        {
            return null;
        }
        if ('MIN' == value.err)
        {
            return <span>Minimum value is {this._limits[limitId].minStr}</span>
        }
        else if ('STEP' == value.err)
        {
            return <span>Value should be a multiple of {this._limits[limitId].stepStr}</span>
        }
        else if ('BALANCE' == value.err)
        {
            return <span>Maximum value is {this._balance.value}</span>
        }
        else
        {
            return <span>Please provide a number > 0</span>
        }
    }

    let totalInfo = 'INCLUDING FEES';
    if ('sell' == this.props.orderType)
    {
        totalInfo = 'AFTER SUBSTRACTING FEES';
    }
    return (
        <div>
        <form noValidate>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <strong>{orderType}</strong>
                <small> {this.props.currency}</small>
                <div className={balanceClassnames}><small>{this._balance.value} {this.props.balanceCurrency} AVAIL</small></div>
              </CardHeader>
              <CardBlock className="card-body">
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="quantity">Q<small>UANTITY</small><br/>
                      <small>MIN: {this._limits.quantity.minStr} STEP: {this._limits.quantity.stepStr}</small>
                      </Label>
                      <InputGroup>
                        <MinQuantityButton/>
                        <ButtonDropdown style={{display:'sell' == this.props.orderType ? 'inline' : 'none'}} isOpen={this.state.showQuantityDropdown} toggle={() => { this.setState({ showQuantityDropdown: !this.state.showQuantityDropdown }); }}>
                          <DropdownToggle caret color="secondary">
                            Q<small>TY</small>
                          </DropdownToggle>
                          <DropdownMenu className={this.state.showQuantityDropdown ? 'show' : ''}>
                            <DropdownItem id="max" onClick={this._handleSetQuantity}>Max</DropdownItem>
                            <DropdownItem id="min" onClick={this._handleSetQuantity}>Min</DropdownItem>
                            <DropdownItem id="25%" onClick={this._handleSetQuantity}>25%</DropdownItem>
                            <DropdownItem id="50%" onClick={this._handleSetQuantity}>50%</DropdownItem>
                            <DropdownItem id="75%" onClick={this._handleSetQuantity}>75%</DropdownItem>
                          </DropdownMenu>
                        </ButtonDropdown>
                        <Input className={!this.state.quantity.valid ? 'is-invalid' : ''} type="text" id="quantity" placeholder="Quantity" value={this.state.quantity.value} onChange={this._handleSetValue}/>
                        <span className="input-group-addon"><small>{this.props.currency}</small></span>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:!this.state.quantity.valid ? 'inline' : 'none'}}>
                        {invalidValue(this.state.quantity, 'quantity')}
                      </div>
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="rate">{bidAskType.substr(0,1)}<small>{bidAskType.substr(1)}</small><br/>
                      <small>MIN: {this._limits.rate.minStr} STEP: {this._limits.rate.stepStr}</small>
                      </Label>
                      <InputGroup>
                        <ButtonDropdown isOpen={this.state.showPriceDropdown} toggle={() => { this.setState({ showPriceDropdown: !this.state.showPriceDropdown }); }}>
                          <DropdownToggle caret color="secondary">
                            R<small>ATE</small>
                          </DropdownToggle>
                          <DropdownMenu className={this.state.showPriceDropdown ? 'show' : ''}>
                            <DropdownItem id="last" onClick={this._handleSetRate}>Last</DropdownItem>
                            <DropdownItem id="bid" onClick={this._handleSetRate}>Bid</DropdownItem>
                            <DropdownItem id="ask" onClick={this._handleSetRate}>Ask</DropdownItem>
                          </DropdownMenu>
                        </ButtonDropdown>
                        <Input className={!this.state.rate.valid ? 'is-invalid' : ''} type="text" id="rate" placeholder="Rate" value={this.state.rate.value} onChange={this._handleSetValue}/>
                        <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:!this.state.rate.valid ? 'inline' : 'none'}}>
                      {invalidValue(this.state.rate, 'rate')}
                      </div>
                      <RateWarning/>
                    </FormGroup>
                  </Col>
                </Row>
                <RawTotal/>
                <Fees/>
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="total">T<small>OTAL ({totalInfo})</small></Label>
                      <InputGroup>
                        <ButtonDropdown style={{display:'buy' == this.props.orderType ? 'inline' : 'none'}} isOpen={this.state.showTotalDropdown} toggle={() => { this.setState({ showTotalDropdown: !this.state.showTotalDropdown }); }}>
                          <DropdownToggle caret color="secondary">
                            T<small>OTAL</small>
                          </DropdownToggle>
                          <DropdownMenu className={this.state.showTotalDropdown ? 'show' : ''}>
                            <DropdownItem id="max" onClick={this._handleSetTotal}>Max</DropdownItem>
                            <DropdownItem id="25%" onClick={this._handleSetTotal}>25%</DropdownItem>
                            <DropdownItem id="50%" onClick={this._handleSetTotal}>50%</DropdownItem>
                            <DropdownItem id="75%" onClick={this._handleSetTotal}>75%</DropdownItem>
                          </DropdownMenu>
                        </ButtonDropdown>
                        <Input className={!this.state.total.valid ? 'is-invalid' : ''} type="text" id="total" value={this.state.total.value} onChange={this._handleSetValue}/>
                        <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:!this.state.total.valid ? 'inline' : 'none'}}>
                      {invalidValue(this.state.total, 'total')}
                      </div>
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <button type="button" className="btn btn-secondary float-right" onClick={this._handleCheckOrder}>{orderType.substr(0,1)}<small>{orderType.substr(1)}</small></button>
                  </Col>
                </Row>
              </CardBlock>
            </Card>
          </Col>
        </Row>
        </form>
        <ConfirmationForm/>
        </div>
    )
}

}

export default Order;
