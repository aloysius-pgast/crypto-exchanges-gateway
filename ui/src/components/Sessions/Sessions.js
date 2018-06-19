import React, { Component } from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';
import {
    Card, CardHeader, CardBlock,
    Label, Input,
    Modal, ModalHeader, ModalBody, ModalFooter
} from 'reactstrap';

// components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

const getSessionId = (name) => {
    return `mystream.${name}`;
}

const WAIT_TIMER_DELAY = 250;

class Sessions extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isDisabled:props.isDisabled,
       sessions:props.sessions,
       isEditing:props.isEditing,
       isCreating:props.isCreating,
       isDeleting:props.isDeleting,
       modal:{
           show:false,
           streamName:'',
           invalid:false,
           err:null
       },
       waitRefresh:false,
       waitDelete:false
   };
   this._waitRefreshTimer = null;
   this._waitDeleteTimer = null;
}

_handleDelete(sid)
{
    if (undefined !== this.props.onDelete)
    {
        this.props.onDelete(sid);
    }
}

_handleEdit(sid)
{
    if (undefined !== this.props.onEdit)
    {
        this.props.onEdit(sid);
    }
}

_handleOpenModal()
{
    this.setState({modal:{show:true,streamName:'',invalid:false,err:null}});
}

_handleCancelModal()
{
    this.setState({modal:{show:false,streamName:'',invalid:false,err:null}});
}

_handleSetStreamName(e)
{
    let name = e.target.value;
    this.setState((prevState, props) => {
        let state = prevState.modal;
        state.streamName = name;
        state.invalid = '' == state.streamName;
        state.err = null;
        return {modal:state};
    });
}

