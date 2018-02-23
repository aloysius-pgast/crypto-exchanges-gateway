"use strict";
const logger = require('winston');

const precisionToStep = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001, 0.0000001, 0.00000001];

class AbstractExchange
{

constructor(id, type, name, feesPercent)
{
    this._id = id;
    this._type = type,
    this._name = name;
    this._feesPercent = feesPercent;
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

// borrowed from ccxt
_stepToPrecision(value)
{
    let split;
    if ('string' == typeof(value))
    {
        split = value.replace(/0+$/g, '').split('.');
    }
    else
    {
        split = value.toFixed(8).replace(/0+$/g, '').split('.');
    }
    return (split.length > 1) ? (split[1].length) : 0;
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
            min:0.00000001,
            max:null
        }
    }
}

/**
 * Whether or not exchange is a dummy exchange (ie: paper exchange for test purpose, mostly for internal use)
 */
isDummy()
{
    return 'dummy' == this._type;
}

getId()
{
    return this._id;
}

getFeesPercent()
{
    return this._feesPercent;
}

getType()
{
    return this._type;
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
