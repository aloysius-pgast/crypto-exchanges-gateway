import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import conditionHelper from '../../lib/ConditionHelper';

import {
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  InputGroup
}  from "reactstrap";

// components
import ComponentLoadingSpinner from '../ComponentLoadingSpinner';
import AlertConditionEditor from '../AlertConditionEditor';

/*
    use to create a new alert or edit an existing one
 */

const WAIT_TIMER_DELAY = 250;

const getEmptyAlert = (pushover) => {
    const alert = {
        id:0,
        name:'',
        any:false,
        conditions:[],
        enabled:true,
        pushover:{
            enabled:(true === pushover)
        }
    };
    return alert;
}

class AlertEditor extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;

   this._hasPushover = (undefined !== serviceRegistry.getService('pushover'));

   this.state = {
       isVisible:props.isVisible,
       id:props.id,
       alert:{
           newName:'',
           loaded:false,
           data:null,
           loadErr:null,
           saveErr:null,
           isWaiting:false
       },
       timestamp:Date.now(),
       isEditing:false,
       isSaving:false
   }

   if (0 == this.state.id) {
       this.state.alert = {loaded:true, loadErr:null, saveErr:null, isWaiting:false, data:getEmptyAlert(this._hasPushover)};
   }

   this._timestamp = props.timestamp;

   this._timer = null;
   this._handleClose = this._handleClose.bind(this);
   this._handleEnableAlert = this._handleEnableAlert.bind(this);
   this._handleStartEditingCondition = this._handleStartEditingCondition.bind(this);
   this._handleStopEditingCondition = this._handleStopEditingCondition.bind(this);
   this._handleAddCondition = this._handleAddCondition.bind(this);
   this._handleDeleteCondition = this._handleDeleteCondition.bind(this);
   this._handleChangeActivationRequirements = this._handleChangeActivationRequirements.bind(this);
   this._handleChangeName = this._handleChangeName.bind(this);
   this._handleSaveAlert = this._handleSaveAlert.bind(this);
   this._handleEnablePushover = this._handleEnablePushover.bind(this);

}

_loadAlert(id) {
    if (null !== this._timer) {
        clearTimeout(this._timer);
    }
    this._timer = setTimeout(() => {
        this.setState((prevState, props) => {
            let state = prevState.alert;
            state.isWaiting = true;
            return {alert:state};
        });
    }, WAIT_TIMER_DELAY);
    this.setState((prevState, props) => {
        const state = prevState.alert;
        state.id = id;
        return {alert:state};
    }, () => {
        restClient.getAlert(id).then((data) => {
            if (!this._isMounted) {
                return;
            }
            if (id != this.state.id) {
                return;
            }
            if (null != this._timer) {
                clearTimeout(this._timer);
                this._timer = null;
            }
            _.forEach(data.conditions, (condition, index) => {
                // exchange condition
                if ('exchange' == condition.origin.type) {
                    const exchangeName = serviceRegistry.getExchangeName(condition.origin.id);
                    condition.origin.name = exchangeName;
                }
                // service
                else {
                    const serviceName = serviceRegistry.getServiceName(condition.origin.id);
                    condition.origin.name = serviceName;
                }
            });
            const state = {loaded:true, data:data, isWaiting:false, loadErr:null, saveErr:null, newName:data.name};
            this.setState({alert:state});

        }).catch ((err) => {
            if (!this._isMounted) {
                return;
            }
            if (id != this.state.id) {
                return;
            }
            if (null != this._timer) {
                clearTimeout(this._timer);
                this._timer = null;
            }
            const state = {loaded:true, data:null, isWaiting:false, loadErr:err, saveErr:null};
            this.setState({alert:state});
        });
    });
}

_handleClose() {
    this.setState({isVisible:false}, () => {
        if (undefined !== this.props.onStopEditing) {
            this.props.onStopEditing(false);
        }
    });
}

_handleEnableAlert(e) {
    const enabled = ('true' === e.target.value);
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.data.enabled = enabled;
        return {alert:state};
    });
}

_handleChangeActivationRequirements(e) {
    const any = ('true' === e.target.value);
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.data.any = any;
        return {alert:state};
    });
}

_handleEnablePushover(e) {
    const enabled = ('true' === e.target.value);
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.data.pushover.enabled = enabled;
        return {alert:state};
    });
}

_handleChangeName(e) {
    const name = e.target.value;
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.newName = name;
        return {alert:state};
    });
}

