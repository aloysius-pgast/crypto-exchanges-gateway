"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const requestHelper = require('../request-helper');

module.exports = function(app, bodyParser, config) {

const startTime = parseInt(new Date().getTime() / 1000.0);


/**
 * Retrieve server uptime in seconds
 */
app.get('/server/uptime', (req, res) => {
    let now = parseInt(new Date().getTime() / 1000.0);
    let uptime = now - startTime;
    res.send({uptime:uptime});
});

/**
 * Display log level
 */
app.get('/server/logLevel', (req, res) => {
    res.send({value:config.logLevel});
});

/**
 * Update logLevel
 */
app.post('/server/logLevel', bodyParser, (req, res) => {
    let value = requestHelper.getParam(req, 'value');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'value'"});
        return;
    }
    switch (value)
    {
        case 'error':
        case 'warn':
        case 'info':
        case 'verbose':
        case 'debug':
        case 'silly':
            break;
        default:
            res.status(400).send({origin:"gateway",error:util.format("Invalid value for query parameter 'value' : value = '%s'", value)});
            return;
    }
    // update log level
    config.logLevel = value;
    logger.level = value;

    logger.info("Log level changed to '%s'", value);

    res.status(200).send({});
});

};
