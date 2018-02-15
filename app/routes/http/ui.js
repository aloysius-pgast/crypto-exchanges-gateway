"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const express = require('express');

/**
 * UI routes
 */
module.exports = function(app, bodyParsers, config) {

if (!config.ui.enabled)
{
    return;
}

app.get('/', (req, res) => {
    res.redirect('/ui');
});

/**
 * Retrieve server uptime in seconds
 */
app.get('/ui/config/config.json', (req, res) => {
    // use req.headers.host instead of req.hostname to ensure port number is preserved
    let proto = req.protocol;
    if (undefined !== req.headers['x-forwarded-proto'])
    {
        proto = req.headers['x-forwarded-proto'];
    }
    let cfg = {
        restEndpoint:util.format('%s://%s', proto, req.headers.host)
    };
    let host_port = req.headers.host.split(':');
    if ('http' == proto)
    {
        cfg.wsEndpoint = util.format('ws://%s:%d', host_port[0], config.listenWs.port);
    }
    else
    {
        // force ws instead of wss if ssl is enabled for http but disabled for ws (which would be an edge case)
        cfg.wsEndpoint = util.format('wss://%s:%d', host_port[0], config.listenWs.port);
        if (config.listen.ssl && !config.listenWs.ssl)
        {
            cfg.wsEndpoint = util.format('ws://%s:%d', host_port[0], config.listenWs.port);
        }
    }
    // check if we have externalEndpoints in config file
    if (undefined !== config.listen.externalEndpoint)
    {
        cfg.restEndpoint = config.listen.externalEndpoint;
    }
    if (undefined !== config.listenWs.externalEndpoint)
    {
        cfg.wsEndpoint = config.listenWs.externalEndpoint;
    }
    res.send(cfg);
});

app.use('/ui', express.static('ui/dist'));

// default route for ui
app.get("/ui/*", (req, res) => {
    res.status(404).end();
});

};
