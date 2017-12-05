"use strict";

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
