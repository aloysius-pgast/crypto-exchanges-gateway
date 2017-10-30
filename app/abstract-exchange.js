"use strict";

class AbstractExchange
{

constructor()
{
    this._cachedPairs = {
        lastTimestamp:0,
        nextTimestamp:0,
        // cache result for 1H
        cachePeriod:3600,
        cache:{}
    };
}

}

module.exports = AbstractExchange;
