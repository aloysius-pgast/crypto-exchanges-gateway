import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';
import conditionHelper from '../../lib/ConditionHelper';

import AlertConditionForExchange from '../AlertConditionForExchange';
import AlertConditionForMarketCap from '../AlertConditionForMarketCap';

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

class AlertConditionEditor extends Component
{

constructor(props) {
   super(props);

   this._isMounted = false;
   this.state = {
       isVisible:props.isVisible,
       origin:{type:'', id:''},
       canAdd:false
   };
   //-- exchanges
   this._exchanges = {};
   this._exchangesNames = [];
   _.forEach(serviceRegistry.getExchanges(), (e, id) => {
       let exchange = {id:id, name:e.name};
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
   // services
   const supportedServices = conditionHelper.getSupportedServices();
   this._services = {};
   this._servicesNames = [];
   _.forEach(serviceRegistry.getServices(), (e, id) => {
       if (!supportedServices.includes(id)) {
           return;
       }
       let service = {id:id, name:e.name};
       this._services[service.id] =  service;
       this._servicesNames.push({id:service.id, name:service.name});
   });
   this._servicesNames = this._servicesNames.sort((a, b) => {
      if (a.name <= b.name)
      {
          return -1;
      }
      return 1;
   });
   this._condition = null;
   this._handleCondition = this._handleCondition.bind(this);
}

_handleCondition(condition) {
    this._condition = condition;
    this.setState({canAdd:(null !== this._condition)});
}

_handleSelectOrigin(event)
{
    let origin = event.target.value;
    this.setState((prevState, props) => {
        let state = prevState.origin;
        state.id = origin;
        return state;
    });
}

_handleSelectOriginType(event)
{
    const originType = event.target.value;
    if ('' == originType) {
        this.setState({origin:{type:originType, id:''}});
        return;
    }
    if ('exchange' == originType) {
        let origin = '';
        if (1 == this._exchangesNames.length)
        {
            origin = this._exchangesNames[0].id;
        }
        this.setState({origin:{type:originType, id:origin}});
    }
    else if ('service' == originType) {
        let origin = '';
        if (1 == this._servicesNames.length)
        {
            origin = this._servicesNames[0].id;
        }
        this.setState({origin:{type:originType, id:origin}});
    }
}

_handleCancel(event)
{
    if (undefined !== this.props.onCancel)
    {
        this.props.onCancel();
    }
}

_handleAdd(event)
{
    if (undefined !== this.props.onCondition)
    {
        const condition = {
            condition:this._condition,
            origin:{
                type:this.state.origin.type,
                id:this.state.origin.id
            }
        };
        if ('exchange' == condition.origin.type) {
            const exchangeName = serviceRegistry.getExchangeName(condition.origin.id);
            condition.origin.name = exchangeName;
        }
        // service
        else {
            const serviceName = serviceRegistry.getServiceName(condition.origin.id);
            condition.origin.name = serviceName;
        }
        this.props.onCondition(condition);
    }
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        let state = {
            isVisible:nextProps.isVisible,
            condition:null,
            canAdd:false,
            err:null
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
    if (!this.state.isVisible)
    {
        return null;
    }

    const chooseOrigin = () => {
        if ('exchange' == this.state.origin.type) {
            if ('' != this.state.origin.id)
            {
                return null;
            }
        }
        else if ('service' == this.state.origin.type) {
            if ('' != this.state.origin.id)
            {
                return null;
            }
        }
        return (<option key="choose" value="">Choose</option>)
    }

    const chooseOriginType = () => {
        if (0 == this._exchangesNames.length || 0 == this._servicesNames.length) {
            return null;
        }
        return (<option key="choose" value="">Choose</option>)
    }

    const originList = () => {
        if ('' == this.state.origin.type) {
            return null;
        }
        if ('exchange' == this.state.origin.type) {
            return (
                <select id="origin" className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectOrigin.bind(this)} value={this.state.origin.id}>
                  {chooseOrigin()}
                  {
                    _.map(this._exchangesNames).map((item, index) => {
                      return <option key={item.id} value={item.id}>{item.name}</option>
                    })
                  }
                </select>
            );
        }
        if ('service' == this.state.origin.type) {
            return (
                <select id="origin" className="custom-select" style={{backgroundColor:"white"}} onChange={this._handleSelectOrigin.bind(this)} value={this.state.origin.id}>
                  {chooseOrigin()}
                  {
                    _.map(this._servicesNames).map((item, index) => {
                        return <option key={item.id} value={item.id}>{item.name}</option>
                    })
                  }
                </select>
            )
        }
        return null;
    }

    return (
        <div className="col-sm-6 col-lg-4 p-0">
            <form noValidate>
            <Row style={{paddingTop:'5px'}}>
              <Col>
                <Card>
                  <CardHeader>
                    <strong>NEW CONDITION</strong>
                  </CardHeader>
                  <CardBlock className="card-body">
                    <Row>
                      <Col>
                        <FormGroup>
                          <Label htmlFor="originType">O<small>RIGIN</small>
                          </Label>
                          <InputGroup>
                              <select id="originType" className="custom-select" style={{backgroundColor:"white",marginRight:'10px'}} onChange={this._handleSelectOriginType.bind(this)} value={this.state.origin.type}>
                                {chooseOriginType()}
                                <option key="exchange" value="exchange">Exchange</option>
                                <option key="service" value="service">Service</option>
                              </select>
                              {originList()}
                          </InputGroup>
                        </FormGroup>
                      </Col>
                    </Row>
                    <Row style={{display:('exchange' == this.state.origin.type && '' !== this.state.origin.id) ? '' : 'none'}}>
                      <Col>
                        <AlertConditionForExchange
                          exchange={'exchange' == this.state.origin.type ? this.state.origin.id : ''}
                          onCondition={this._handleCondition}
                        />
                      </Col>
                    </Row>
                    <Row style={{display:('service' == this.state.origin.type && 'marketCap' == this.state.origin.id) ? '' : 'none'}}>
                      <Col>
                        <AlertConditionForMarketCap
                          isVisible={'service' == this.state.origin.type && 'marketCap' == this.state.origin.id}
                          onCondition={this._handleCondition}
                        />
                      </Col>
                    </Row>
                  </CardBlock>
                  <CardFooter className="d-flex align-items-center justify-content-end">
                    <button type="button" style={{marginLeft:'10px'}} className="btn btn-secondary" onClick={this._handleCancel.bind(this)}>C<small>ANCEL</small></button>
                    <button type="button" style={{marginLeft:'10px'}} disabled={!this.state.canAdd} onClick={this._handleAdd.bind(this)} className="btn btn-secondary">A<small>DD</small></button>
                  </CardFooter>
                </Card>
              </Col>
            </Row>
            </form>
        </div>
    )
}

}

export default AlertConditionEditor;
