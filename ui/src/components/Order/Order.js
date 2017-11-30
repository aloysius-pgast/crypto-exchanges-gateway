import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import Big from 'big.js';
import {
  Row,
  Col,
  Card,
  CardHeader,
  CardBlock,
  FormGroup,
  Label,
  Input,
  InputGroup,
  DropdownMenu,
  DropdownItem,
  DropdownToggle,
  ButtonDropdown
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
        value:''
    }
    let quantity = {
        floatValue:0.0,
        value:'',
    };
    let total = {
        floatValue:0.0,
        value:''
    }
    let rawTotal = {
        floatValue:0.0,
        value:''
    }
    let fees = {
        floatValue:0.0,
        value:''
    }
    this._balance = {
        floatValue:new Big(this.props.balance)
    }
    this._balance.value = this._formatFloat(this._balance.floatValue);
    this._feesPercent = new Big(this.props.feesPercent).div(100.0);
    this._feesFactor = new Big(1).plus(this._feesPercent);
    // initialize so that order can be fulfilled directly using market price
    if ('buy' == this.props.orderType)
    {
        rate.floatValue = new Big(this.props.ticker.sell);
        rate.value = this._formatFloat(rate.floatValue);
    }
    else
    {
        rate.floatValue = new Big(this.props.ticker.buy);
        rate.value = this._formatFloat(rate.floatValue);
    }
    if (null !== this.props.rate)
    {
        rate.floatValue = new Big(this.props.rate);
        rate.value = this._formatFloat(rate.floatValue);
        // do we have a quantity ?
        if (null !== this.props.quantity)
        {
            quantity.floatValue = new Big(this.props.quantity);
            quantity.value = this._formatFloat(quantity.floatValue);
            // ensure we have enough balance to buy this quantity
            if ('buy' == this.props.orderType)
            {
                let maxQuantity = this._balance.floatValue.div(this._feesFactor).div(rate.floatValue);
                if (quantity.floatValue.gt(maxQuantity))
                {
                    quantity.floatValue = maxQuantity;
                }
                rawTotal.floatValue = quantity.floatValue.times(rate.floatValue);
                total.floatValue = rawTotal.floatValue.times(this._feesFactor);
                quantity.value = this._formatFloat(quantity.floatValue);
                rawTotal.value = this._formatFloat(rawTotal.floatValue);
                total.value = this._formatFloat(total.floatValue);
                fees.floatValue = total.floatValue.minus(rawTotal.floatValue);
                fees.value = this._formatFloat(fees.floatValue);
            }
            // ensure we have enough balance to sell this quantity
            else
            {
                if (quantity.floatValue.gt(this._balance.floatValue))
                {
                    quantity.floatValue = this._balance.floatValue;
                }
                rawTotal.floatValue = quantity.floatValue.times(rate.floatValue);
                fees.floatValue = rawTotal.floatValue.times(this._feesPercent);
                total.floatValue = rawTotal.floatValue.minus(fees.floatValue);
                quantity.value = this._formatFloat(quantity.floatValue);
                rawTotal.value = this._formatFloat(rawTotal.floatValue);
                fees.value = this._formatFloat(fees.floatValue);
                total.value = this._formatFloat(total.floatValue);
            }
        }
    }
    this.state = {
        showPriceDropdown:false,
        quantity:{value:quantity.value,floatValue:quantity.floatValue,valid:true,timestamp:null},
        rate:{value:rate.value,floatValue:rate.floatValue,valid:true,timestamp:null},
        total:{value:total.value,floatValue:total.floatValue,valid:true,timestamp:null},
        fees:{value:fees.value,floatValue:fees.floatValue},
        rawTotal:{value:rawTotal.value,floatValue:rawTotal.floatValue},
        order:{
            confirm:false,
            sending:false,
            sent:false,
            err:null,
            orderNumber:null
        }
    }
    this._handleSetRate = this._handleSetRate.bind(this);
    this._handleSetValue = this._handleSetValue.bind(this);
    this._handleSetMaxQuantity = this._handleSetMaxQuantity.bind(this);
    this._handleSetMaxTotal = this._handleSetMaxTotal.bind(this);
    this._handleCheckOrder = this._handleCheckOrder.bind(this);
    this._handleConfirmOrder = this._handleConfirmOrder.bind(this);
    this._handleCancelOrder = this._handleCancelOrder.bind(this);
    this._handleCloseOrder = this._handleCloseOrder.bind(this);
}

