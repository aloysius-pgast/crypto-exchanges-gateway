"use strict";
const _ = require('lodash');
const logger = require('winston');
const Joi = require('../custom-joi');
const JoiHelper = require('../joi-helper');
const Errors = require('../errors');
const RequestHelper = require('../request-helper');
const ConditionsParser = require('./conditions-parser');
const Entry = require('./entry');
const serviceRegistry = require('../service-registry');
const statistics = require('../statistics');
const monitor = require('./monitor');

/**
 * Sends an http error to client
 *
 * @param {string} serviceId exchange identifier
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 * @return {false}
 */
const sendError = (serviceId, res, err) => {
    return Errors.sendHttpError(res, err, serviceId);
}

module.exports = function(app, bodyParsers, config) {

if (!config.tickerMonitor.enabled)
{
    return;
}

// register service
const serviceId = 'tickerMonitor';
const cfg = {
    delay:config.tickerMonitor.delay,
    maxConditions:config.tickerMonitor.maxConditions,
    maxDuration:config.tickerMonitor.maxDuration
};
serviceRegistry.registerService(serviceId, 'Ticker Monitor', monitor, {}, false, cfg);

// update monitor instance
monitor.setDelay(cfg.delay);
monitor.setMaxDuration(cfg.maxDuration);

let pushover = serviceRegistry.getService('pushover');
if (null !== pushover)
{
    pushover = pushover.instance;
}

const checkMaxConditions = (alert, res) => {
    if (0 == config.tickerMonitor.maxConditions)
    {
        return true;
    }
    if (alert.conditions.length <= config.tickerMonitor.maxConditions)
    {
        return true;
    }
    let id = alert.id;
    if (undefined === id) {
        id = 0;
    }
    let err = new Errors.GatewayError.InvalidRequest.UnknownError(`Maximum number of conditions reached for alert '${alert.name}' (${id})`);
    return sendError(serviceId, res, err);
}

/*
List existing entries
*/
(function(){
    const schema = Joi.object({
        name: Joi.string().empty('').default('')
    });

    /**
     * List existing entries
     *
     * @param {string} name, used to filter by name
     */
    app.get('/tickerMonitor', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(serviceId, 'getEntries', false);
            return sendError(serviceId, res, params.error);
        }
        let opt = {};
        if ('' != params.value.name)
        {
            opt.name = params.value.name;
        }
        let list = monitor.toArray(opt);
        statistics.increaseStatistic(serviceId, 'getEntries', true);
        return res.send(list);
    });
})();

/*
Retrieves a single entry
*/
(function(){

    const schema = Joi.object({
        id: Joi.number().integer().positive()
    });

    /**
     * Retrieves a single entry
     *
     * @param {string} name, used to filter by name
     */
    app.get('/tickerMonitor/:id', (req, res) => {
        const params = JoiHelper.validate(schema, req, {params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(serviceId, 'getEntry', false);
            return sendError(serviceId, res, params.error);
        }
        let list = monitor.toArray({id:req.params.id});
        // not found
        if (0 == list.length)
        {
            statistics.increaseStatistic(serviceId, 'getEntry', false);
            let extErr = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`No entry with id '${req.params.id}'`);
            return sendError(serviceId, res, extErr);
        }
        statistics.increaseStatistic(serviceId, 'getEntry', true);
        return res.send(list[0]);
    });
})();

/**
 * Checks base properties (name, enabled, any, pushover)
 *
 * @param {object} req express request
 * @param {object} res express response
 * @param {boolean} isCreation whether or not we're checking for a POST (will be false if request was PATCH)
 *
 * @return {boolean} true on success, false otherwise
 */
