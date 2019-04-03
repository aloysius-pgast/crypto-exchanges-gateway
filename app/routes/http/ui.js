"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const express = require('express');
const RequestHelper = require('../../request-helper');
const path = require('path');

const CACHE_MAX_AGE = 3600 * 24 * 365;

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

app.use('/ui', express.static('ui/dist', {
    setHeaders: (res, _path) => {
        const arr = path.basename(_path).split('.');
        arr.shift();
        if (0 === arr.length)
        {
            return;
        }
        const file = arr.join('.');
        switch (file)
        {
            case 'index.bundle.js':
            case 'index.fonts.css':
            case 'index.styles.css':
            case 'logo.png':
            case 'fontawesome-webfont.woff2':
                res.setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`);
                return;
        }
    }
}));

// default route for ui
app.get("/ui/*", (req, res) => {
    res.status(404).end();
});

};
