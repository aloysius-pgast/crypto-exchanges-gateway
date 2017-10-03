import React, { Component } from 'react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import restClient from '../../lib/RestClient';
import dateTimeHelper from '../../lib/DateTimeHelper';
import serviceRegistry from '../../lib/ServiceRegistry';
import routeRegistry from '../../lib/RouteRegistry';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

class DashBoard extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this._starredPairs = [];
   this.state = {
       readmeLoaded:false,
       loaded:false,
       content:null,
       err: null
   };
   this._baseUrlList = {};
   this._readme = null;
}

_loadReadme()
{
    let self = this;
    let p = {
        method:'get',
        url:'dashboard.md'
    }
    axios(p).then(function(response) {
        if (!self._isMounted)
        {
            return;
        }
        self._readme = response.data;
        self.setState((prevState, props) => {
          return {readmeLoaded:true};
        });
    }).catch(function(err){
        // nothing to do
    });
}

_loadData()
{
    let self = this;
    restClient.getServerStatus(this.props.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          return {err:null, loaded:true, data: data};
        });
    }).catch (function(err){
        self.setState((prevState, props) => {
          return {loaded:true, err:err};
        });
    });
}

_loadStarredPairs()
{
    if (!window.ctx.hasLocalStorage)
    {
        return;
    }
    let keys = [];
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('starredPair:'))
        {
            continue;
        }
        keys.push(key);
    }
    if (0 == keys.length)
    {
        return;
    }
    let self = this;
    let pairs = [];
    _.forEach(keys, (k) => {
        let data = window.localStorage.getItem(k);
        if (null === data)
        {
            return;
        }
        let obj = JSON.parse(data);
        // update url
        obj.url = self._baseUrlList[obj.exchange] + obj.pair;
        obj.exchangeName = serviceRegistry.getExchangeName(obj.exchange);
        pairs.push(obj);
    });
    this._starredPairs = pairs.sort(function(a,b){
        return a.timestamp < b.timestamp ? -1 : 1;
    });
}

_getBaseUrlList()
{
    let routes = routeRegistry.getExchangesRoutes();
    _.forEach(routes, (item, exchange) => {
        this._baseUrlList[exchange] = '#' + item['prices']['path'] + '/';
    })
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._getBaseUrlList();
    this._loadStarredPairs();
    this._loadReadme();
    this._loadData();
}

render()
{
    const ReadMe = () => {
        if (null === this._readme)
        {
            return null;
        }
        return (
            <div>
                <br/>
                <ReactMarkdown source={this._readme}/>
            </div>
        )
    }

    const ServerStatus = () => {
        if (null !== this.state.err)
        {
            return (
              <div className="text-danger">
                Gateway does not seem to be running !
              </div>
            )
        }
        let startTimestamp = new Date().getTime() - this.state.data.uptime * 1000;
        return (
          <div className="text-success">
            Gateway is running since {dateTimeHelper.formatDateTime(startTimestamp)}
          </div>
        )
    }

    const starredPairEntry = (item, index) => {
        let title = item.exchangeName + ' / ' + item.pair;
        return (
            <a key={index} href={item.url} className="list-group-item list-group-item-action">{title}</a>
        )
    }

    const starredPairsEntries = () => {
        return _.map(this._starredPairs, (item, index) => starredPairEntry(item, index));
    }

    const StarredPairs = () => {
        if (0 == this._starredPairs.length)
        {
            return null;
        }
        return (
            <div>
                <br/>
                <h6>Starred pairs</h6>
                <ul className="list-group">
                {starredPairsEntries()}
                </ul>
            </div>
        )
    }

    if (!this.state.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }
    return (
      <div className="animated fadeIn">
        <br/>
        <ServerStatus/>
        <ReadMe/>
        <StarredPairs/>
      </div>
    )
}

}

export default DashBoard;
