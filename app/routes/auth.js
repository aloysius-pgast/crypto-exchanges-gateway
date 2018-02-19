"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const ipfilter = require('express-ipfilter').IpFilter;

module.exports = function(app, config, isWs) {

// do we need to filter ip ?
if (config.auth.ipFilter.enabled)
{
    let opt = {mode:'allow', log:false};
    if (config.auth.trustProxy.enabled)
    {
        // rely on the ip provided by express since we're filtering allowed proxies & don't use allowedHeaders (express will automatically use x-forwarded-for)
        opt.detectIp = function(req){
            return req.ip;
        };
    }
    app.use(ipfilter(config.auth.ipFilter.allow, opt));
}

// handle authentication
app.use(function (req, res, next) {

    if (!isWs && 'OPTIONS' == req.method)
    {
        res.status(200).end();
        return;
    }
    // check apiKey
    if (config.auth.apiKey.enabled)
    {
        if (isWs)
        {
            let key = req.headers.apikey;
            // check if we have a query parameter (browser does not allow to set custom headers)
            if (undefined === key)
            {
                if (undefined !== req.query && undefined !== req.query.apiKey)
                {
                    key = req.query.apiKey;
                }
            }
            if (config.auth.apiKey.key != key)
            {
                logger.warn("Unauthorized WS access from %s", req.ip)
                if (undefined !== req.ws)
                {
                    req.ws.close(4401, 'UNAUTHORIZED_ACCESS');
                    return;
                }
                res.status(401).end();
                return;
            }
            next();
            return;
        }
        let key = req.headers.apikey;
        if (config.auth.apiKey.key != key)
        {
            // allow access to UI so that we can display authentication form
            if (config.ui.enabled)
            {
                if ('/' == req.path || 0 === req.path.indexOf('/ui'))
                {
                    next();
                    return;
                }
            }
            // don't log favicon
            if ('/favicon.ico' == req.path)
            {
                next();
                return;
            }
            logger.warn("Unauthorized HTTP access from %s", req.ip)
            res.status(401).send({origin:"gateway",error:'Unauthorized access'});
            return;
        }
    }
    next();
});

};
