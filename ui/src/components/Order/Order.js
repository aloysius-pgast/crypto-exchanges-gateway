import React, { Component } from 'react';
import restClient from '../../lib/RestClient';

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
    let rate;
    let quantity = '';
    let total = '';
    // initialize so that order can be fulfilled directly using market price
    if ('buy' == this.props.orderType)
    {
        rate = this.props.ticker.sell.toFixed(8);
    }
    else
    {
        rate = this.props.ticker.buy.toFixed(8);
    }
    if (null !== this.props.rate)
    {
        rate = this.props.rate;
        // do we have a quantity ?
        if (null !== this.props.quantity)
        {
            let floatRate = parseFloat(rate);
            let floatQuantity = parseFloat(this.props.quantity);
            // ensure we have enough balance to buy this quantity
            if ('buy' == this.props.orderType)
            {
                let maxQuantity = this.props.balance / floatRate;
                if (floatQuantity > maxQuantity)
                {
                    floatQuantity = maxQuantity;
                }
                quantity = this._formatFloat(floatQuantity);
                total = this._formatFloat(floatQuantity * floatRate);
            }
            // ensure we have enough balance to sell this quantity
            else
            {
                if (floatQuantity > this.props.balance)
                {
                    floatQuantity = this.props.balance;
                }
                quantity = this._formatFloat(floatQuantity);
                total = this._formatFloat(floatQuantity * floatRate);
            }
        }
    }
    this.state = {
        showPriceDropdown:false,
        quantity:{value:quantity,valid:true,timestamp:null},
        rate:{value:rate,valid:true,timestamp:null},
        total:{value:total,valid:true,timestamp:null},
        order:{
            confirm:false,
            sending:false,
            sent:false,
            err:null,
            orderNumber:null
        }
    }
    this._balance = this._formatFloat(this.props.balance);
    this._handleSetRate = this._handleSetRate.bind(this);
    this._handleSetValue = this._handleSetValue.bind(this);
    this._handleSetMaxQuantity = this._handleSetMaxQuantity.bind(this);
    this._handleSetMaxTotal = this._handleSetMaxTotal.bind(this);
    this._handleCheckOrder = this._handleCheckOrder.bind(this);
    this._handleConfirmOrder = this._handleConfirmOrder.bind(this);
    this._handleCancelOrder = this._handleCancelOrder.bind(this);
    this._handleCloseOrder = this._handleCloseOrder.bind(this);
}

_formatFloat(value)
{
    let roundedValue = parseFloat(value.toFixed(8));
    // ensure we don't round value up
    if (roundedValue > value)
    {
        roundedValue = roundedValue - 0.00000001;
    }
    return roundedValue.toFixed(8);
}