_getRoundedFloat(value)
{
    let type = typeof value;
    let roundedValue;
    if ('string' == type)
    {
        let floatValue = parseFloat(value);
        roundedValue = parseFloat(floatValue.toFixed(8));
        // ensure we don't round value up
        if (roundedValue > floatValue)
        {
            roundedValue = roundedValue - 0.00000001;
        }
    }
    else if ('number' == type)
    {
        roundedValue = parseFloat(value.toFixed(8));
        // ensure we don't round value up
        if (roundedValue > value)
        {
            roundedValue = roundedValue - 0.00000001;
        }
    }
    // probably a big number
    else
    {
        roundedValue = parseFloat(value.toFixed(8));
        if (value.lt(roundedValue))
        {
            roundedValue = roundedValue - 0.00000001;
        }
    }
    return roundedValue;
}

_formatFloat(value)
{
    return this._getRoundedFloat(value).toFixed(8);
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
        let timestamp = new Date().getTime();
        let newState = {
            quantity:this.state.quantity,
            rate:this.state.rate,
            total:this.state.total,
            rawTotal:this.state.rawTotal,
            fees:this.state.fees
        }
        newState.rate.floatValue = floatValue;
        newState.rate.value = this._formatFloat(floatValue);
        newState.rate.valid = true;
        newState.rate.timestamp = timestamp;
        this._updateState(newState, 'rate');
    }
}

_handleSetValue(e)
{
    let timestamp = new Date().getTime();
    let newState = {
        quantity:this.state.quantity,
        rate:this.state.rate,
        total:this.state.total,
        rawTotal:this.state.rawTotal,
        fees:this.state.fees
    }
    let value = e.target.value.trim()
    newState[e.target.id].value = value;
    newState[e.target.id].valid = true;
    if ('' == value || isNaN(value))
    {
        newState[e.target.id].valid = false;
    }
    else
    {
        newState[e.target.id].floatValue = new Big(value);
        if (newState[e.target.id].floatValue.eq(0))
        {
            newState[e.target.id].valid = false;
        }
        else
        {
            // control quantity/total to ensure we have enough to fullfil request
            if (('buy' == this.props.orderType && 'total' == e.target.id) ||
                ('sell' == this.props.orderType && 'quantity' == e.target.id))
            {
                if (newState[e.target.id].floatValue.gt(this._balance.floatValue))
                {
                    newState[e.target.id].valid = false;
                }
            }
        }
        newState[e.target.id].value = value;
        if (newState[e.target.id].valid)
        {
            newState[e.target.id].timestamp = timestamp;
        }
    }
    this._updateState(newState, e.target.id);
}

_handleSetMaxTotal(e)
{
    let timestamp = new Date().getTime();
    let newState = {
        quantity:this.state.quantity,
        rate:this.state.rate,
        total:this.state.total,
        rawTotal:this.state.rawTotal,
        fees:this.state.fees
    }
    newState.total.floatValue = this._balance.floatValue;
    newState.total.value = this._balance.value;
    newState.total.timestamp = timestamp;
    newState.total.valid = true;
    if (newState.total.floatValue.eq(0))
    {
        newState.total.valid = false;
    }
    this._updateState(newState, 'total');
}