_handleStartEditingCondition(e) {
    this.setState({isEditing:true, timestamp:Date.now()});
}

_handleStopEditingCondition(e) {
    this.setState({isEditing:false}, () => {
        if (undefined !== this.props.onStopEditing) {
            this.props.onStopEditing(false);
        }
    });
}

_handleAddCondition(condition) {
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.data.conditions.push(condition);
        return {alert:state, isEditing:false};
    });
}

_handleDeleteCondition(index) {
    this.setState((prevState, props) => {
        let state = prevState.alert;
        state.data.conditions.splice(index, 1);
        return {alert:state};
    });
}

_handleSaveAlert() {
    const alert = this.state.alert.data;

    const newAlert = {
        name:this.state.alert.newName,
        enabled:alert.enabled,
        any:alert.any,
        conditions:[]
    };
    alert.conditions.forEach((item, i) => {
        const c = {
            origin:{
                type:item.origin.type,
                id:item.origin.id
            },
            condition:{
                field:item.condition.field,
                operator:item.condition.operator,
                value:item.condition.value
            }
        };
        if (undefined !== item.condition.pair) {
            c.condition.pair = item.condition.pair;
        }
        else {
            c.condition.symbol = item.condition.symbol;
        }
        newAlert.conditions.push(c);
    });
    if (undefined !== alert.pushover) {
        newAlert.pushover = alert.pushover;
    }
    let promise;
    // update alert
    if (0 !== alert.id) {
        promise = restClient.updateAlert(newAlert, alert.id);
    }
    // create alert
    else {
        promise = restClient.createAlert(newAlert);
    }

    const timer = setTimeout(() => {
        this.setState({isWaitingSave:true});
    }, WAIT_TIMER_DELAY);

    this.setState({isSaving:true}, () => {
        promise.then(() => {
            this.setState((prevState, props) => {
                let state = prevState.alert;
                state.saveErr = null;
                clearTimeout(timer);
                return {isSaving:false, isWaitingSave:false, alert:state};
            }, () => {
                if (undefined !== this.props.onStopEditing) {
                    this.props.onStopEditing(true);
                }
            });
        }).catch((err) => {
            this.setState((prevState, props) => {
                let state = prevState.alert;
                state.saveErr = err;
                clearTimeout(timer);
                return {isSaving:false, isWaitingSave:false, alert:state};
            });
        });
    });
}

