"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const Errors = require('../errors');

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
            if (undefined !== req.ws)
            {
                req.ws.close(4403, 'FORBIDDEN_ACCESS');
                return;
            }
            res.status(403).end();
        }
        else
        {
            logger.warn("Forbidden HTTP access from %s", req.ip);
            let extError = new Errors.GatewayError.Forbidden('Forbidden access');
            return Errors.sendHttpError(res, extError);
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
    // probably a JSON parse error
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err)
    {
        let extError = new Errors.GatewayError.InvalidRequest.UnknownError('Invalid JSON body');
        return Errors.sendHttpError(res, extError);
    }
    // nothing more to do if we're dealing with a WS
    if (isWs)
    {
        return;
    }
    let extError = new Errors.GatewayError.InternalError();
    return Errors.sendHttpError(res, extError);
});

};
