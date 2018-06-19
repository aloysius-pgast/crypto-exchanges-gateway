"use strict";
const util = require('util');

class RequestHelper
{

static getParam(req, param)
{
    if (undefined !== req.body && undefined !== req.body[param])
    {
        return req.body[param];
    }
    if (undefined !== req.query && undefined !== req.query[param])
    {
        return req.query[param];
    }
    return undefined;
}

static getEndpoints(req, config)
{
    // use req.headers.host instead of req.hostname to ensure port number is preserved
    let proto = req.protocol;
    if (undefined !== req.headers['x-forwarded-proto'])
    {
        proto = req.headers['x-forwarded-proto'];
    }
    let endpoints = {
        restEndpoint:util.format('%s://%s', proto, req.headers.host)
    };
    let host_port = req.headers.host.split(':');
    if ('http' == proto)
    {
        endpoints.wsEndpoint = util.format('ws://%s:%d', host_port[0], config.listenWs.port);
    }
    else
    {
        // force ws instead of wss if ssl is enabled for http but disabled for ws (which would be an edge case)
        endpoints.wsEndpoint = util.format('wss://%s:%d', host_port[0], config.listenWs.port);
        if (config.listen.ssl && !config.listenWs.ssl)
        {
            endpoints.wsEndpoint = util.format('ws://%s:%d', host_port[0], config.listenWs.port);
        }
    }
    // check if we have externalEndpoints in config file
    if (undefined !== config.listen.externalEndpoint)
    {
        endpoints.restEndpoint = config.listen.externalEndpoint;
    }
    if (undefined !== config.listenWs.externalEndpoint)
    {
        endpoints.wsEndpoint = config.listenWs.externalEndpoint;
    }
    return endpoints;
}

}

module.exports = RequestHelper;
