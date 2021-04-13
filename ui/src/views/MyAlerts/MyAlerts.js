import React, { Component } from 'react';
import restClient from '../../lib/RestClient';

// components
import Alerts from '../../components/Alerts';
import AlertEditor from '../../components/AlertEditor';
import AlertDetails from '../../components/AlertDetails';

class MyAlerts extends Component
{

constructor(props) {
   super(props);
   let alertId = (undefined === props.match.params.alertId) ? 0 : parseInt(props.match.params.alertId);
   if (isNaN(alertId)) {
       alertId = 0;
   }
   this.state = {
       alerts:{loaded:false, isRefreshing:false, list:null, err:null},
       isEditing:{state:false, action:undefined, id:alertId},
       isDeleting:{state:false, id:0}
   }
   if (0 != alertId) {
       this.state.isEditing.state = true;
       this.state.isEditing.action = 'show-details';
   }
   this._handleStartEditing = this._handleStartEditing.bind(this);
   this._handleStopEditing = this._handleStopEditing.bind(this);
   this._handleStartDeleting = this._handleStartDeleting.bind(this);
   this._handleStopDeleting = this._handleStopDeleting.bind(this);
   this._handleRefresh = this._handleRefresh.bind(this);
}

_handleRefresh(cb) {
    this._loadAlerts(true, () => {
        if (undefined !== cb) {
            cb();
        }
    });
}

_handleStartEditing(action, id, cb)
{
    this.setState({isEditing:{state:true, action:action, id:id}}, () => {
        if (undefined !== cb) {
            cb();
        }
    });
}

_handleStopEditing(shouldRefresh, cb)
{
    this.setState({isEditing:{state:false, action:undefined, id:0}}, () => {
        if (shouldRefresh) {
            this._loadAlerts(true);
        }
        if (undefined !== cb) {
            cb();
        }
    });
}

_handleStartDeleting(id, cb)
{
    this.setState({isDeleting:{state:true, id:id}}, () => {
        if (undefined !== cb) {
            cb();
        }
    });
}

_handleStopDeleting(cb)
{
    this.setState({isDeleting:{state:false, id:0}}, () => {
        if (undefined !== cb) {
            cb();
        }
    });
}

_loadAlerts(isRefreshing, cb)
{
    this.setState((prevState, props) => {
        let state = prevState.alerts;
        state.isRefreshing = isRefreshing;
        return {alerts:state};
    }, () => {
        restClient.getAlerts().then((data) => {
            if (!this._isMounted)
            {
                return;
            }
            const list = data;
            // sort by name
            list.sort((a,b) => {
                if (a.name.toLowerCase() <= b.name.toLowerCase()) {
                    return -1;
                }
                return 1;
            });
            const timestamp = Date.now();
            this.setState((prevState, props) => {
                const alerts = {loaded:true, isRefreshing:false, loadedTimestamp:timestamp, list:list, err:null};
                const state = {alerts:alerts};
                if (0 == list.length) {
                    state.isEditing = {state:false, action:undefined, id:0};
                }
                return state;
            }, () => {
                if (undefined !== cb)
                {
                    cb();
                }
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            const timestmap = Date.now();
            this.setState((prevState, props) => {
                const alerts = {loaded:true, isRefreshing:false, loadedTimestamp:timestamp, list:null, err:err};
                const state = {alerts:alerts, isEditing:{state:false, action:undefined, id:0}};
                return state;
            }, () => {
                if (undefined !== cb)
                {
                    cb();
                }
            });
        });
    });
}

componentWillReceiveProps(nextProps) {
    let alertId = (undefined === nextProps.match.params.alertId) ? 0 : parseInt(nextProps.match.params.alertId);
    if (isNaN(alertId)) {
        alertId = 0;
    }
    if (0 == alertId) {
        this.setState({isEditing:{state:false, action:undefined, id:0}});
    }
    else {
        this.setState({isEditing:{state:true, action:'show-details', id:alertId}});
    }
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._loadAlerts(false);
}

render()
{
    let showEditor = false;
    let showDetails = false;

    if (this.state.isEditing.state) {
        switch (this.state.isEditing.action) {
            case 'edit':
            case 'create':
                showEditor = true;
                break;
            case 'show-details':
                showDetails = true;
                break;
        }
    }

    const loadErrMessage = () => {
        if (null === this.state.alerts.err) {
            return null;
        }
        let errMessage = this.state.alerts.err.message;
        if (undefined !== this.state.alerts.err.error) {
            errMessage = this.state.alerts.err.error;
        }
        return (<span className="text-danger"><strong>Error: {errMessage}</strong></span>)
    }

    return (
      <div className="animated fadeIn" style={{marginBottom:'150px'}}>
          <Alerts
              alerts={this.state.alerts}
              isEditing={this.state.isEditing}
              isDeleting={this.state.isDeleting}
              onStartEditing={this._handleStartEditing}
              onStartDeleting={this._handleStartDeleting}
              onStopDeleting={this._handleStopDeleting}
              onRefresh={this._handleRefresh}
              onLoad={this._handleLoad}
          />
          {loadErrMessage()}
          <AlertEditor
            isVisible={showEditor}
            id={this.state.isEditing.id}
            onStopEditing={this._handleStopEditing}
          />
          <AlertDetails
            isVisible={showDetails}
            id={this.state.isEditing.id}
            onStopEditing={this._handleStopEditing}
          />
      </div>
    )

}

}

export default MyAlerts;