_handleSetRate(e)
{
    let value;
    switch (e.target.id)
    {
        case 'last':
            value = this.props.ticker.last.toFixed(8);
            break;
        case 'bid':
            value = this.props.ticker.buy.toFixed(8);
            break;
        case 'ask':
            value = this.props.ticker.sell.toFixed(8);
            break;
    }
    if (undefined !== value)
    {
        let timestamp = new Date().getTime();
        let newState = {
            quantity:this.state.quantity,
            rate:this.state.rate,
            total:this.state.total
        }
        newState.rate.value = value;
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
        total:this.state.total
    }
    let value = e.target.value.trim()
    if ('' == value || isNaN(value))
    {
        newState[e.target.id].value = value;
        newState[e.target.id].valid = false;
    }
    else
    {
        // control quantity/total to ensure we have enough to fullfil request
        let valid = true;
        if (('buy' == this.props.orderType && 'total' == e.target.id) ||
            ('sell' == this.props.orderType && 'quantity' == e.target.id)
        )
        {
            let floatValue = parseFloat(value);
            let balance = parseFloat(this._balance);
            if (floatValue > balance || 0 == floatValue)
            {
                valid = false;
            }
        }
        newState[e.target.id].value = value;
        newState[e.target.id].valid = valid;
        if (valid)
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
        total:this.state.total
    }
    newState.total.value = this._balance;
    newState.total.timestamp = timestamp;
    newState.total.valid = true;
    let floatValue = parseFloat(newState.total.value);
    if (0 == floatValue)
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
        total:this.state.total
    }
    newState.quantity.value = this._balance;
    newState.quantity.timestamp = timestamp;
    newState.quantity.valid = true;
    let floatValue = parseFloat(newState.quantity.value);
    if (0 == floatValue)
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
                newState.total.value = this._formatFloat(parseFloat(newState.quantity.value) * parseFloat(newState.rate.value));
                newState.total.valid = true;
                // check if total is 0 or > balance
                if ('buy' == this.props.orderType)
                {
                    let floatValue = parseFloat(newState.total.value);
                    let balance = parseFloat(this._balance);
                    if (0 == floatValue || floatValue > balance)
                    {
                        newState.total.valid = false;
                    }
                }
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
                newState.quantity.value = this._formatFloat(parseFloat(newState.total.value) / parseFloat(newState.rate.value));
                newState.quantity.valid = true;
                // check if quantity is 0 or > balance
                if ('sell' == this.props.orderType)
                {
                    let floatValue = parseFloat(newState.quantity.value);
                    let balance = parseFloat(this._balance);
                    if (0 == floatValue || floatValue > balance)
                    {
                        newState.quantity.valid = false;
                    }
                }
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
                    newState.quantity.value = this._formatFloat(parseFloat(newState.total.value) / parseFloat(newState.rate.value));
                    newState.quantity.valid = true;
                    // check if quantity is 0 or > balance
                    if ('sell' == this.props.orderType)
                    {
                        let floatValue = parseFloat(newState.quantity.value);
                        let balance = parseFloat(this._balance);
                        if (0 == floatValue || floatValue > balance)
                        {
                            newState.quantity.valid = false;
                        }
                    }
                }
                // recompute total
                else
                {
                    newState.total.value = this._formatFloat(parseFloat(newState.quantity.value) * parseFloat(newState.rate.value));
                    newState.total.valid = true;
                    // check if total is 0 or > balance
                    if ('buy' == this.props.orderType)
                    {
                        let floatValue = parseFloat(newState.total.value);
                        let balance = parseFloat(this._balance);
                        if (0 == floatValue || floatValue > balance)
                        {
                            newState.total.valid = false;
                        }
                    }
                }
            }
            // recompute quantity
            else if ('' != newState.total.value && newState.total.valid)
            {
                newState.quantity.value = this._formatFloat(parseFloat(newState.total.value) / parseFloat(newState.rate.value));
                newState.quantity.valid = true;
                // check if quantity is 0 or > balance
                if ('sell' == this.props.orderType)
                {
                    let floatValue = parseFloat(newState.quantity.value);
                    let balance = parseFloat(this._balance);
                    if (0 == floatValue || floatValue > balance)
                    {
                        newState.quantity.valid = false;
                    }
                }
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
                        <div className="float-right"><small>{this._balance} {this.props.balanceCurrency} AVAIL</small></div>
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
    let balance = parseFloat(this._balance);
    let balanceClassnames = "float-right";
    if (0 == balance)
    {
        balanceClassnames += " text-danger";
    }
    return (
        <form noValidate>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <strong>{orderType}</strong>
                <small> {this.props.currency}</small>
                <div className={balanceClassnames}><small>{this._balance} {this.props.balanceCurrency} AVAIL</small></div>
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
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="total">T<small>OTAL</small></Label>
                      <InputGroup>
                        <MaxTotalButton/>
                        <Input className={!this.state.total.valid ? 'is-invalid' : ''} type="text" id="total" placeholder="Estimated total" value={this.state.total.value} onChange={this._handleSetValue}/>
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
