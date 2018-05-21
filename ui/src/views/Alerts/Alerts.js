import React, { Component } from 'react';

import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

class Alerts extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       isFirstLoad:true,
       loaded:false,
       isRefreshing:false,
       updateTimestamp:0,
       err:null,
       data:null
   }
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps) {}

componentDidMount()
{
    this._isMounted = true;
    this._loadData();
}

_loadData()
{
    let self = this;
    restClient.getAlerts().then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let newState = {loaded:true, isRefreshing:false, updateTimestamp:timestamp, firstLoad:false, data:data};
        self.setState(newState);
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        let newState = {isRefreshing:false, updateTimestamp:timestamp, firstLoad:false};
        self.setState(newState);
    });
}

render()
{
    if (!this.state.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }
    if (null !== this.state.err && !this.state.loaded)
    {
        return null;
    }
    return (
        <div>TODO</div>
    )
}

}

export default Alerts;
