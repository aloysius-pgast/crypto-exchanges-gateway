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
 * @param {string} pair (X-Y)
 * @return Promise which will resolve to a list of exchanges names (ex: ["binance","bittrex"])
 */
find(pair)
{
    let self = this;
    let arr = [];
    _.forEach(self._functions, function (f, name) {
        let p = f();
        arr.push({promise:p, context:{exchange:name,api:'pairs'}});
    });
    return new Promise((resolve, reject) => {
        let list = [];
        PromiseHelper.all(arr).then(function(data){
            //console.error(data);
            _.forEach(data, function (entry) {
                // could not retrieve pair for this exchange
                if (!entry.success)
                {
                    return;
                }
                // pair does not exist
                if (undefined === entry.value[pair])
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
