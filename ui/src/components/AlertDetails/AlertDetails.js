import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import conditionHelper from '../../lib/ConditionHelper';

/*
    used to display details regarding an alert
 */

// components
import ComponentLoadingSpinner from '../ComponentLoadingSpinner';

const WAIT_TIMER_DELAY = 250;

class AlertDetails extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isVisible:props.isVisible,
       id:props.id,
       alert:{
           loaded:false,
           data:null,
           loadErr:null,
           isWaiting:false
       }
   }
   this._timer = null;
   this._handleClose = this._handleClose.bind(this);
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
            const state = {loaded:true, data:data, isWaiting:false, loadErr:null};
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
            const state = {loaded:true, data:null, isWaiting:false, loadErr:err};
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

componentWillReceiveProps(nextProps)
{
    this.setState({isVisible:nextProps.isVisible, id:nextProps.id}, () => {
        if (this.state.isVisible) {
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

    if (null !== this.state.alert.err) {
        let errMessage = this.state.alert.err.message;
        if (undefined !== this.state.alert.err.error) {
            errMessage = this.state.alert.err.error;
        }
        return (<span className="text-danger"><strong>Error: {errMessage}</strong></span>)
    }

    const getEntityLink = (item) => {
        let entity = conditionHelper.getEntity(item);
        if ('invalid' == item.status.value) {
            return (
                <span>{entity}</span>
            );
        }
        if ('exchange' == item.origin.type) {
            let href;
            switch (item.condition.field) {
                case 'last':
                case 'buy':
                case 'sell':
                    href = `#/exchanges/${item.origin.id}/orderBooks/${entity}`;
                    break;
                default:
                    href = `#/exchanges/${item.origin.id}/prices/${entity}`;
                    break;
            }
            return (
                <a href={href}>{entity}</a>
            );
        }
        else if ('service' == item.origin.type) {
            if ('marketCap' == item.origin.id) {
                const href = `#/services/marketCap/${entity}`;
                return (
                    <a href={href}>{entity}</a>
                );
            }
        }
        return (
            <span>{entity}</span>
        )
    }

    const serializeCondition = (item) => {
        return (
            <div>
                <span>{conditionHelper.getFieldDescriptionFromCondition(item)} of</span>&nbsp;
                <span style={{fontWeight:'bold'}}>{getEntityLink(item)}</span>&nbsp;
                <span>{conditionHelper.getOperatorDescriptionFromCondition(item)}</span>&nbsp;
                <span>{conditionHelper.getValue(item)}</span>&nbsp;
            </div>
        )
    }

    const getStatus = (item) => {
        if ('unknown' == item.status.value) {
            return (
                <div>{item.status.value}</div>
            );
        }
        else if ('invalid' == item.status.value) {
            return (
                <div className="text-danger">{item.status.value}</div>
            );
        }
        let className = 'text-danger';
        if ('active' == item.status.value) {
            className = 'text-success';
        }
        return (
            <div>
                <span className={className}>{item.status.value}</span>&nbsp;
                <span>({item.value})</span>
            </div>
        )
    }

    const activationRequirements = () => {
        if (this.state.alert.data.any) {
            return (
                <span>Alert will become active if <b>any condition</b> becomes active</span>
            );
        }
        return (
            <span>Alert will become active if <b>all conditions</b> become active</span>
        )
    }

    return (
        <div className="animated fadeIn">
            <h6 style={{marginBottom:'15px'}}>
                <span style={{marginRight:'5px'}}>DETAILS FOR ALERT {this.state.alert.data.name}</span>
                <button type="button" className="btn btn-link p-0" onClick={this._handleClose.bind(this)}>
                    <i className="fa fa-times-circle" style={{fontSize:'1.2rem'}}></i>
                </button>
            </h6>
            <div style={{marginBottom:'10px'}}>{activationRequirements()}</div>
            <div className="col-lg-4 p-0">
                <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
                    <thead className="thead-inverse">
                        <tr>
                            <th>ORIGIN</th>
                            <th>STATUS</th>
                            <th>CONDITION</th>
                        </tr>
                    </thead>
                    <tbody>
                    {
                        this.state.alert.data.conditions.map((item, index) => {
                            return <tr key={index}>
                                <td>{item.origin.name}</td>
                                <td>{getStatus(item)}</td>
                                <td>{serializeCondition(item)}</td>
                            </tr>
                        })
                    }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

}

export default AlertDetails;
