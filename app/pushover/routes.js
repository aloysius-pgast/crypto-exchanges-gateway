"use strict";
const util = require('util');
const _ = require('lodash');
const requestHelper = require('../request-helper');
const serviceRegistry = require('../service-registry');

module.exports = function(app, bodyParser, config) {

if (!config.pushover.enabled)
{
    return;
}

// register service
serviceRegistry.registerService('pushover', 'Push Over', []);

const PushOverClass = require('./pushover');
const pushover = new PushOverClass(config);

/**
 * Sends a push notification
 *
 * @param {string} message message to send
 * @param {string} format text|html (optional, default = html)
 * @param {string} title message's title, otherwise app's name (defined in PushOver GUI) is used
 * @param {string} sound the name of one of the sounds supported by device clients to override the user's default sound choice (optional)
 * @param {string} device user's device name to send the message directly to that device, rather than all of the user's devices (optional, multiple devices may be separated by a comma)
 * @param {string} url a supplementary URL to show with your message (optional)
 * @param {string} urlTitle title for your supplementary URL, otherwise just the URL is shown (optional, will be ignored if 'url' is not set)
 * @param {integer} timestamp a Unix timestamp of your message's date and time to display to the user, rather than the time your message is received by our API (optional)
 * @param {string} priority (lowest|low|normal|high|emergency) (optional, default = normal)
 * @param {integer} opt.retry  keep notifying user every X seconds until acknowledged (optional, min = 30) (ignored if 'priority' != 'emergency')
 * @param {integer} opt.expire specifies how many seconds notification will continue to be retried for (every retry seconds). If the notification has not been acknowledged in expire seconds, it will be marked as expired and will stop being sent to the user (optional, max = 10800) (ignored if 'priority' != 'emergency')
 */
app.post('/pushover/notify', bodyParser, (req, res) => {
    let opt = {format:'html'};
    let value = requestHelper.getParam(req, 'message');
    if (undefined === value || '' === value)
    {
        res.status(400).send({origin:"gateway",error:"Missing or empty parameter 'message'"});
        return;
    }
    opt.message = value;
    value = requestHelper.getParam(req, 'format');
    if (undefined !== value && '' != value)
    {
        switch (value)
        {
            case 'html':
            case 'text':
                opt.format = value;
                break;
            default:
                res.status(400).send({origin:"gateway",error:util.format("Invalid value for parameter 'format' : value = '%s'", value)});
                return;
        }
    }
    // priority
    value = requestHelper.getParam(req, 'priority');
    if (undefined !== value && '' != value)
    {
        switch (value)
        {
            case 'lowest':
            case 'low':
            case 'normal':
            case 'high':
            case 'emergency':
                opt.priority = value;
                break;
            default:
                res.status(400).send({origin:"gateway",error:util.format("Invalid value for parameter 'priority' : value = '%s'", value)});
                return;
        }
        if ('emergency' == value)
        {
            value = requestHelper.getParam(req, 'retry');
            if (undefined !== value && '' != value)
            {
                let v = parseInt(value);
                if (isNaN(v) || v < 30)
                {
                    res.status(400).send({origin:"gateway",error:util.format("Parameter '%s' should be an integer > 30 : value = '%s'", value)});
                    return;
                }
                opt.retry = v;
            }
            value = requestHelper.getParam(req, 'expire');
            if (undefined !== value && '' != value)
            {
                let v = parseInt(value);
                if (isNaN(v) || v > 10800)
                {
                    res.status(400).send({origin:"gateway",error:util.format("Parameter '%s' should be an integer > 10800 : value = '%s'", value)});
                    return;
                }
                opt.expire = v;
            }
        }
    }
    // sound
    value = requestHelper.getParam(req, 'sound');
    if (undefined !== value && '' != value)
    {
        if (!pushover.isValidSoundName(value))
        {
            res.status(400).send({origin:"gateway",error:util.format("Invalid value for parameter 'sound' : value = '%s'", value)});
            return;
        }
        opt.sound = value;
    }
    // in keys
    let keys = ['timestamp'];
    _.forEach(keys, function(key){
        value = requestHelper.getParam(req, key);
        if (undefined !== value && '' != value)
        {
            let v = parseInt(value);
            if (isNaN(v) || v <= 0)
            {
                res.status(400).send({origin:"gateway",error:util.format("Parameter '%s' should be an integer > 0 : value = '%s'", value)});
                return;
            }
            opt[key] = v;
        }
    });
    // string keys
    keys = ['title', 'device', 'url'];
    _.forEach(keys, function(key){
        value = requestHelper.getParam(req, key);
        if (undefined !== value && '' != value)
        {
            opt[key] = value;
        }
    });
    // urlTitle
    if (undefined !== opt.url)
    {
        value = requestHelper.getParam(req, 'urlTitle');
        if (undefined !== value && '' != value)
        {
            opt.urlTitle = value;
        }
    }
    pushover.notify(opt)
        .then(function(data) {
            // always return an empty response
            res.send({});
        })
        .catch(function(err)
        {
            if (undefined !== err.origin)
            {
                res.status(503).send(err);
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.message});
            }
        });
});

/**
 * Return information regarding message limit and remaining messages
 */
app.get('/pushover/counter', (req, res) => {
    let data = pushover.getCounter();
    res.send(data);
});

};
