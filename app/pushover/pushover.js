"use strict";
const _ = require('lodash');
const chump = require('chump');
const Errors = require('../errors');
const AbstractServiceClass = require('../abstract-service');

const util = require('util');
const logger = require('winston');

// list of possible priority values
const supportedPriorities = [
    'lowest', 'low',
    'normal',
    'high',
    'emergency'
]

const DEFAULT_PRIORITY = 'normal';

const serviceId = 'pushover';
const serviceName = 'Push Over';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
};

class PushOver extends AbstractServiceClass
{

constructor(config)
{
    super(serviceId, serviceName, supportedFeatures, false);
    this._user = config.pushover.user;
    this._client = new chump.Client(config.pushover.token);
}

isPrioritySupported(priority)
{
    return -1 !== supportedPriorities.indexOf(priority);
}

getSupportedPriorities()
{
    return supportedPriorities;
}

getDefaultPriority()
{
    return DEFAULT_PRIORITY;
}

isValidSoundName(name)
{
    try
    {
        chump.Sound.validateSoundName(name);
    }
    // invalid sound name will throw an exception
    catch (e)
    {
        return false;
    }
    return true;
}

/**
* Sends a push notification
*
* @param {string} opt.message message to send
* @param {string} opt.format message format html|text
* @param {string} opt.title notification title (optional)
* @param {string} opt.url a supplementary URL to show with your message (optional)
* @param {string} opt.urlTitle title for your supplementary URL, otherwise just the URL is shown (optional, will be ignored if 'url' is not set)
* @param {string} opt.sound sound which will be played upon receiving notification (optional)
* @param {string} opt.device used to send notification to a single device
* @param {string} opt.priority message priority (lowest, low, normal, high, emergency)
* @param {integer} opt.retry  keep notifying user every X seconds until acknowledged (optional, min = 30) (ignored if 'priority' != 'emergency')
* @param {integer} opt.expire specifies how many seconds notification will continue to be retried for (every retry seconds). If the notification has not been acknowledged in expire seconds, it will be marked as expired and will stop being sent to the user (optional, max = 10800) (ignored if 'priority' != 'emergency')
* @param {integer} opt.timestamp can be used to override message timestamp
* @return {Promise}
*/
async notify(opt)
{
    let self = this;
    let message;
    let params = {
        message:opt.message,
        enableHtml:'html' == opt.format
    };
    try
    {
        params.user = new chump.User(this._user, opt.device);
        if (undefined !== opt.title)
        {
            params.title = opt.title;
        }
        if (undefined !== opt.sound)
        {
            params.sound = new chump.Sound(opt.sound);
        }
        // priority
        if (undefined !== opt.priority)
        {
            let priorityParams = {};
            if ('emergency' == opt.priority)
            {
                if (undefined !== opt.retry)
                {
                    priorityParams.retry = opt.retry;
                }
                if (undefined !== opt.expire)
                {
                    priorityParams.expire = opt.expire;
                }
            }
            params.priority = new chump.Priority(opt.priority, priorityParams);
        }
        if (undefined !== opt.timestamp)
        {
            params.timestamp = opt.timestamp;
        }
        if (undefined !== opt.url)
        {
            params.url = opt.url;
            if (undefined !== opt.urlTitle)
            {
                params.urlTitle = opt.urlTitle;
            }
        }
        message = new chump.Message(params);
    }
    catch (e)
    {
        this._logError(e, 'notify');
        throw new Errors.GatewayError.InternalError();
    }
    let data;
    try
    {
        data = await this._client.sendMessage(message);
    }
    catch (e)
    {
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'notify');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ServiceError.NetworkError.RequestTimeout(this.getId(), e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ServiceError.NetworkError.DDosProtection(this.getId(), e);
            }
            throw new Errors.ServiceError.NetworkError.UnknownError(this.getId(), e);
        }
        if (undefined !== e.errors)
        {
            // might be an auth error
            if ('invalid' == e.user || 'invalid' == e.token)
            {
                throw new Errors.ServiceError.Forbidden.InvalidAuthentication(this.getId(), e.errors[0]);
            }
            throw new Errors.ServiceError.InvalidRequest.UnknownError(self.getId(), e.errors[0]);
        }
        throw new Errors.ServiceError.InvalidRequest.UnknownError(self.getId(), e);
    }
    return data;
}

/**
 * Return information regarding message limit and remaining messages

 * Result will be as below
 *
 * {
 *     "max":7500,
 *     "remaining"1260,
 *     "resetTimestamp":1504242000
 * }
 *
 * NB: if called before first message is sent, all values will be null
 *
 * @return {object}
}
 */
getCounter(opt)
{
    let result = {
        max:this._client.appLimit,
        remaining:this._client.appRemaining,
        resetTimestamp:this._client.appReset
    }
    if (null !== result.max)
    {
        result.max = parseInt(result.max);
    }
    if (null !== result.remaining)
    {
        result.remaining = parseInt(result.remaining);
    }
    if (null !== result.resetTimestamp)
    {
        result.resetTimestamp = parseInt(result.resetTimestamp);
    }
    return result;
}

}

module.exports = PushOver;
