"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const express = require('express');
const RequestHelper = require('../../request-helper');

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
 * Retrieve ui config
 */
app.get('/ui/config/config.json', (req, res) => {
    let endpoints = RequestHelper.getEndpoints(req, config);
    let cfg = {
        restEndpoint:endpoints.restEndpoint,
        wsEndpoint:endpoints.wsEndpoint
    };
    res.send(cfg);
});

app.use('/ui', express.static('ui/dist'));

// default route for ui
app.get("/ui/*", (req, res) => {
    res.status(404).end();
});

};
