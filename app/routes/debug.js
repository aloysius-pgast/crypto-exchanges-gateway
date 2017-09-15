"use strict";
const util = require('util');
const url = require('url');
const logger = require('winston');
const _ = require('lodash');

/**
 * Used to log requests
 */

module.exports = function(app, bodyParser, config) {

app.get('*', (req, res, next) => {
    if ('debug' != logger.level)
    {
        next();
        return;
    }
    let u = url.parse(req.url);
    // don't log favicon
    if ('/favicon.ico' == u.pathname)
    {
        next();
        return;
    }
    if (null === u.query || '' == u.query)
    {
        logger.debug("%s %s %s", req.ip, req.method, u.pathname);
    }
    else
    {
        logger.debug("%s %s %s ?%s", req.ip, req.method, u.pathname, u.query);
    }
    next();
});

app.delete('*', (req, res, next) => {
    if ('debug' != logger.level)
    {
        next();
        return;
    }
    let u = url.parse(req.url);
    // don't log favicon
    if ('/favicon.ico' == u.pathname)
    {
        next();
        return;
    }
    if (null === u.query || '' == u.query)
    {
        logger.debug("%s %s %s", req.ip, req.method, u.pathname);
    }
    else
    {
        logger.debug("%s %s %s ?%s", req.ip, req.method, u.pathname, u.query);
    }
    next();
});

app.post('*', bodyParser, (req, res, next) => {
    if ('debug' != logger.level)
    {
        next();
        return;
    }
    let u = url.parse(req.url);
    // log full query
    let message = util.format('%s %s %s', req.ip, req.method, req.url);
    let params = {};
    if (!_.isEmpty(req.query))
    {
        _.assign(params, req.query);
    }
    if (!_.isEmpty(req.body))
    {
        _.merge(params, req.body);
    }
    if (_.isEmpty(params))
    {
        logger.debug("%s %s %s", req.ip, req.method, u.pathname);
    }
    else
    {
        let query = _.map(params, function(value, key){
            return util.format('%s=%s', key, value);
        }).join('&');
        logger.debug("%s %s %s ?%s", req.ip, req.method, u.pathname, query);
    }
    next();
});

}
