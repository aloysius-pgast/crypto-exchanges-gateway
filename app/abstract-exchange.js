"use strict";
const logger = require('winston');

const precisionToStep = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001, 0.0000001, 0.00000001];
const stepToPrecision = {
    "0.00000001":8,
    "0.00000010":7,
    "0.00000100":6,
    "0.00001000":5,
    "0.00010000":4,
    "0.00100000":3,
    "0.01000000":2,
    "0.10000000":1,
    "1.00000000":0
}

class AbstractExchange
{

constructor(id, name)
{
    this._id = id;
    this._name = name;
    this._cachedPairs = {
        lastTimestamp:0,
        nextTimestamp:0,
        // cache result for 1H
        cachePeriod:3600,
        cache:{}
    };
    this._subscriptionManager = null;
}

_precisionToStep(value)
{
    let step = 0.00000001;
    if ('string' == typeof(value))
    {
        step = value.toFixed(8);
    }
    else
    {
        if (value >= 0 && value <= 8)
        {
            step = precisionToStep[value];
        }
        else
        {
            logger.warn(`Could not convert 'precision' to 'step' : value = '${value}'`)
            // default will be used
        }
    }
    return step;
}

_stepToPrecision(value)
{
    let precision = 8;
    if ('string' == typeof(value))
    {
        value = parseFloat(value).toFixed(8);
    }
    else
    {
        value = value.toFixed(8);
    }
    precision = stepToPrecision[value];
    if (undefined === precision)
    {
        logger.warn(`Could not convert 'step' to 'precision' : value = '${value}'`)
        // use default
        precision = 8;
    }
    return precision;
}

_getDefaultLimits()
{
    return {
        rate:{
           min:0.00000001,
           max:null,
           step:0.00000001,
           precision:8
        },
        quantity:{
            min:0.00000001,
            max:null,
            step:0.00000001,
            precision:8
        },
        price:{
            min:0,
            max:null
        }
    }
}

/**
 * Whether or not exchange is a dummy exchange (ie: paper exchange for test purpose, mostly for internal use)
 */
isDummy()
{
    return false;
}

getId()
{
    return this._id;
}

getName()
{
    return this._name;
}

_setSubscriptionManager(manager)
{
    this._subscriptionManager = manager;
}

getSubscriptionManager()
{
    return this._subscriptionManager;
}

}

module.exports = AbstractExchange;
