import React from 'react';
import ReactDOM from 'react-dom';
import {HashRouter, Route, Switch} from 'react-router-dom';
import {createBrowserHistory} from 'history';

// Styles
// Import Font Awesome Icons Set
import 'font-awesome/css/font-awesome.min.css';
  // Import Simple Line Icons Set
import 'simple-line-icons/css/simple-line-icons.css';
// Import Main styles for this application
import '../scss/style.scss'

import App from './App';
import Auth from './views/Auth';

// Config & http/ws clients
import config from './lib/Config';
import restClient from './lib/RestClient';
import wsClient from './lib/WsClient';
import serviceRegistry from './lib/ServiceRegistry';

window.ctx = {hasLocalStorage:true};
let apiKey = null;

// check if localStorage is supported
if (undefined === window.localStorage)
{
    window.ctx.hasLocalStorage = false;
}
else
{
    // try to set dummy data
    let timestamp = parseInt(new Date().getTime() / 1000);
    try
    {
        window.localStorage.setItem('dummy', timestamp);
    }
    // if private mode is enabled, we should have an exception
    catch(e)
    {
        window.ctx.hasLocalStorage = false;
    }
}
// try to retrieve api key from local storage
if (window.ctx.hasLocalStorage)
{
    let value = window.localStorage.getItem('apiKey');
    if (null !== value)
    {
        try
        {
            let obj = JSON.parse(value);
            apiKey = obj.key;
        }
        catch (e)
        {
            // remove previous key
            window.localStorage.removeItem('apiKey');
        }
    }
    // migrate previous starred pairs
    let legacyStarredPairs = [];
    let migratedStarredPairs = {};
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('starredPair:'))
        {
            continue;
        }
        let value = window.localStorage.getItem(key);
        // entry was removed (not supposed to happen)
        if (null === value)
        {
            continue;
        }
        let obj = JSON.parse(value);
        let version = 0;
        if (undefined !== obj.version)
        {
            version = parseInt(obj.version);
        }
        if (version >= 1)
        {
            continue;
        }

        legacyStarredPairs.push(key);
        let newKey = `starredPair:${obj.exchange}:${obj.pair}`;
        obj.version = 1;
        migratedStarredPairs[newKey] = obj;
    }
    // declare new keys
    _.forEach(migratedStarredPairs, (obj, key) => {
        let data = JSON.stringify(obj);
        window.localStorage.setItem(key, data);
    });
    // remove legacy keys
    _.forEach(legacyStarredPairs, (key) => {
        window.localStorage.removeItem(key);
    });
}
// try to retrieve api key from session storage
let value = window.sessionStorage.getItem('apiKey');
if (null !== value)
{
    try
    {
        let obj = JSON.parse(value);
        apiKey = obj.key;
    }
    catch (e)
    {
        // nothing to do
    }
}

// load Config
config.load().then(function(result){

    // initialize rest client
    restClient.initialize(config.config.restEndpoint);
    restClient.setApiKey(apiKey);

    // check apiKey
    restClient.getServerStatus().then(function(result){
        // initialize ws client
        wsClient.initialize(config.config.wsEndpoint);
        wsClient.setApiKey(apiKey);

        // load available services
        serviceRegistry.load().then(function(result){
            // we're all setup now
            const history = createBrowserHistory();

            ReactDOM.render((
                <HashRouter history={history}>
                    <Switch>
                        <Route path="/" component={App}/>
                    </Switch>
                </HashRouter>
            ), document.getElementById('root'));
        });
    }).catch (function(err){
        // invalid api key
        if (undefined !== err.response && 401 == err.response.status)
        {
            ReactDOM.render((
              <Auth/>
            ), document.getElementById('root'));
        }
    });
});
