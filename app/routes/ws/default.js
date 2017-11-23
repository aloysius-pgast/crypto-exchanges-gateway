"use strict";
const util = require('util');
const _ = require('lodash');
const url = require('url');
const logger = require('winston');

/**
 * Default route
 */

module.exports = function(app, config) {

app.use(function (req, res) {
    let u = url.parse(req.url);
    // remove .websocket
    let pathname = u.pathname.replace('.websocket', '');
    logger.warn("Unknown WS route %s", pathname)
    res.status(404).end();
});

};