const checkBaseProperties = (req, res, isCreation) => {
    if (isCreation)
    {
        if (undefined === req.body.name)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('name');
            return sendError(serviceId, res, extErr);
        }
    }
    if (undefined !== req.body.name)
    {
        req.body.name = req.body.name.trim();
        if ('' == req.body.name)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('name', req.body.name, "Parameter 'name' cannot not be empty");
            return sendError(serviceId, res, extErr);
        }
    }
    // enabled
    if (undefined !== req.body.enabled)
    {
        if (true !== req.body.enabled && false !== req.body.enabled)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('enabled', req.body.enabled, "Parameter 'enabled' should be a boolean");
            return sendError(serviceId, res, extErr);
        }
    }
    // any
    if (undefined !== req.body.any)
    {
        if (true !== req.body.any && false !== req.body.any)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('enabled', req.body.any, "Parameter 'any' should be a boolean");
            return sendError(serviceId, res, extErr);
        }
    }
    // pushover (if supported)
    if (null !== pushover && undefined !== req.body.pushover)
    {
        if (undefined === req.body.pushover.enabled)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('pushover[enabled]');
            return sendError(serviceId, res, extErr);
        }
        if (false !== req.body.pushover.enabled && true !== req.body.pushover.enabled)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('pushover[enabled]', req.body.pushover.enabled, "Parameter 'pushover[enabled]' should be a boolean");
            return sendError(serviceId, res, extErr);
        }
        if (req.body.pushover.enabled)
        {
            if (undefined !== req.body.pushover.priority)
            {
                if (!pushover.isPrioritySupported(req.body.pushover.priority))
                {
                    let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('pushover[priority]', req.body.pushover.priority);
                    return sendError(serviceId, res, extErr);
                }
            }
            if (undefined !== req.body.pushover.minDelay)
            {
                if (isNaN(req.body.pushover.minDelay) || req.body.pushover.minDelay < 0)
                {
                    let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('pushover[minDelay]', req.body.pushover.minDelay, "Parameter 'pushover[minDelay]' should be an integer >= 0");
                    return sendError(serviceId, res, extErr);
                }
            }
        }
    }
    return true;
}

/**
 * Checks conditions
 *
 * @param {object} req express request
 * @param {object} res express response
 * @param {boolean} isCreation whether or not we're checking for a POST (will be false if request was PATCH)
 * @return {Promise} will resolve to a list of conditon and reject to an error
 */
const checkConditions = (req, res, isCreation) => {
    return new Promise((resolve,reject) => {
        if (undefined === req.body.conditions)
        {
            if (isCreation)
            {
                let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('conditions');
                return reject(sendError(serviceId, res, extErr));
            }
            else
            {
                return resolve([]);
            }
        }
        if (!Array.isArray(req.body.conditions) || 0 == req.body.conditions.length)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('conditions', req.body.conditions, "Parameter 'conditions' should be a non-empty array");
            return reject(sendError(serviceId, res, extErr));
        }
        let parser = new ConditionsParser(req.body.conditions);
        parser.checkConditions().then(function(list){
            return resolve(list);
        }).catch (function(err){
            return reject(sendError(serviceId, res, err));
        });
    });
}

/**
 * Creates a new entry. A JSON body is expected
 *
 * @param {string} name to give a name to this alert
 * @param {boolean} enabled whether or not alert should be automatically enabled (optional, default = true)
 * @param {boolean} any, if true an alert will be triggered if any of the condition matches (optional, default = false)
 * @param {boolean} pushover.enabled whether or not pushover should be enabled (optional, default = false)
 * @param {string} pushover.priority (push over priority, default = normal)
 * @param {string} pushover.minDelay (minimum number of seconds between 2 notifications, to avoid spamming) (optional, default = 300, 5 min)
 * @param {object[]} conditions
 */
