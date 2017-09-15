"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const ipfilter = require('express-ipfilter').IpFilter;

module.exports = function(app, bodyParser, config) {

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

    // check apiKey
    if (config.auth.apiKey.enabled)
    {
        let key = req.headers.apikey;
        if (config.auth.apiKey.key != key)
        {
            logger.warn("Unauthorized access from %s", req.ip)
        }
        res.status(401).send({origin:"gateway",error:'Unauthorized access'});
        return;
    }
    next();
});

};