_handleAdd()
{
    if ('' == this.state.modal.streamName)
    {
        this.setState((prevState, props) => {
            let state = prevState.modal;
            state.invalid = true;
            return {modal:state};
        });
        return;
    }
    // check if stream exists
    let sid = getSessionId(this.state.modal.streamName);
    // already exist
    if (undefined !== this.state.sessions.list[sid])
    {
        this.setState((prevState, props) => {
            let state = prevState.modal;
            state.invalid = true;
            return {modal:state};
        });
        return;
    }
    if (undefined !== this.props.onCreate)
    {
        this.setState((prevState, props) => {
            let state = prevState.modal;
            state.err = null;
            return {modal:state};
        }, () => {
            this.props.onCreate(sid);
        });
    }
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        let state = {
            isDisabled:nextProps.isDisabled,
            sessions:nextProps.sessions,
            isEditing:nextProps.isEditing,
            isCreating:nextProps.isCreating,
            isDeleting:nextProps.isDeleting
        }
        // creation error
        if (null !== state.isCreating.err)
        {
            if (prevState.modal.show)
            {
                state.modal = prevState.modal;
                state.modal.err = state.isCreating.err;
            }
        }
        // close modal
        else
        {
            if (prevState.modal.show)
            {
                state.modal = prevState.modal;
                state.modal.show = false;
            }
        }
        // start waitRefresh timer
        if (state.sessions.isRefreshing)
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
    if (!this.state.sessions.loaded)
    {
        return (
            <div>
                <br/>
                <ComponentLoadingSpinner/>
            </div>
        )
    }

    const editButton = (sid) => {
        return (
            <button disabled={this.state.isDisabled || (this.state.isEditing.enabled && sid == this.state.isEditing.session.sid)} type="button" className="btn btn-link p-0" onClick={this._handleEdit.bind(this, sid)}>
                <i className="fa fa-edit" style={{fontSize:'1.2rem'}}></i>
            </button>
        )
    }

    const deleteButton = (sid) => {
        if (this.state.waitDelete && sid == this.state.isDeleting.sid)
        {
            return (
                <span>
                    <i className="fa fa-spinner fa-spin" style={{fontSize:'1.2rem'}}></i>
                </span>
            );
        }
        return (
            <button disabled={this.state.isDisabled || (this.state.isEditing.enabled && sid == this.state.isEditing.session.sid)} type="button" className="btn btn-link p-0" onClick={this._handleDelete.bind(this, sid)}>
                <i className="fa fa-remove" style={{fontSize:'1.2rem',color:'#cc3300',paddingRight:'5px'}}></i>
            </button>
        );
    }

    const errorMessage = () => {
        if (!this.state.modal.invalid && null === this.state.modal.err)
        {
            return null;
        }
        if (null !== this.state.modal.err)
        {
            return (<span>{this.state.modal.err.message}</span>);
        }
        if ('' == this.state.modal.streamName)
        {
             return (<span>Please provide a name</span>);
        }
        return (<span>A stream named <i>{this.state.modal.streamName}</i> already exists</span>);
    }

    return (
      <div className="animated fadeIn col-lg-4 p-0">
          <br/>
          <h6>
              <span style={{marginRight:'5px'}}>STREAMS</span>
              <span style={{display:this.state.waitRefresh ? '' : 'none'}}>
                  <i className="fa fa-spinner fa-spin" style={{fontSize:'1.0rem'}}></i>
              </span>
          </h6>
          <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
            <thead className="thead-inverse">
              <tr>
                <th>NAME</th>
                <th>CREATED</th>
                <th>SIZE</th>
                <th/>
                <th style={{width:'1.2rem'}}>
                    <button type="button" disabled={this.state.isDisabled || this.state.sessions.isRefreshing} className="btn btn-link p-0" onClick={this._handleOpenModal.bind(this)}>
                        <i className="fa fa-plus-square" style={{fontSize:'1.2rem'}}></i>
                    </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {
                _.map(null !== this.state.sessions.sidList ? this.state.sessions.sidList : []).map((sid, index) => {
                  let item = this.state.sessions.list[sid];
                  return <tr key={sid}>
                      <td>{item.name}</td>
                      <td>{dateTimeHelper.formatDateTime(item.creationTimestamp * 1000)}</td>
                      <td>{item.subscriptions.length}</td>
                      <td style={{width:'1.2rem'}}>{deleteButton(item.sid)}</td>
                      <td style={{width:'1.2rem'}}>{editButton(item.sid)}</td>
                  </tr>
                })
              }
            </tbody>
          </table>
          <form noValidate>
            <Modal isOpen={this.state.modal.show} fade={!this.state.modal.show}>
              <CardHeader>
                <strong>ADD NEW STREAM</strong>
              </CardHeader>
              <div>
                <ModalBody>
                  <div style={{marginBottom:'10px'}}>
                    <Label htmlFor="streamName">Enter stream name</Label>
                    <Input disabled={this.state.isCreating.enabled} className={this.state.modal.invalid ? 'is-invalid' : ''} type="text" id="streamName" placeholder="Stream name" value={this.state.modal.streamName}
                        onChange={this._handleSetStreamName.bind(this)}
                        onKeyPress={event => {
                            if (event.key === "Enter") {
                                this._handleAdd();
                            }
                        }}
                    />
                  </div>
                  <div className="invalid-feedback" style={{display:this.state.modal.invalid || null !== this.state.modal.err ? 'inline' : 'none'}}>
                  {errorMessage()}
                  </div>
                </ModalBody>
                <ModalFooter>
                  <span className="" style={{display:this.state.isCreating.enabled ? '' : 'none'}}><i className="fa fa-spinner fa-spin" style={{fontSize:'1.2rem'}}/></span>
                  <button type="button" disabled={this.state.isCreating.enabled || this.state.modal.invalid} className="btn btn-secondary" onClick={this._handleAdd.bind(this)} style={{marginRight:'5px'}}>A<small>DD</small></button>
                  <button type="button" disabled={this.state.isCreating.enabled} className="btn btn-secondary" onClick={this._handleCancelModal.bind(this)} >C<small>ANCEL</small></button>
                </ModalFooter>
              </div>
            </Modal>
          </form>
      </div>
    );
}

}

export default Sessions;
