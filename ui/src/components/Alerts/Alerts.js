import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import wsClient from '../../lib/WsClient';

// components
import ComponentLoadingSpinner from '../ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

const WAIT_TIMER_DELAY = 250;

class Alerts extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;

   this.state = {
       alerts:props.alerts,
       isEditing:props.isEditing,
       isDeleting:props.isDeleting,
       waitRefresh:false,
       waitDelete:false
   };
   this._waitRefreshTimer = null;
   this._waitDeleteTimer = null;
   this._wsUri = wsClient.getTickerMonitorUri(true);
}

_handleDelete(id)
{
    if (undefined !== this.props.onStartDeleting)
    {
        this.props.onStartDeleting(id, () => {
            restClient.deleteAlert(id).then(() => {
                if (!this._isMounted) {
                    return;
                }
                if (id != this.state.isDeleting.id) {
                    return;
                }
                if (undefined !== this.props.onRefresh) {
                    this.props.onRefresh(() => {
                        if (undefined !== this.props.onStopDeleting) {
                            this.props.onStopDeleting();
                        }
                    });
                }
            }).catch ((err) => {
                if (!this._isMounted) {
                    return;
                }
                if (id != this.state.isDeleting.id) {
                    return;
                }
                if (undefined !== this.props.onStopDeleting) {
                    this.props.onStopDeleting();
                }
            });
        });
    }
}

_handleEdit(id)
{
    if (undefined !== this.props.onStartEditing)
    {
        this.props.onStartEditing('edit', id);
    }
}

_handleShowDetails(id, e)
{
    e.preventDefault();
    if (undefined !== this.props.onStartEditing)
    {
        this.props.onStartEditing('show-details', id);
    }
}

_handleCreateAlert()
{
    if (undefined !== this.props.onStartEditing)
    {
        this.props.onStartEditing('create', 0);
    }
}

