import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';
import restClient from '../../lib/RestClient';
import dataStore from '../../lib/DataStore';

import ComponentLoadingSpinner from '../ComponentLoadingSpinner';

import {
  Row,
  Col,
  Card, CardHeader, CardFooter, CardBlock,
  FormGroup,
  Label,
  Input,
  InputGroup,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  Modal, ModalHeader, ModalBody, ModalFooter
} from "reactstrap";

const getTypeName = (type) => {
    switch (type)
    {
        case 'tickers':
            return 'Tickers';
        case 'orderBooks':
            return 'Order Books';
        case 'trades':
            return 'Trades';
        case 'klines':
            return 'Klines';
    }
}

const getType = (feature) => {
    switch (feature)
    {
        case 'wsTickers':
            return 'tickers';
        case 'wsOrderBooks':
            return 'orderBooks';
        case 'wsTrades':
            return 'trades';
        case 'wsKlines':
            return 'klines';
    }
}

const WAIT_TIMER_DELAY = 250;

class SubscriptionEditor extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isDisabled:props.isDisabled,
       isAdding:props.isAdding,
       isEditing:props.isEditing,
       exchange:'',
       type:'',
       pair:'',
       klinesInterval:'',
       pairFilter:'',
       filteredPairs:[],
       pairs:{loaded:false, isLoading:false, loadedTimestamp:0, err:null, data:null},
       isValid:true,
       waitAdd:false,
       limitReached:false
   };
   this._exchanges = {};
   this._exchangesNames = [];
   let filteredFeatures = ['wsTickers', 'wsOrderBooks', 'wsTrades','wsKlines'];
   _.forEach(serviceRegistry.getExchanges(), (e, id) => {
       let exchange = {id:id, name:e.name, types:[], klinesIntervals:[], defaultKlinesInterval:''};
       if (e.features['wsKlines'].enabled)
       {
           exchange.klinesIntervals = e.features['wsKlines'].intervals;
           exchange.defaultKlinesInterval = e.features['wsKlines'].defaultInterval;
       }
       _.forEach(filteredFeatures, (feature) => {
           if (e.features[feature].enabled)
           {
               exchange.types.push(getType(feature));
           }
       });
       if (0 == exchange.types.length)
       {
           return;
       }
       this._exchanges[exchange.id] =  exchange;
       this._exchangesNames.push({id:exchange.id, name:exchange.name});
   });
   this._exchangesNames = this._exchangesNames.sort((a, b) => {
      if (a.name <= b.name)
      {
          return -1;
      }
      return 1;
   });
   if (1 == this._exchangesNames.length)
   {
       this.state.exchange = this._exchangesNames[0].id;
       if (1 == this._exchanges[this.state.exchange].types.length)
       {
           this.state.type = this._exchanges[this.state.exchange].types[0];
       }
   }
   this._waitAddTimer = null;
   this._maxSubscriptions = dataStore.getData('serverConfig').sessions.maxSubscriptions;
   if (0 != this._maxSubscriptions)
   {
       if (this.state.isEditing.enabled && this.state.isEditing.size >= this._maxSubscriptions)
       {
           this.state.limitReached = true;
       }
   }
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
        console.error(err);
        let timestamp = Date.now();
        let state = {loaded:true, isLoading:false, loadedTimestamp:timestamp, err:err, data:null};
        this.setState({pairs:state});
    });
}

_handleClearPairFilter(event)
{
    this.setState((prevState, props) => {
        return {pair:'', pairFilter:'',filteredPairs:[]};
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
        let state = {isValid:true,pairFilter:pair,filteredPairs:[],pair:pair};
        state.isAdding = prevState.isAdding;
        state.isAdding.err = null;
        return state;
    });
}

