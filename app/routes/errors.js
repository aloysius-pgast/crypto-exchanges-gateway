"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');

/**
 * Default error handler
 */

module.exports = function(app, bodyParser, config) {

// handle authentication
app.use(function (err, req, res, next) {
    // in case access is forbidden by ip filtering
    if ('IpDeniedError' == err.name)
    {
        logger.warn("Forbidden access from %s", req.ip);
        res.status(403).send({origin:"gateway",error:'Forbidden access'});
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
    res.status(503).send({origin:"gateway",error:'An error occurred'});
    return;
});

};
