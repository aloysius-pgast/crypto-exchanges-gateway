"use strict";
const chump = require('chump');
const util = require('util');
const logger = require('winston');
const _ = require('lodash');

// list of possible priority values
const supportedPriorities = [
    'lowest', 'low',
    'normal',
    'high',
    'emergency'
]

class PushOver
{

constructor(config)
{
    this._user = config.pushover.user;
    this._client = new chump.Client(config.pushover.token);
}

isPrioritySupported(priority)
{
    return -1 !== supportedPriorities.indexOf(priority);
}

/**
* Sends a push notification
*
* @param {string} opt.message message to send
* @param {string} opt.format message format html|text
* @param {string} opt.title notification title (optional)
* @param {string} opt.sound sound which will be played upon receiving notification (optional)
* @param {string} opt.device used to send notification to a single device
* @param {string} opt.priority message priority (lowest, low, normal, high, emergency)
* @param {integer} opt.retry  keep notifying user every X seconds until acknowledged (optional, min = 30) (ignored if 'priority' != 'emergency')
* @param {integer} opt.expire specifies how many seconds notification will continue to be retried for (every retry seconds). If the notification has not been acknowledged in expire seconds, it will be marked as expired and will stop being sent to the user (optional, max = 10800) (ignored if 'priority' != 'emergency')
* @param {integer} opt.timestamp can be used to override message timestamp
* @return {Promise}
*/
notify(opt)
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
    catch (ex)
    {
        if (undefined !== ex.stack)
        {
            logger.error(ex.stack);
        }
        else
        {
            logger.error(ex);
        }
        return new Promise((resolve, reject) => {
            reject({origin:'gateway', error:'An error occurred'});
        });
    }
    return this._client.sendMessage(message);
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

}

module.exports = PushOver;