app.post(`/tickerMonitor/`, bodyParsers.json, (req, res) => {
    if (!req.is('json'))
    {
        statistics.increaseStatistic(serviceId, 'createEntry', false);
        let extErr = new Errors.GatewayError.InvalidRequest.UnknownError("Content-Type should be 'application/json'");
        return sendError(serviceId, res, extErr);
    }
    if (!checkBaseProperties(req, res, true))
    {
        statistics.increaseStatistic(serviceId, 'createEntry', false);
        return;
    }
    checkConditions(req, res, true).then(function(conditions){
        let opt = {
            name:req.body.name,
            enabled:true,
            any:false,
            pushover:{
                enabled:false
            },
            conditions:conditions
        };
        // enabled
        if (undefined !== req.body.enabled)
        {
            opt.enabled = req.body.enabled;
        }
        // any
        if (undefined !== req.body.any)
        {
            opt.any = req.body.any;
        }
        // pushover (if supported)
        if (null !== pushover && undefined !== req.body.pushover)
        {
            opt.pushover.enabled = req.body.pushover.enabled;
            if (opt.pushover.enabled)
            {
                opt.pushover.priority = Entry.DEFAULT_PUSH_OVER_PRIORITY;
                opt.pushover.minDelay = Entry.DEFAULT_PUSH_OVER_MIN_DELAY;
                if (undefined !== req.body.pushover.priority)
                {
                    opt.pushover.priority = req.body.pushover.priority;
                }
                if (undefined !== req.body.pushover.minDelay)
                {
                    opt.pushover.minDelay = parseInt(req.body.pushover.minDelay);
                }
            }
        }
        if (!checkMaxConditions(opt, res)) {
            return;
        }
        monitor.createEntry(opt).then(function(id){
            statistics.increaseStatistic(serviceId, 'createEntry', true);
            return res.send({id:id});
        }).catch (function(){
            // entry could not be saved
            statistics.increaseStatistic(serviceId, 'createEntry', false);
            let extErr = new Errors.GatewayError.InternalError();
            return sendError(serviceId, res, extErr);
        });
    }).catch(function(){
        // http error was already sent
        statistics.increaseStatistic(serviceId, 'createEntry', false);
        return;
    });
});

/**
 * Updates an existing entry. A JSON body is expected. All parameters are optional
 *
 * @param {string} id id of the entry to update
 * @param {string} name to give a name to this alert
 * @param {boolean} enabled whether or not alert should be enabled
 * @param {boolean} any, if true an alert will be triggered if any of the condition match
 * @param {boolean} pushover.enabled whether or not pushover should be enabled
 * @param {string} pushover.priority (push over priority, default = normal)
 * @param {string} pushover.minDelay (minimum number of seconds between 2 notifications, to avoid spamming) (optional, default = 0, no delay)
 * @param {object[]} conditions
 */
app.patch(`/tickerMonitor/:id`, bodyParsers.json, (req, res) => {
    if (!req.is('json'))
    {
        statistics.increaseStatistic(serviceId, 'updateEntry', false);
        let extErr = new Errors.GatewayError.InvalidRequest.UnknownError("Content-Type should be 'application/json'");
        return sendError(serviceId, res, extErr);
    }
    if (!monitor.hasEntry(req.params.id))
    {
        statistics.increaseStatistic(serviceId, 'updateEntry', false);
        let extErr = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`No entry with id '${req.params.id}'`);
        return sendError(serviceId, res, extErr);
    }
    if (!checkBaseProperties(req, res, false))
    {
        statistics.increaseStatistic(serviceId, 'updateEntry', false);
        return;
    }
    checkConditions(req, res).then(function(conditions){
        let opt = {};
        if (undefined !== req.body.name)
        {
            opt.name = req.body.name;
        }
        if (undefined !== req.body.enabled)
        {
            opt.enabled = req.body.enabled;
        }
        if (undefined !== req.body.any)
        {
            opt.any = req.body.any;
        }
        // pushover (if supported)
        if (null !== pushover && undefined !== req.body.pushover)
        {
            if (req.body.pushover.enabled)
            {
                opt.pushover = {enabled:req.body.pushover.enabled};
                opt.pushover.priority = Entry.DEFAULT_PUSH_OVER_PRIORITY;
                opt.pushover.minDelay = Entry.DEFAULT_PUSH_OVER_MIN_DELAY;
                if (undefined !== req.body.pushover.priority)
                {
                    opt.pushover.priority = req.body.pushover.priority;
                }
                if (undefined !== req.body.pushover.minDelay)
                {
                    opt.pushover.minDelay = parseInt(req.body.pushover.minDelay);
                }
            }
            else
            {
                opt.pushover = {enabled:false};
            }
        }
        // conditions
        if (0 != conditions.length)
        {
            opt.conditions = conditions;
        }
        if (!checkMaxConditions(opt, res)) {
            return;
        }
        monitor.updateEntry(req.params.id, opt).then(function(){
            statistics.increaseStatistic(serviceId, 'updateEntry', true);
            return res.send({});
        }).catch (function(err){
            // entry could not be saved
            statistics.increaseStatistic(serviceId, 'updateEntry', false);
            let extErr = new Errors.GatewayError.InternalError();
            return sendError(serviceId, res, extErr);
        });
    }).catch(function(){
        // http error was already sent
        statistics.increaseStatistic(serviceId, 'updateEntry', false);
        return;
    });
});

