"use strict";
const _ = require('lodash');
const PromiseHelper = require('./promise-helper');

class PairFinder
{

constructor()
{
    this._functions = {};
}

/**
 * Register the function which can be used to retrieve pairs
 *
 * @param {string} name exchange name
 * @param {function} f function which should be called to retrieve pairs (function should return a Promise)
 */
register(name, f){
    this._functions[name] = f;
}

/**
 * List exchanges which support a pair
 *
 * @param {string} opt.pair used to list only exchanges containing a given pair (optional)
 * @param {string} opt.currency : retrieve only pairs having a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if opt.pair is set)
 * @param {string} opt.baseCurrency : retrieve only pairs having a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if opt.pair or opt.currency are set)
 * @return Promise which will resolve to a list of exchanges names (ex: ["binance","bittrex"])
 */
find(opt)
{
    let self = this;
    let arr = [];
    _.forEach(self._functions, function (f, name) {
        let p = f(opt);
        arr.push({promise:p, context:{exchange:name,api:'pairs'}});
    });
    return new Promise((resolve, reject) => {
        let list = [];
        PromiseHelper.all(arr).then(function(data){
            _.forEach(data, function (entry) {
                // could not retrieve pair for this exchange
                if (!entry.success)
                {
                    return;
                }
                // check pair
                if (undefined !== opt.pair)
                {
                    if (undefined === entry.value[pair])
                    {
                        return;
                    }
                }
                // empty result ?
                else if (0 == Object.keys(entry.value).length)
                {
                    return;
                }
                list.push(entry.context.exchange);
            });
            resolve(list);
        });
    });
}

}

let finder = new PairFinder();

module.exports = finder;
