"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const Joi = require('../../custom-joi');
const JoiHelper = require('../../joi-helper');
const Errors = require('../../errors');
const serviceRegistry = require('../../service-registry');
const statistics = require('../../statistics');
const pjson = require('../../../package.json');

/**
 * Sends an http error to client
 *
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (res, err) => {
    return Errors.sendHttpError(res, err, 'server');
}

module.exports = function(app, bodyParsers, config) {

const startTime = parseInt(new Date().getTime() / 1000.0);

/**
 * Retrieve server uptime in seconds + version number
 */
app.get('/server/uptime', (req, res) => {
    let now = parseInt(new Date().getTime() / 1000.0);
    let uptime = now - startTime;
    return res.send({uptime:uptime,version:pjson.version});
});

/**
 * Format error list using an ugly html output
 */
const formatErrorList = (list) => {
    let content = '<div style="margin-left:10px;font-size:2.5vh;"><ul>';
    _.forEach(list, (err) => {
        let arr = err.type.split('.');
        let type = arr.shift();
        let index = 0;
        _.forEach(arr, (e) => {
            ++index;
            type += '.<br/>'
            let paddingSize = index * 4;
            type += '&nbsp;'.repeat(paddingSize);
            type += e;
        });
        content += `<br/><li><strong>${type}</strong> (<i>${err.httpCode}</i>) : ${err.description}</li>`;
    });
    content += '</ul></div>'
    return content;
}

/*
 * List possible errors
 */
(function(){
    const schema = Joi.object({
        format: Joi.string().valid(['json','html']).default('html')
    });

    /**
     * List possible errors
     * @param {string} format (json|html) (default = html)
     */
    app.get('/server/errors', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            return sendError(res, params.error);
        }
        let list = Errors.list();
        if ('json' == params.value.format)
        {
            return res.send(list);
        }
        try
        {
            let content = formatErrorList(list);
            return res.send(content);
        }
        catch (e)
        {
            return sendError(res, e);
        }
    });
})();

/**
 * Display log level
 */
app.get('/server/logLevel', (req, res) => {
    return res.send({value:config.logLevel});
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
            demo:entry.demo,
            cfg:entry.cfg
        }
    });
    return res.send(data);
});

/**
 * Return statistics
 */
app.get('/server/statistics', (req, res) => {
    res.send(statistics.getStatistics());
});

/*
 * Updates log level
 */
(function(){
    const schema = Joi.object({
        value: Joi.string().required().valid(['error','warn','info','verbose','debug'])
    });
    /**
     * Updates log level
     *
     * @param {string} value (error|warn|info|verbose|debug)
     */
    app.post('/server/logLevel', bodyParsers.urlEncoded, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            return sendError(res, params.error);
        }
        // update log level
        config.logLevel = params.value.value;
        logger.level = params.value.value;

        logger.info("Log level changed to '%s'", params.value.value);

        res.status(200).send({});
    });
})();

}
