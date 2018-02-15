"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const requestHelper = require('../../request-helper');
const serviceRegistry = require('../../service-registry');
const statistics = require('../../statistics');

module.exports = function(app, bodyParsers, config) {

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
 * Return available services
 */
app.get('/server/services', (req, res) => {
    let data = {
        exchanges:{},
        others:{}
    };
    let services = serviceRegistry.getServices();
    _.forEach(services.exchanges, (entry, id) => {
        data.exchanges[id] = {
            id:entry.id,
            type:entry.type,
            name:entry.name,
            features:entry.features,
            demo:entry.demo,
            feesPercent:config.exchanges[id].feesPercent
        }
    });
    _.forEach(services.others, (entry, id) => {
        data.others[id] = {
            id:entry.id,
            name:entry.name,
            features:entry.features,
            demo:entry.demo
        }
    });
    res.send(data);
});

/**
 * Return statistics
 */
app.get('/server/statistics', (req, res) => {
    res.send(statistics.getStatistics());
});

/**
 * Update logLevel
 */
app.post('/server/logLevel', bodyParsers.urlEncoded, (req, res) => {
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
