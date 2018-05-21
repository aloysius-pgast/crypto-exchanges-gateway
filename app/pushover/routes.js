"use strict";
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const Joi = require('../custom-joi');
const JoiHelper = require('../joi-helper');
const Errors = require('../errors');
const RequestHelper = require('../request-helper');
const serviceRegistry = require('../service-registry');
const statistics = require('../statistics');

/**
 * Sends an http error to client
 *
 * @param {string} serviceId exchange identifier
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (serviceId, res, err) => {
    return Errors.sendHttpError(res, err, serviceId);
}

module.exports = function(app, bodyParsers, config) {

if (!config.pushover.enabled)
{
    return;
}

const PushOverClass = require('./pushover');
let pushover;
try
{
    pushover = new PushOverClass(config);
}
catch (e)
{
    // might be because username / token does not match format
    logger.error("An exception occurred when trying to instantiate PushOver client (service will be disabled)");
    Errors.logError(e)
    config.pushover.enabled = false;
    return;
}

// we need to clone the features since we're gonna make some changes
let features = _.cloneDeep(pushover.getFeatures());

// register service
serviceRegistry.registerService(pushover.getId(), pushover.getName(), pushover, features, pushover.isDemo());

/*
 * Sends push notification
 */
(function(){
    const schema = Joi.object({
        message: Joi.string().required(),
        format: Joi.string().valid(['text','html']).default('html'),
        title: Joi.string().empty('').default(''),
        sound: Joi.string().empty('').default(''),
        device: Joi.string().empty('').default(''),
        url: Joi.string().empty('').default('').uri({scheme:['http','https']}),
        urlTitle: Joi.string().empty('').default(''),
        timestamp: Joi.date().timestamp('unix'),
        priority: Joi.string().valid(pushover.getSupportedPriorities()).default(pushover.getDefaultPriority()),
        retry: Joi.number().integer().min(30),
        expire: Joi.number().integer().max(10800)
    });

    /**
     * Sends a push notification
     *
     * @param {string} message message to send
     * @param {string} format text|html (optional, default = html)
     * @param {string} title message's title, otherwise app's name (defined in PushOver GUI) is used
     * @param {string} sound the name of one of the sounds supported by device clients to override the user's default sound choice (optional)
     * @param {string} device user's device name to send the message directly to that device, rather than all of the user's devices (optional)
     * @param {string} url a supplementary URL to show with your message (optional)
     * @param {string} urlTitle title for your supplementary URL, otherwise just the URL is shown (optional, will be ignored if 'url' is not set)
     * @param {integer} timestamp a Unix timestamp of your message's date and time to display to the user, rather than the time your message is received by our API (optional)
     * @param {string} priority (lowest|low|normal|high|emergency) (optional, default = normal)
     * @param {integer} retry  keep notifying user every X seconds until acknowledged (optional, min = 30) (ignored if 'priority' != 'emergency')
     * @param {integer} expire specifies how many seconds notification will continue to be retried for (every 'retry' seconds). If the notification has not been acknowledged in expire seconds, it will be marked as expired and will stop being sent to the user (optional, max = 10800) (ignored if 'priority' != 'emergency')
     */
    app.post('/pushover/notify', bodyParsers.urlEncoded, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(pushover.getId(), 'notify', false);
            return sendError(pushover.getId(), res, params.error);
        }
        let opt = {message:params.value.message,format:params.value.format,priority:params.value.priority};
        // emergency requires expire & retry
        if ('emergency' == opt.priority)
        {
            if (undefined === params.value.retry || undefined === params.value.expire)
            {
                statistics.increaseStatistic(pushover.getId(), 'notify', false);
                let e = new Errors.GatewayError.InvalidRequest.UnknownError("Parameters (retry,expire) must be supplied when 'priority' is 'emergency'");
                return sendError(pushover.getId(), res, e);
            }
            opt.retry = params.value.retry;
            opt.expire = params.value.expire;
        }
        // sound
        if ('' != params.value.sound)
        {
            if (!pushover.isValidSoundName(params.value.sound))
            {
                statistics.increaseStatistic(pushover.getId(), 'notify', false);
                let e = new Errors.GatewayError.InvalidRequest.InvalidParameter('sound', params.value.sound);
                return sendError(pushover.getId(), res, e);
            }
            opt.sound = params.value.sound;
        }
        // timestamp
        if (undefined !== params.value.timestamp)
        {
            opt.timestamp = params.value.timestamp;
        }
        // string keys
        let keys = ['title', 'device', 'url'];
        _.forEach(keys, function(key){
            if ('' != params.value[key])
            {
                opt[key] = params.value[key];
            }
        });
        // urlTitle
        if (undefined !== opt.url)
        {
            if ('' != params.value.urlTitle)
            {
                opt.urlTitle = params.value.urlTitle;
            }
        }
        pushover.notify(opt).then(function(data) {
            statistics.increaseStatistic(pushover.getId(), 'notify', true);
            // always return an empty response
            return res.send({});
        }).catch(function(err){
            statistics.increaseStatistic(pushover.getId(), 'notify', false);
            return sendError(pushover.getId(), res, err);
        });
    });
})();

/**
 * Return information regarding message limit and remaining messages
 */
app.get('/pushover/counter', (req, res) => {
    let data = pushover.getCounter();
    res.send(data);
});

};
