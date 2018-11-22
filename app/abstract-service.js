"use strict";
const _ = require('lodash');
const logger = require('winston');
const Bottleneck = require('bottleneck');
const Big = require('big.js');
const Errors = require('./errors');

/**
 * All methods prefixed with _ can be called by children classes
 * All methods prefixed with __ are reserved for internal use
 */
class AbstractService
{

/**
 * @param {string} id service unique identifier (ex: marketCap)
 * @param {string} name service name (ex: 'Market Cap')
 * @param {object} supportedFeatures dictionary of all supportedFeatures
 * @param {boolean} whether or not service is running in demo mode
 */
constructor(id, name, supportedFeatures, isDemo)
{
    this.__id = id;
    this.__name = name;
    this.__isDemo = isDemo;
    // all supported features
    this.__features = supportedFeatures;
}

/**
 * Whether or not exchange is running in demo mode
 *
 * @return {boolean} true if exchange is running in demo mode
 */
isDemo()
{
    return this.__isDemo;
}

/**
 * Whether or not an error is a network error
 *
 * @param {object} e error
 * @return {boolean}
 */
_isNetworkError(e)
{
    if (undefined !== e.code)
    {
        switch (e.code)
        {
            case 'ETIMEDOUT':
            case 'ESOCKETTIMEDOUT':
            case 'EHOSTUNREACH':
            case 'ENOTFOUND':
            case 'ECONNREFUSED':
                return true;
        }
        if (undefined !== e.syscall && 'connect' == e.syscall)
        {
            return true;
        }
    }
    // we have the raw request
    if (undefined !== e.statusCode && undefined !== e.statusMessage)
    {
        return true;
    }
    // certificate error
    if (undefined !== e.cert && undefined !== e.reason)
    {
        return true;
    }
    return false;
}

/**
 * Whether or not it's a timeout error
 *
 * @param {object} e error
 * @return {boolean}
 */
_isTimeoutError(e)
{
    return 'ETIMEDOUT' == e.code || 'ESOCKETTIMEDOUT' == e.code;
}

/**
 * Whether or not it's a ddos protection error
 *
 * @param {object} e error
 * @return {boolean}
 */
_isDDosProtectionError(e)
{
    // TODO
    return false;
}

_logError(e, method)
{
    Errors.logError(e, `service|${this.__id}|${method}`);
}

_logNetworkError(e, method)
{
    Errors.logNetworkError(e, `service|${this.__id}|${method}`);
}

_getRoundedFloat(value, precision, step)
{
    if (undefined === precision)
    {
        precision = 8;
    }
    let type = typeof value;
    let str;
    if ('string' == type)
    {
        str = parseFloat(value).toFixed(precision + 1);
    }
    else if ('number' == type)
    {
        str = value.toFixed(precision + 1);
    }
    // probably a big number
    else
    {
        str = value.toFixed(precision + 1);
    }
    if (precision > 0)
    {
        // remove last digit
        str = str.substring(0, str.length - 1);
    }
    else
    {
        // remove . + last digit
        str = str.substring(0, str.length - 2);
    }
    // ensure we're using correct step
    if (undefined !== step)
    {
        let floatValue = new Big(str);
        // ensure we have a multiple of step
        let mod = floatValue.mod(step);
        // not a multiple of step
        if (!mod.eq(0))
        {
            floatValue = floatValue.minus(mod);
        }
        str = floatValue.toFixed(precision);
    }
    return parseFloat(str);
}

/**
 * Returns a new rate limiter
 *
 * For a rate limit of 20/s, use count = 20 & delay = 1
 * For a rate limit of 1 request / 10s use count = 1 & delay = 10
 *
 * @param {integer} count maximum number of requests
 * @param {integer} delay delay in seconds to execute the requests (optional, default = 1)
 */
_getRateLimiter(count, delay)
{
    if (undefined === delay)
    {
        delay = 1;
    }
    // compute how long we should wait between 2 requests
    let opt = {
        minTime:parseInt((delay * 1000.0) / count),
        // the maximum number of simultaneous request can stay unlimited
        maxConcurrent:null
    }
    return new Bottleneck(opt);
}

/**
 * Returns exchange identifier (ex: binance1, bittrex)
 *
 * @return {string}
 */
getId()
{
    return this.__id;
}

/**
 * Returns supported features
 *
 * @return {object} dictionary of features
 */
getFeatures()
{
    return this.__features;
}

/**
 * Returns the name of the exchange (ex: Binance, Bittrex)
 *
 * @return {string}
 */
getName()
{
    return this.__name;
}

}

module.exports = AbstractService;