_handleSelectExchange(event)
{
    let exchange = event.target.value;
    let klinesInterval = '';
    if ('' != exchange)
    {
        klinesInterval = this._exchanges[exchange].defaultKlinesInterval;
    }
    this.setState((prevState, props) => {
        let state = {isValid:true,exchange:exchange, type:'', pair:'', klinesInterval:klinesInterval, pairFilter:'',filteredPairs:[], pairs:{loaded:false, isLoading:false, err:null, data:null}};
        state.isAdding = prevState.isAdding;
        state.isAdding.err = null;
        return state;
    }, () => {
        if ('' != this.state.exchange)
        {
            this._loadPairs();
        }
    });
}

_handleSelectType(event)
{
    let value = event.target.value;
    this.setState((prevState, props) => {
        let state = {isValid:true,type:value};
        state.isAdding = prevState.isAdding;
        state.isAdding.err = null;
        return state;
    });
}

_handleSelectKlinesInterval(event)
{
    let value = event.target.value;
    this.setState((prevState, props) => {
        let state = {isValid:true,klinesInterval:value};
        state.isAdding = prevState.isAdding;
        state.isAdding.err = null;
        return state;
    });
}

_handleCancel(event)
{
    if (undefined !== this.props.onClose)
    {
        this.props.onClose();
    }
}

