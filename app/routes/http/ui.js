"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const express = require('express');

/**
 * UI routes
 */
module.exports = function(app, bodyParser, config) {

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
    let endpoint = util.format('%s://%s', proto, req.headers.host);
    res.send({
        apiEndpoint:endpoint
    });
});

app.use('/ui', express.static('ui/dist'));

// default route for ui
app.get("/ui/*", (req, res) => {
    res.status(404).end();
});

};