_handleManualRefresh()
{
    if (undefined !== this.props.onRefresh)
    {
        this.props.onRefresh();
    }
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        let state = {
            alerts:nextProps.alerts,
            isEditing:nextProps.isEditing,
            isDeleting:nextProps.isDeleting
        }
        // start waitRefresh timer
        if (state.alerts.isRefreshing)
        {
            if (null === this._waitRefreshTimer)
            {
                this._waitRefreshTimer = setTimeout(() => {
                    this.setState({waitRefresh:true});
                }, WAIT_TIMER_DELAY);
            }
        }
        else
        {
            state.waitRefresh = false;
            if (null !== this._waitRefreshTimer)
            {
                clearTimeout(this._waitRefreshTimer);
                this._waitRefreshTimer = null;
            }
        }
        // start waitDelete timer
        if (state.isDeleting.state)
        {
            if (null === this._waitDeleteTimer)
            {
                this._waitDeleteTimer = setTimeout(() => {
                    this.setState({waitDelete:true});
                }, WAIT_TIMER_DELAY);
            }
        }
        else
        {
            state.waitDelete = false;
            if (null !== this._waitDeleteTimer)
            {
                clearTimeout(this._waitDeleteTimer);
                this._waitDeleteTimer = null;
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
    if (!this.state.alerts.loaded)
    {
        return (
            <div>
                <br/>
                <ComponentLoadingSpinner/>
            </div>
        )
    }

    const editButton = (id) => {
        let canEdit = true;
        if (this.state.isEditing.state && 'edit' == this.state.isEditing.action && id == this.state.isEditing.id) {
            canEdit = false;
        }
        return (
            <button type="button" disabled={this.state.isDeleting.state || !canEdit} className="btn btn-link p-0" onClick={this._handleEdit.bind(this, id)}>
                <i className="fa fa-edit" style={{fontSize:'1.2rem'}}></i>
            </button>
        )
    }

    const deleteButton = (id) => {
        if (this.state.waitDelete && id == this.state.isDeleting.id)
        {
            return (
                <span>
                    <i className="fa fa-spinner fa-spin" style={{fontSize:'1.2rem'}}></i>
                </span>
            );
        }
        let canDelete = true;
        if (this.state.isEditing.state) {
            if (id == this.state.isEditing.id) {
                switch (this.state.isEditing.action) {
                    case 'edit':
                    case 'show-details':
                        canDelete = false;
                        break;
                }
            }
        }
        return (
            <button type="button" disabled={this.state.isDeleting.state || !canDelete} className="btn btn-link p-0" onClick={this._handleDelete.bind(this, id)}>
                <i className="fa fa-remove" style={{fontSize:'1.2rem',color:'#cc3300',paddingRight:'5px'}}></i>
            </button>
        );
    }

    const enabledDisabledIcon = (flag) => {
        if (flag) {
            return (
                <i className="fa fa-bell" style={{fontSize:'0.9rem',color:'#536c79',paddingRight:'5px'}}></i>
            )
        }
        return (
            <i className="fa fa-bell-slash" style={{fontSize:'0.9rem',color:'#536c79',paddingRight:'5px'}}></i>
        );
    }

    const showDetailsLink = (id, name) => {
        let canShow = true;
        if (this.state.isEditing.state && 'show-details' == this.state.isEditing.action && id == this.state.isEditing.id) {
            canShow = false;
        }
        if (this.state.isDeleting.state || !canShow) {
            return (
                <a>{name}</a>
            );
        }
        const href = `/#services/myAlerts/${id}`;
        return (
            <a href={href} onClick={this._handleShowDetails.bind(this, id)}>{name}</a>
        );
    }

    const getStatus = (item) => {
        if ('unknown' == item.status.value) {
            return (
                <span>{item.status.value}</span>
            );
        }
        let className = 'text-danger';
        if ('active' == item.status.value) {
            className = 'text-success';
        }
        return (
            <span className={className}>{item.status.value}</span>
        )
    }

    return (
      <div className="animated fadeIn col-lg-4 p-0">
          <br/>
          <h6>
              <span style={{marginRight:'5px'}}>ALERTS</span>
              <span style={{display:this.state.waitRefresh ? '' : 'none'}}>
                  <i className="fa fa-spinner fa-spin" style={{fontSize:'1.0rem'}}></i>
              </span>
          </h6>
          <div style={{marginBottom:'10px'}}>Alerts stream will be reachable on {this._wsUri}</div>
          <ComponentLoadedTimestamp timestamp={this.state.alerts.loadedTimestamp} err={this.state.alerts.err} onManualRefresh={this._handleManualRefresh.bind(this)}/>
          <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
            <thead className="thead-inverse">
              <tr>
                <th>NAME</th>
                <th>STATUS</th>
                <th style={{textAlign:'center'}}>ENABLED</th>
                <th style={{textAlign:'center'}}>SIZE</th>
                <th/>
                <th style={{width:'1.2rem'}}>
                    <button type="button" disabled={this.state.isDeleting.state} className="btn btn-link p-0" onClick={this._handleCreateAlert.bind(this)}>
                        <i className="fa fa-plus-square" style={{fontSize:'1.2rem'}}></i>
                    </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {
                _.map(null !== this.state.alerts.list ? this.state.alerts.list : []).map((item, index) => {
                  return <tr key={item.id}>
                      <td>{showDetailsLink(item.id, item.name)}</td>
                      <td>{getStatus(item)}</td>
                      <td style={{textAlign:'center'}}>{enabledDisabledIcon(item.enabled)}</td>
                      <td style={{textAlign:'center'}}>{item.conditions.length}</td>
                      <td style={{width:'1.2rem'}}>{deleteButton(item.id)}</td>
                      <td style={{width:'1.2rem'}}>{editButton(item.id)}</td>
                  </tr>
                })
              }
            </tbody>
          </table>
      </div>
    );
}

}

export default Alerts;
