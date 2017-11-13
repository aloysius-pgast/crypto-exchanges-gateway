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

// Config
import config from './lib/Config';
import restClient from './lib/RestClient';
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
    restClient.initialize(config.config.apiEndpoint);
    restClient.setApiKey(apiKey);

    // check apiKey
    restClient.getServerStatus().then(function(result){
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
            console.log('enter api key');
        }
        ReactDOM.render((
          <Auth/>
        ), document.getElementById('root'));
    });
});
