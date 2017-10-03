"use strict";
const _ = require('lodash');

class Statistics
{

constructor()
{
    this._statistics = {
        exchanges:{},
        others:{}
    };
}

/**
 * Increment counter for a given exchange API
 *
 * @param {string} exchange exchange identifier
 * @param {string} api api
 * @param {boolean} success indicates whether or not we want to increase success statistic (optional, default = true)
 */
increaseExchangeStatistic(exchange, api, success)
{
    if (undefined === this._statistics.exchanges[exchange])
    {
        this._statistics.exchanges[exchange] = {};
    }
    if (undefined === this._statistics.exchanges[exchange][api])
    {
        this._statistics.exchanges[exchange][api] = {success:0, failure:0};
    }
    if (undefined === success || success)
    {
        ++this._statistics.exchanges[exchange][api].success;
    }
    else
    {
        ++this._statistics.exchanges[exchange][api].failure;
    }
}

getStatistics()
{
    return this._statistics;
}

}

let statistics = new Statistics();

module.exports = statistics;
