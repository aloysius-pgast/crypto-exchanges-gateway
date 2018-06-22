import React, { Component } from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';
import wsClient from '../../lib/WsClient';
import dataStore from '../../lib/DataStore';

const getTypeName = (type) => {
    switch (type)
    {
        case 'tickers':
            return 'Tickers';
        case 'orderBooks':
            return 'Order Book';
        case 'trades':
            return 'Trades';
    }
}

const WAIT_TIMER_DELAY = 250;

class SessionEditor extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isDisabled:props.isDisabled,
       isEditing:props.isEditing,
       isDeleting:props.isDeleting,
       waitDelete:false,
       limitReached:false
   };
   this._waitDeleteTimer = null;
   this._maxSubscriptions = dataStore.getData('serverConfig').sessions.maxSubscriptions;
   if (0 != this._maxSubscriptions)
   {
       if (this.state.isEditing.enabled && this.state.isEditing.size >= this._maxSubscriptions)
       {
           this.state.limitReached = true;
       }
   }
}

_handleEdit(sid)
{
    if (undefined !== this.props.onEdit)
    {
        this.props.onEdit(sid);
    }
}

_handleClose()
{
    if (undefined !== this.props.onClose)
    {
        this.props.onClose();
    }
}

_handleDelete(item)
{
    if (undefined !== this.props.onDelete)
    {
        this.props.onDelete(item);
    }
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        let state = {
            isDisabled:nextProps.isDisabled,
            isEditing:nextProps.isEditing,
            isDeleting:nextProps.isDeleting,
            limitReached:false
        };
        if (state.isEditing.enabled)
        {
            if (0 != this._maxSubscriptions)
            {
                if (state.isEditing.session.subscriptions.length >= this._maxSubscriptions)
                {
                    state.limitReached = true;
                }
            }
        }
        // start waitDelete timer
        if (state.isDeleting.enabled)
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
    if (!this.state.isEditing.enabled)
    {
        return null;
    }

    const getTitle = () => {
        let label = 'STREAM';
        if (this.state.isEditing.isNew)
        {
            label = 'NEW STREAM';
        }
        return (
            <h6>
                <span style={{marginRight:'5px'}}>{label} {this.state.isEditing.session.name}</span>
                <button type="button" disabled={this.state.isDisabled} className="btn btn-link p-0" onClick={this._handleClose.bind(this)}>
                    <i className="fa fa-times-circle" style={{fontSize:'1.2rem'}}></i>
                </button>
            </h6>
        );
    }

    const deleteButton = (item) => {
        if (this.state.waitDelete && _.isEqual(item, this.state.isDeleting.item))
        {
            return (
                <span>
                    <i className="fa fa-spinner fa-spin" style={{fontSize:'1.2rem'}}></i>
                </span>
            );
        }
        return (
            <button disabled={this.state.isDisabled} type="button" className="btn btn-link p-0" onClick={this._handleDelete.bind(this, item)}>
                <i className="fa fa-remove" style={{fontSize:'1.2rem',color:'#cc3300',paddingRight:'5px'}}></i>
            </button>
        );
    }
    let streamUri = wsClient.getStreamUri(this.state.isEditing.session.sid);
    let wsInspectorUri = `wsInspector/#${this.state.isEditing.session.name}`;
    return (
        <div className="col-lg-4 p-0">
            <div>{getTitle()}</div>
            <div style={{marginBottom:'10px'}}>Stream is reachable on <a target="_blank" href={wsInspectorUri}>{streamUri}</a></div>
            <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
              <thead className="thead-inverse">
                <tr>
                  <th>EXCHANGE</th>
                  <th>TYPE</th>
                  <th>PAIR</th>
                  <th>ADDED</th>
                  <th style={{width:'1.2rem'}}>
                      <button disabled={this.state.isDisabled || this.state.limitReached} type="button" className="btn btn-link p-0" onClick={this._handleEdit.bind(this, this.state.isEditing.session.sid)}>
                          <i className="fa fa-plus-square" style={{fontSize:'1.2rem'}}></i>
                      </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {
                  _.map(this.state.isEditing.session.subscriptions).map((item, index) => {
                    item.sid = this.state.isEditing.session.sid;
                    let key = `${item.sid}-${item.exchange}-${item.type}-${item.timestamp}`  ;
                    return <tr key={key}>
                        <td>{item.exchangeName}</td>
                        <td>{getTypeName(item.type)}</td>
                        <td>{item.pair}</td>
                        <td>{dateTimeHelper.formatDateTime(item.timestamp * 1000)}</td>
                        <td style={{width:'1.2rem'}}>{deleteButton(item)}</td>
                    </tr>
                  })
                }
              </tbody>
            </table>
        </div>
    )
}

}

export default SessionEditor;