_handleSetMaxQuantity(e)
{
    let timestamp = new Date().getTime();
    let newState = {
        quantity:this.state.quantity,
        rate:this.state.rate,
        total:this.state.total,
        rawTotal:this.state.rawTotal,
        fees:this.state.fees
    }
    newState.quantity.floatValue = this._balance.floatValue;
    newState.quantity.value = this._balance.value;
    newState.quantity.timestamp = timestamp;
    newState.quantity.valid = true;
    if (newState.quantity.floatValue.eq(0))
    {
        newState.quantity.valid = false;
    }
    this._updateState(newState, 'quantity');
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
                newState.total.valid = true;
                newState.fees.floatValue = newState.rawTotal.floatValue.times(this._feesPercent);
                if ('buy' == this.props.orderType)
                {
                    newState.total.floatValue = newState.rawTotal.floatValue.plus(newState.fees.floatValue);
                    // check if total is 0 or > balance
                    if (newState.total.floatValue.eq(0) || newState.total.floatValue.gt(this._balance.floatValue))
                    {
                        newState.total.valid = false;
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
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._feesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                    newState.quantity.valid = true;
                }
                else
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.times(this._feesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity is 0 or > balance
                    if (newState.quantity.floatValue.eq(0) || newState.quantity.floatValue.gt(this._balance.floatValue))
                    {
                        newState.quantity.valid = false;
                    }
                }
                newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                newState.quantity.value = this._formatFloat(newState.quantity.floatValue);
                newState.fees.value = this._formatFloat(newState.fees.floatValue);
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
                    if ('buy' == this.props.orderType)
                    {
                        newState.rawTotal.floatValue = newState.total.floatValue.div(this._feesFactor);
                        newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                        newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                        newState.quantity.valid = true;
                    }
                    else
                    {
                        newState.rawTotal.floatValue = newState.total.floatValue.times(this._feesFactor);
                        newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                        newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                        newState.quantity.valid = true;
                        // check if quantity is 0 or > balance
                        if (newState.quantity.floatValue.eq(0) || newState.quantity.floatValue.gt(this._balance.floatValue))
                        {
                            newState.quantity.valid = false;
                        }
                    }
                    newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                    newState.quantity.value = this._formatFloat(newState.quantity.floatValue);
                    newState.fees.value = this._formatFloat(newState.fees.floatValue);
                }
                // recompute total
                else
                {
                    newState.rawTotal.floatValue = newState.quantity.floatValue.times(newState.rate.floatValue);
                    newState.total.valid = true;
                    newState.fees.floatValue = newState.rawTotal.floatValue.times(this._feesPercent);
                    if ('buy' == this.props.orderType)
                    {
                        newState.total.floatValue = newState.rawTotal.floatValue.plus(newState.fees.floatValue);
                        // check if total is 0 or > balance
                        if (newState.total.floatValue.eq(0) || newState.total.floatValue.gt(this._balance.floatValue))
                        {
                            newState.total.valid = false;
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
            // recompute quantity
            else if ('' != newState.total.value && newState.total.valid)
            {
                if ('buy' == this.props.orderType)
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.div(this._feesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    newState.fees.floatValue = newState.total.floatValue.minus(newState.rawTotal.floatValue);
                    newState.quantity.valid = true;
                }
                else
                {
                    newState.rawTotal.floatValue = newState.total.floatValue.times(this._feesFactor);
                    newState.quantity.floatValue = newState.rawTotal.floatValue.div(newState.rate.floatValue);
                    newState.fees.floatValue = newState.rawTotal.floatValue.minus(newState.total.floatValue);
                    newState.quantity.valid = true;
                    // check if quantity is 0 or > balance
                    if (newState.quantity.floatValue.eq(0) || newState.quantity.floatValue.gt(this._balance.floatValue))
                    {
                        newState.quantity.valid = false;
                    }
                }
                newState.rawTotal.value = this._formatFloat(newState.rawTotal.floatValue);
                newState.quantity.value = this._formatFloat(newState.quantity.floatValue);
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
        total:this.state.total
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
    {
        this.setState(newState);
        if (!valid)
        {
            return false;
        }
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
        restClient.createOrder(this.props.exchange, this.props.pair, this.props.orderType, quantity, rate).then(function(data){
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

    const MaxQuantityButton = () => {
        if ('sell' == this.props.orderType)
        {
            return (
                <button className="btn btn-secondary" onClick={this._handleSetMaxQuantity}>M<small>AX</small></button>
            )
        }
        return null
    }

    const MaxTotalButton = () => {
        if ('buy' == this.props.orderType)
        {
            return (
                <button className="btn btn-secondary" onClick={this._handleSetMaxTotal}>M<small>AX</small></button>
            )
        }
        return null
    }

    const SuccessfulOrderBody = () => {
        return (
          <Row>
            <Col>
              <div className="text-success" style={{marginBottom:'10px'}}>Order successfully executed ! New order is {this.state.order.orderNumber}</div>
            </Col>
          </Row>
        )
    }

    const FailedOrderBody = () => {
        return (
          <Row>
            <Col>
              <div className="text-danger" style={{marginBottom:'10px'}}>Order failed : {this.state.order.err}</div>
            </Col>
          </Row>
        )
    }

    const OrderResultBody = () => {
        // an error occurred when sending the order
        if (null !== this.state.order.err)
        {
            return (
                <FailedOrderBody/>
            )
        }
        // successful order
        return <SuccessfulOrderBody/>
    }

    const OrderResult = () => {
        return (
          <form noValidate>
            <Row>
              <Col>
                <Card>
                  <CardHeader>
                    <strong>{orderType}</strong>
                    <small> {this.props.currency}</small>
                  </CardHeader>
                  <CardBlock className="card-body">
                    <OrderResultBody/>
                    <Row>
                      <Col>
                        <div className="float-right">
                          <button type="button" className="btn btn-secondary" onClick={this._handleCloseOrder}>C<small>OSE</small></button>
                        </div>
                      </Col>
                    </Row>
                  </CardBlock>
                </Card>
              </Col>
            </Row>
          </form>
       )
    }

    const ConfirmationForm = () => {
        return (
            <form noValidate>
                <Row>
                  <Col>
                    <Card>
                      <CardHeader>
                        <strong>{orderType}</strong>
                        <small> {this.props.currency}</small>
                        <div className="float-right"><small>{this._balance.value} {this.props.balanceCurrency} AVAIL</small></div>
                      </CardHeader>
                      <CardBlock className="card-body">
                        <Row>
                          <Col>
                              <div style={{marginBottom:'10px'}}>Do you want to {buySellAction} <strong>{this.state.quantity.value} {this.props.currency}</strong> at <strong>{this.state.rate.value} {this.props.baseCurrency}</strong> per unit, for a total of <strong>{this.state.total.value} {this.props.baseCurrency}</strong> ?</div>
                          </Col>
                        </Row>
                        <Row>
                          <Col>
                            <div className="float-right">
                              <button type="button" className="btn btn-secondary" style={{marginRight:'5px'}} onClick={this._handleConfirmOrder}>Y<small>ES</small></button>
                              <button type="button" className="btn btn-secondary" onClick={this._handleCancelOrder}>N<small>O</small></button>
                            </div>
                          </Col>
                        </Row>
                      </CardBlock>
                    </Card>
                  </Col>
                </Row>
            </form>
        )
    }

    if (this.state.order.confirm)
    {
        return (
            <ConfirmationForm/>
        )
    }
    if (this.state.order.sending)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }
    if (this.state.order.sent)
    {
        return (
            <OrderResult/>
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
              <Label htmlFor="rawTotal">T<small>OTAL</small></Label>
              <InputGroup>
                <Input disabled={true} type="text" id="rawTotal" placeholder="Total" value={this.state.rawTotal.value}/>
                <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
              </InputGroup>
            </FormGroup>
          </Col>
        </Row>
      )
    }

    let totalInfo = 'INCLUDING FEES';
    if ('sell' == this.props.orderType)
    {
        totalInfo = 'AFTER SUBSTRACTING FEE';
    }
    return (
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
                      <Label htmlFor="quantity">Q<small>UANTITY</small></Label>
                      <InputGroup>
                        <MaxQuantityButton/>
                        <Input className={!this.state.quantity.valid ? 'is-invalid' : ''} type="text" id="quantity" placeholder="Quantity" value={this.state.quantity.value} onChange={this._handleSetValue}/>
                        <span className="input-group-addon"><small>{this.props.currency}</small></span>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:!this.state.quantity.valid ? 'inline' : 'none'}}>
                        Please provide a valid quantity
                      </div>
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="rate">{bidAskType.substr(0,1)}<small>{bidAskType.substr(1)}</small></Label>
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
                        Please provide a valid rate
                      </div>
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
                        <MaxTotalButton/>
                        <Input className={!this.state.total.valid ? 'is-invalid' : ''} type="text" id="total" value={this.state.total.value} onChange={this._handleSetValue}/>
                        <span className="input-group-addon"><small>{this.props.baseCurrency}</small></span>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:!this.state.total.valid ? 'inline' : 'none'}}>
                        Please provide a valid total
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
    )
}

}

export default Order;