componentWillReceiveProps(nextProps)
{
    const state = {isVisible:nextProps.isVisible, id:nextProps.id, isSaving:false};

    const timestamp = this._timestamp;
    this._timestamp = nextProps.timestamp;

    if (0 == state.id && timestamp != this._timestamp) {
        state.isEditing = false;
        state.alert = {loaded:true, loadErr:null, saveErr:null, isWaiting:false, data:getEmptyAlert(this._hasPushover), newName:''};
    }
    this.setState(state, () => {
        if (this.state.isVisible && 0 != this.state.id) {
            this._loadAlert(this.state.id);
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
        this._loadAlert(this.state.id);
    }
}

render()
{
    if (!this.state.isVisible) {
        return null;
    }

    if (!this.state.alert.loaded) {
        if (this.state.alert.isWaiting) {
            return (
                <div>
                    <ComponentLoadingSpinner/>
                </div>
            );
        }
        return null;
    }

    if (null !== this.state.alert.loadErr) {
        let errMessage = this.state.alert.loadErr.message;
        if (undefined !== this.state.alert.loadErr.error) {
            errMessage = this.state.alert.loadErr.error;
        }
        return (<span className="text-danger"><strong>Error: {errMessage}</strong></span>)
    }

    const serializeCondition = (item) => {
        return (
            <div>
                <span>{conditionHelper.getFieldDescriptionFromCondition(item)} of</span>&nbsp;
                <span style={{fontWeight:'bold'}}>{conditionHelper.getEntity(item)}</span>&nbsp;
                <span>{conditionHelper.getOperatorDescriptionFromCondition(item)}</span>&nbsp;
                <span>{conditionHelper.getValue(item)}</span>&nbsp;
            </div>
        )
    }

    const saveErrMessage = () => {
        if (null === this.state.alert.saveErr) {
            return null;
        }
        let errMessage = this.state.alert.saveErr.message;
        if (undefined !== this.state.alert.saveErr.error) {
            errMessage = this.state.alert.saveErr.error;
        }
        return (<div className="text-danger" style={{marginTop:'20px'}}><strong>Error: {errMessage}</strong></div>)
    }

    const waitingSave = () => {
        if (!this.state.isWaitingSave) {
            return null;
        }
        return (
            <span style={{marginLeft:'10px'}}>
              <ComponentLoadingSpinner/>
            </span>
        );
    }

    let canSave = true;
    if (this.state.isEditing || this.state.isSaving || 0 == this.state.alert.data.conditions.length || '' == this.state.alert.newName.trim()) {
        canSave = false;
    }

    let title = 'NEW ALERT';
    if (0 != this.state.id) {
        title = `EDIT ALERT ${this.state.alert.data.name}`;
    }

    return (
        <div className="animated fadeIn">
            <h6 style={{marginBottom:'15px'}}>
                <span style={{marginRight:'5px'}}>{title}</span>
                <button type="button" className="btn btn-link p-0" onClick={this._handleClose}>
                    <i className="fa fa-times-circle" style={{fontSize:'1.2rem'}}></i>
                </button>
            </h6>
            <div className="mr-sm-auto mr-md-5 mb-1">
                <form noValidate>
                    <Row>
                      <Col>
                        <FormGroup>
                          <Label htmlFor="name">Name</Label>
                          <Input className="form-control-sm" style={{maxWidth:'250px'}} type="text" id="name" placeholder="Name" onChange={this._handleChangeName} value={this.state.alert.newName}/>
                        </FormGroup>
                        <FormGroup>
                          <Label htmlFor="enable">Enable</Label>
                          <InputGroup>
                              <select id="enable" className="custom-select form-control-sm" style={{backgroundColor:"white"}} onChange={this._handleEnableAlert} value={this.state.alert.data.enabled}>
                                <option value={true}>Yes</option>
                                <option value={false}>No</option>
                              </select>
                          </InputGroup>
                        </FormGroup>
                        <FormGroup>
                          <Label htmlFor="any">Alert will become active if</Label>
                          <InputGroup>
                              <select id="any" className="custom-select form-control-sm" style={{backgroundColor:"white"}} onChange={this._handleChangeActivationRequirements} value={this.state.alert.data.any}>
                                <option value={false}>All conditions become active</option>
                                <option value={true}>Any condition becomes active</option>
                              </select>
                          </InputGroup>
                        </FormGroup>
                        <FormGroup style={{display:this._hasPushover ? '' : 'none'}}>
                          <Label htmlFor="any">Enable Pushover notifications</Label>
                          <InputGroup>
                              <select id="enablePushover" className="custom-select form-control-sm" style={{backgroundColor:"white"}} onChange={this._handleEnablePushover} value={this.state.alert.data.pushover.enabled}>
                                <option value={true}>Yes</option>
                                <option value={false}>No</option>
                              </select>
                          </InputGroup>
                        </FormGroup>
                      </Col>
                    </Row>
                </form>
            </div>
            <div className="col-lg-4 p-0 mb-3">
                <table className="table table-responsive table-sm" style={{fontSize:'0.80rem',marginBottom:'0.75rem'}}>
                    <thead className="thead-inverse">
                        <tr>
                            <th>ORIGIN</th>
                            <th>CONDITION</th>
                            <th style={{width:'1.2rem'}}>
                                <button type="button" className="btn btn-link p-0" onClick={this._handleStartEditingCondition}>
                                    <i className="fa fa-plus-square" style={{fontSize:'1.2rem'}}></i>
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                    {
                        this.state.alert.data.conditions.map((item, index) => {
                            return <tr key={index}>
                                <td>{item.origin.name}</td>
                                <td>{serializeCondition(item)}</td>
                                <td style={{width:'1.2rem'}}>
                                    <button type="button" className="btn btn-link p-0" onClick={this._handleDeleteCondition.bind(this, index)}>
                                        <i className="fa fa-remove" style={{fontSize:'1.2rem',color:'#cc3300',paddingRight:'5px'}}></i>
                                    </button>
                                </td>
                            </tr>
                        })
                    }
                    </tbody>
                </table>
                <div>
                  <button type="button" disabled={!canSave} className="btn btn-secondary" onClick={this._handleSaveAlert}>S<small>AVE</small></button>
                  {waitingSave()}
                </div>
                {saveErrMessage()}
            </div>
            <AlertConditionEditor
                isVisible={this.state.isEditing}
                timestamp={this.state.timestamp}
                onCancel={this._handleStopEditingCondition}
                onCondition={this._handleAddCondition}
            />
        </div>
    );
}

}

export default AlertEditor;