/**
 * Enable/disable a list of entries (we accept query parameters or json)  (always return {})
 *
 * @param {boolean} enabled true to enable, false to disable
 * @param {string} list list of id to enable/disable
 */
app.patch(`/tickerMonitor/`, bodyParsers.json, (req, res) => {
    let enabled = RequestHelper.getParam(req, 'enabled');
    if (undefined === enabled)
    {
        statistics.increaseStatistic(serviceId, 'enableEntries', false);
        let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('enabled');
        return sendError(serviceId, res, extErr);
    }
    if (true !== enabled && false !== enabled)
    {
        switch (enabled)
        {
            case 'true':
            case '1':
            case 1:
                enabled = true;
                break;
            case 'false':
            case '0':
            case 0:
                enabled = false;
                break;
            default:
                statistics.increaseStatistic(serviceId, 'enableEntries', false);
                let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter('enabled', enabled, `Parameter 'enabled' should be a boolean`);
                return sendError(serviceId, res, extErr);
        }
    }
    let list = RequestHelper.getParam(req, 'list');
    if (undefined === list)
    {
        statistics.increaseStatistic(serviceId, 'enableEntries', false);
        let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('list');
        return sendError(serviceId, res, extErr);
    }
    // support both array and comma-separated string
    if (!Array.isArray(list))
    {
        list = list.split(',');
    }
    let arr = [];
    _.forEach(list, (id) => {
        let entry = monitor.getEntry(id);
        if (null === entry)
        {
            return;
        }
        entry.enable(enabled);
        arr.push(entry.store());
    });
    // no entry to enable/disable
    if (0 == arr.length)
    {
        statistics.increaseStatistic(serviceId, 'enableEntries', true);
        return res.send({});
    }
    // process entries
    Promise.all(arr).then(function(){
        statistics.increaseStatistic(serviceId, 'enableEntries', true);
        return res.send({});
    }).catch (function(){
        // at least one entry could not be saved
        statistics.increaseStatistic(serviceId, 'enableEntries', false);
        let extErr = new Errors.GatewayError.InternalError();
        return sendError(serviceId, res, extErr);
    });
});

/**
 * Deletes a list of entries (we accept query parameters or json) (always return {})
 *
 * @param {string} list list of id to delete
 */
app.delete(`/tickerMonitor/`, bodyParsers.json, (req, res) => {
    let list = RequestHelper.getParam(req, 'list');
    if (undefined === list)
    {
        statistics.increaseStatistic(serviceId, 'deleteEntries', false);
        let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters('list');
        return sendError(serviceId, res, extErr);
    }
    // support both array and comma-separated string
    if (!Array.isArray(list))
    {
        list = list.split(',');
    }
    _.forEach(list, (id) => {
        if (!monitor.hasEntry(id))
        {
            return;
        }
        monitor.deleteEntry(id);
    });
    statistics.increaseStatistic(serviceId, 'deleteEntries', true);
    return res.send({});
});

};
