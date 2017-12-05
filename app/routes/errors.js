"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');

/**
 * Default error handler
 */

module.exports = function(app, config, isWs) {

// handle authentication
app.use(function (err, req, res, next) {
    // in case access is forbidden by ip filtering
    if ('IpDeniedError' == err.name)
    {
        if (isWs)
        {
            logger.warn("Forbidden WS access from %s", req.ip);
            res.status(403).end();
        }
        else
        {
            logger.warn("Forbidden HTTP access from %s", req.ip);
            res.status(403).send({origin:"gateway",error:'Forbidden access'});
        }
        return;
    }
    if (undefined !== err.stack)
    {
        logger.error(err.stack);
    }
    else
    {
        logger.error(err);
    }
    // nothing more to do if we're dealing with a WS
    if (isWs)
    {
        return;
    }
    res.status(503).send({origin:"gateway",error:'An error occurred'});
    return;
});

};