_handleAdd()
{
    let item = {
        sid:this.state.isEditing.sid,
        exchange:this.state.exchange,
        klinesInterval:this.state.klinesInterval,
        type:this.state.type,
        pair:this.state.pair,
    }
    let isValid = true;
    if (undefined !== this.props.onCheckSubscription)
    {
        isValid = this.props.onCheckSubscription(item);
    }
    this.setState({isValid:isValid}, () => {
        if (!isValid)
        {
            return;
        }
        if (undefined !== this.props.onAdd)
        {
            this.props.onAdd(item);
        }
    });
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        let state = {
            isDisabled:nextProps.isDisabled,
            isAdding:nextProps.isAdding,
            isEditing:nextProps.isEditing,
            limitReached:false
        }
        if (state.isEditing.enabled)
        {
            if (!prevState.isEditing.enabled)
            {
                state.isValid = true;
            }
            if (0 != this._maxSubscriptions)
            {
                if (state.isEditing.size >= this._maxSubscriptions)
                {
                    state.limitReached = true;
                }
            }
        }
        // start waitAdd timer
        if (state.isAdding.enabled)
        {
            if (null === this._waitAddTimer)
            {
                this._waitAddTimer = setTimeout(() => {
                    this.setState({waitAdd:true});
                }, WAIT_TIMER_DELAY);
            }
        }
        else
        {
            state.waitAdd = false;
            if (null !== this._waitAddTimer)
            {
                clearTimeout(this._waitAddTimer);
                this._waitAddTimer = null;
            }
        }
        return state;
    });
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
    if (!this.state.isEditing.enabled)
    {
        return null;
    }

    const chooseExchange = () => {
        if ('' != this.state.exchange)
        {
            return null;
        }
        return (<option key="choose" value="">Choose</option>)
    }

    const chooseType = () => {
        if ('' != this.state.type)
        {
            return null;
        }
        return (<option key="choose" value="">Choose</option>)
    }

    const chooseKlinesInterval = () => {
        if ('' != this.state.klinesInterval)
        {
            return null;
        }
        return (<option key="choose" value="">Choose</option>)
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
        return (<span className="text-danger"><strong>Error: {this.state.pairs.err.message}</strong></span>)
    }

    const LoadingError = () => {
        <InputGroup style={{display:null !== this.state.pairs.err || this.state.pairs.loading ? '' : 'none'}}>
          <span className="text-danger"><strong>Error: {this.state.err.message}</strong></span>
          <span className="text-danger"><strong>Error: {this.state.err.message}</strong></span>
        </InputGroup>
    }

    const errorMessage = () => {
        if (this.state.isValid && null === this.state.isAdding.err)
        {
            return null;
        }
        if (null !== this.state.isAdding.err)
        {
            let message = this.state.isAdding.err.message;
            if (undefined !== this.state.isAdding.err.extError)
            {
                message = this.state.isAdding.err.extError.message;
            }
            return (<span>{message}</span>);
        }
        return (<span>This subscription already exists</span>);
    }

    let exchange = this.state.exchange;
    let types = [];
    let klinesIntervals = [];
    if ('' != this.state.exchange)
    {
        types = this._exchanges[this.state.exchange].types;
        klinesIntervals = this._exchanges[this.state.exchange].klinesIntervals;
    }

    return (
        <div className="col-sm-6 col-lg-4 p-0">
            <form noValidate>
            <Row style={{paddingTop:'5px'}}>
              <Col>
                <Card>
                  <CardHeader>
                    <strong>NEW SUBSCRIPTION</strong>
                  </CardHeader>
                  <CardBlock className="card-body">
                    <Row>
                      <Col>
                        <FormGroup>
                          <Label htmlFor="exchange">E<small>XCHANGE</small>
                          </Label>
                          <InputGroup>
                              <select disabled={this.state.isDisabled} id="exchange" className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectExchange.bind(this)} value={this.state.exchange}>
                                {chooseExchange()}
                                {
                                  _.map(this._exchangesNames).map((item, index) => {
                                    return <option key={item.id} value={item.id}>{item.name}</option>
                                  })
                                }
                              </select>
                          </InputGroup>
                        </FormGroup>
                      </Col>
                    </Row>
                    <Row style={{display:'' !== this.state.exchange ? '' : 'none'}}>
                      <Col>
                        <FormGroup>
                          <Label htmlFor="type">T<small>YPE</small>
                          </Label>
                          <InputGroup>
                              <select disabled={this.state.isDisabled} className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectType.bind(this)} value={this.state.type}>
                                {chooseType()}
                                {
                                  _.map(types).map((type, index) => {
                                    return <option key={type} value={type}>{getTypeName(type)}</option>
                                  })
                                }
                              </select>
                          </InputGroup>
                        </FormGroup>
                      </Col>
                    </Row>
                    <Row style={{display:'' !== this.state.exchange && 'klines' == this.state.type ? '' : 'none'}}>
                      <Col>
                        <FormGroup>
                          <Label htmlFor="type">I<small>NTERVAL</small>
                          </Label>
                          <InputGroup>
                              <select disabled={this.state.isDisabled} className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectKlinesInterval.bind(this)} value={this.state.klinesInterval}>
                                {chooseKlinesInterval()}
                                {
                                  _.map(klinesIntervals).map((interval, index) => {
                                    return <option key={interval} value={interval}>{interval}</option>
                                  })
                                }
                              </select>
                          </InputGroup>
                        </FormGroup>
                      </Col>
                    </Row>
                    <Row style={{display:'' !== this.state.exchange && (this.state.pairs.loaded || this.state.pairs.isLoading) ? '' : 'none'}}>
                      <Col>
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
                      </Col>
                    </Row>
                    <div className="invalid-feedback" style={{display:(!this.state.isValid || null !== this.state.isAdding.err) ? 'inline' : 'none'}}>
                      {errorMessage()}
                    </div>
                  </CardBlock>
                  <CardFooter className="d-flex align-items-center justify-content-end">
                    <span className="" style={{display:this.state.waitAdd ? '' : 'none'}}><i className="fa fa-spinner fa-spin" style={{fontSize:'1.0rem'}}/></span>
                    <button type="button" style={{marginLeft:'10px'}} disabled={this.state.isDisabled} className="btn btn-secondary" onClick={this._handleCancel.bind(this)}>C<small>ANCEL</small></button>
                    <button type="button" style={{marginLeft:'10px'}} disabled={this.state.isDisabled || this.state.limitReached || ('' == this.state.exchange || '' == this.state.type || '' == this.state.pair) || ('klines' == this.state.type && '' == this.state.klinesInterval)} className="btn btn-secondary" onClick={this._handleAdd.bind(this)}>A<small>DD</small></button>
                  </CardFooter>
                </Card>
              </Col>
            </Row>
            </form>
        </div>
    )
}

}

export default SubscriptionEditor;
