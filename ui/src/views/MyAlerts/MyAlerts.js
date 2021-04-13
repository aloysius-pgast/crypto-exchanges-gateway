import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';

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
       isEditing:{state:false, action:undefined, id:alertId, timestamp:Date.now()},
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

   const service = serviceRegistry.getService('tickerMonitor');
   this._cfg = service.cfg;

   // auto refresh timer
   this._autoRefreshTimer = setInterval(() => {
       if (!this.state.alerts.loaded) {
           return;
       }
       this._loadAlerts(true);
   }, this._cfg.delay * 1000);
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
    this.setState({isEditing:{state:true, action:action, id:id, timestamp:Date.now()}}, () => {
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
                if (0 == list.length && prevState.isEditing.state && 0 != prevState.isEditing.id) {
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
                if (prevState.isEditing.state && 0 != prevState.isEditing.id) {
                    state.isEditing = {state:false, action:undefined, id:0};
                }
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
    clearInterval(this._autoRefreshTimer);
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

    const maxConditionsWarning = (cfg) => {
        if (0 == cfg.maxConditions)
        {
            return null;
        }
        return (
            <div>Maximum number of conditions per alert is {cfg.maxConditions}<br/></div>
        );
    }

    const maxDurationWarning = (cfg) => {
        if (0 == cfg.maxDuration)
        {
            return null;
        }
        let durationUnit = 'seconds';
        let duration = cfg.maxDuration;
        if (duration >= 3600)
        {
            duration = Math.floor(duration / 60.0);
            durationUnit = 'minutes';
            if (duration >= 14400)
            {
                duration = math.floor(duration / 60.0);
                durationUnit = 'hours';
            }
        }
        return (
            <div>Alerts will be automatically destroyed after {duration} {durationUnit}<br/></div>
        );
    }

    const Warnings = () => {
        if (0 == this._cfg.maxConditions && 0 == this._cfg.maxDuration)
        {
            return null;
        }
        return (<div style={{marginTop:'10px',color:'#e64400'}}>
            {maxConditionsWarning(this._cfg)}
            {maxDurationWarning(this._cfg)}
        </div>);
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
          <Warnings/>
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
            timestamp={this.state.isEditing.timestamp}
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
