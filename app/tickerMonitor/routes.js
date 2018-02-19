"use strict";
const _ = require('lodash');
const logger = require('winston');
const RequestHelper = require('../request-helper');
const ConditionsParser = require('./conditions-parser');
const Entry = require('./entry');
const serviceRegistry = require('../service-registry');
const monitor = require('./monitor');

module.exports = function(app, bodyParsers, config) {

if (!config.tickerMonitor.enabled)
{
    return;
}

// register service
serviceRegistry.registerService('tickerMonitor', 'Ticker Monitor', monitor, {});

let pushover = serviceRegistry.getService('pushover');
if (null !== pushover)
{
    pushover = pushover.instance;
}

/**
 * List existing entries
 *
 * @param {string} name, used to filter by name
 */
app.get('/tickerMonitor', (req, res) => {
    let opt = {};
    let value;
    value = RequestHelper.getParam(req, 'name');
    if (undefined !== value && '' != value)
    {
        opt.name = value;
    }
    let list = monitor.toArray(opt);
    res.send(list);
});

/**
 * Retrieves a single entry
 *
 * @param {string} name, used to filter by name
 */
app.get('/tickerMonitor/:id', (req, res) => {
    let list = monitor.toArray({id:req.params.id});
    // not found
    if (0 == list.length)
    {
        res.status(404).send({origin:"gateway",error:`No entry with id '${req.params.id}'`});
        return;
    }
    res.send(list[0]);
});

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
            res.status(400).send({origin:"gateway",error:"Missing parameter 'name'"});
            return false;
        }
    }
    if (undefined !== req.body.name)
    {
        req.body.name = req.body.name.trim();
        if ('' == req.body.name)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'name' cannot not be empty"});
            return false;
        }
    }
    // enabled
    if (undefined !== req.body.enabled)
    {
        if (true !== req.body.enabled && false !== req.body.enabled)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'enabled' should be a boolean"});
            return;
        }
    }
    // any
    if (undefined !== req.body.any)
    {
        if (true !== req.body.any && false !== req.body.any)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'any' should be a boolean"});
            return;
        }
    }
    // pushover (if supported)
    if (null !== pushover && undefined !== req.body.pushover)
    {
        if (undefined === req.body.pushover.enabled)
        {
            res.status(400).send({origin:"gateway",error:"Missing parameter 'pushover[enabled]'"});
            return;
        }
        if (false !== req.body.pushover.enabled && true !== req.body.pushover.enabled)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'pushover.enabled' should be a boolean"});
            return;
        }
        if (req.body.pushover.enabled)
        {
            if (undefined !== req.body.pushover.priority)
            {
                if (!pushover.isPrioritySupported(req.body.pushover.priority))
                {
                    res.status(400).send({origin:"gateway",error:`Invalid value for parameter 'pushover[priority]' : value = '${req.body.pushover.priority}'`});
                    return;
                }
            }
            if (undefined !== req.body.pushover.minDelay)
            {
                if (isNaN(req.body.pushover.minDelay) || req.body.pushover.minDelay < 0)
                {
                    res.status(400).send({origin:"gateway",error:`Parameter 'pushover[minDelay]' should be an integer >= 0 : value = '${req.body.pushover.minDelay}'`});
                    return;
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
                res.status(400).send({origin:"gateway",error:"Missing parameter 'conditions'"});
                return reject(false);
            }
            else
            {
                return resolve([]);
            }
        }
        if (!Array.isArray(req.body.conditions) || 0 == req.body.conditions.length)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'conditions' should be a non-empty array"});
            return reject(false);
        }
        let parser = new ConditionsParser(req.body.conditions);
        parser.checkConditions().then(function(list){
            resolve(list);
        }).catch (function(err){
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
                res.status(503).send({origin:"gateway",error:'An error occurred'});
                return reject(false);
            }
            if (undefined !== err.origin && 'remote' == err.origin)
            {
                res.status(503).send(err);
                return reject(false);
                return;
            }
            res.status(404).send({origin:"gateway",error:err});
            return reject(false);
        });
    });
}

/**
 * Creates a new entry. A JSON body is expected
 *
 * @param {string} name to give a name to this alert
 * @param {boolean} enabled whether or not alert should be automatically enabled (optional, default = true)
 * @param {boolean} any, if true an alert will be triggered if any of the condition match (optional, default = false)
 * @param {boolean} pushover.enabled whether or not pushover should be enabled (optional, default = false)
 * @param {string} pushover.priority (push over priority, default = normal)
 * @param {string} pushover.minDelay (minimum number of seconds between 2 notifications, to avoid spamming) (optional, default = 300, 5 min)
 * @param {object[]} conditions
 */
app.post(`/tickerMonitor/`, bodyParsers.json, (req, res) => {
    if (!req.is('json'))
    {
        res.status(400).send({origin:"gateway",error:"Content-Type should be 'application/json'"});
        return;
    }
    if (!checkBaseProperties(req, res, true))
    {
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
                opt.pushover.priority = Entry.DEFAULT_PUSH_PRIORITY;
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
        monitor.createEntry(opt).then(function(id){
            res.send({id:id});
        }).catch (function(){
            res.status(503).send({origin:"gateway",error:'An error occurred'});
        });
    }).catch(function(){
        // already handled
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
        res.status(400).send({origin:"gateway",error:"Content-Type should be 'application/json'"});
        return;
    }
    if (!monitor.hasEntry(req.params.id))
    {
        res.status(404).send({origin:"gateway",error:`No entry with id '${req.params.id}'`});
        return;
    }
    if (!checkBaseProperties(req, res, false))
    {
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
        monitor.updateEntry(req.params.id, opt).then(function(){
            res.send({});
        }).catch (function(err){
            res.status(503).send({origin:"gateway",error:'An error occurred'});
        });
    }).catch(function(){
        // already handled
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
        res.status(400).send({origin:"gateway",error:"Missing parameter 'enabled'"});
        return;
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
                res.status(400).send({origin:"gateway",error:"Parameter 'enabled' should be a boolean"});
                return;
        }
    }
    let list = RequestHelper.getParam(req, 'list');
    if (undefined === list)
    {
        res.status(400).send({origin:"gateway",error:"Missing parameter 'list'"});
        return;
    }
    // support both array and comma-separated string
    if (!Array.isArray(list))
    {
        list = list.split(',');
    }
    _.forEach(list, (id) => {
        let entry = monitor.getEntry(id);
        if (null === entry)
        {
            return;
        }
        entry.enable(enabled);
        entry.store();
    });
    res.send({});
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
        res.status(400).send({origin:"gateway",error:"Missing parameter 'list'"});
        return;
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
    res.send({});
});

};
