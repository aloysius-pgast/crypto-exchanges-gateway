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
import starredPairs from './lib/StarredPairs';
import dataStore from './lib/DataStore';
import standaloneContext from './lib/StandaloneContext';

window.ctx = {
    hasLocalStorage:true,
    isMobile:/Mobile|Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)
};
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
    // load starred pairs
    starredPairs.load();
    // load standaloneContext
    standaloneContext.load();
    if (standaloneContext.isSupported())
    {
        // force route to '/' (it will be changed later based on localStorage)
        window.location.hash = '/';
        dataStore.updateFromStandaloneContext();
    }
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
    restClient.getServerStatus().then((result) => {
        // initialize ws client
        wsClient.initialize(config.config.wsEndpoint);
        wsClient.setApiKey(apiKey);

        // load server config
        restClient.getServerConfig().then((result) => {
            dataStore.setData('serverConfig', result);

            // load available services
            serviceRegistry.load().then((result) => {
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

        });

    }).catch (function(err){
        // invalid api key
        if ('GatewayError.Forbidden' == err.extError.errorType)
        {
            ReactDOM.render((
              <Auth/>
            ), document.getElementById('root'));
        }
    });
});
