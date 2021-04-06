"use strict";

/*
    Implemented using https://api.ratesapi.io
 */

const _ = require('lodash');
const request = require('request');
const debug = require('debug')('CEG:FxConverter');
const Big = require('big.js');
const Errors = require('../errors');
const AbstractServiceClass = require('../abstract-service');
const PromiseHelper = require('../promise-helper');

const DEFAULT_SOCKETTIMEOUT = 60 * 1000;

// how often in seconds cached data should be refreshed (12 hours)
const REFRESH_PERIOD = 3600 * 12;

// default base currency
const DEFAULT_BASE_CURRENCY = 'USD';

// this single url provides everything we need to do conversion between currencies
const DATA_URL = `https://api.ratesapi.io/api/latest?base=${DEFAULT_BASE_CURRENCY}`;

const serviceId = 'fxConverter';
const serviceName = 'Fx Converter';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {};

class FxConverter extends AbstractServiceClass
{

constructor(config)
{
    super(serviceId, serviceName, supportedFeatures, false);

    this.__cache = {
        lastTimestamp:0,
        nextTimestamp:0,
        cachePeriod:REFRESH_PERIOD * 1000,
        data:{
            // usd rates for each currency
            bySymbol:{}
        },
        promise:null
    };
}

/**
 * Internal function used to update cache
 *
 * @param {boolean} forceRefresh if true cache will be refreshed even if it's not expired
 * @return {Promise} which resolves to true on success, false otherwise
 */
async _refreshCache(forceRefresh)
{
    let timestamp = Date.now();
    if (!forceRefresh && timestamp < this.__cache.nextTimestamp)
    {
        return true;
    }
    if (null === this.__cache.promise)
    {
        this.__cache.promise = new Promise((resolve, reject) => {
            this._getRawData().then((rawData) => {
                // only update cache if list is not empty
                if (!_.isEmpty(rawData.rates))
                {
                    timestamp = Date.now();
                    this._updateCache(rawData);
                    this.__cache.lastTimestamp = timestamp;
                    this.__cache.nextTimestamp = timestamp + this.__cache.cachePeriod;
                }
                this.__cache.promise = null;
                return resolve(true);
            }).catch ((e) => {
                this.__cache.promise = null;
                this._logError(e, '_refreshCache');
                return resolve(false);
            });
        });
    }
    return this.__cache.promise;
}

/**
 * Update cache
 *
 * @param {object} rawData data returned by remote service
 */
_updateCache(rawData)
{
    const rates = {};
    _.forEach(rawData.rates, (rate, symbol) => {
        // we need to reverse the rate
        rates[symbol] = parseFloat(new Big(1.0).div(rate).toFixed(10));
    });
    this.__cache.data.bySymbol = rates;
}

/**
 * Retrieve data
 */
/*
Example output

{
    "date":"2018-11-08",
    "rates":{
        "BGN":1.7120098039,
        "CAD":1.3105742297,
        "BRL":3.7309173669,
        "HUF":281.3725490196,
        "DKK":6.5298494398,
        "JPY":113.7079831933,
        "ILS":3.6720938375,
        "TRY":5.4206932773,
        "RON":4.0793067227,
        "GBP":0.7629814426,
        "PHP":52.7906162465,
        "HRK":6.5051645658,
        "NOK":8.3226540616,
        "ZAR":13.9697128852,
        "MXN":19.8581932773,
        "AUD":1.3714985994,
        "USD":1.0,
        "KRW":1116.8417366947,
        "HKD":7.8268557423,
        "EUR":0.8753501401,
        "ISK":121.0609243697,
        "CZK":22.6601890756,
        "THB":32.9096638655,
        "MYR":4.1634278711,
        "NZD":1.4739145658,
        "PLN":3.7565651261,
        "CHF":1.0028011204,
        "SEK":8.974789916,
        "CNY":6.9320728291,
        "SGD":1.3710609244,
        "INR":72.4085259104,
        "IDR":14540.0035014006,
        "RUB":66.3789390756
    },
    "base":"USD"
}
*/
_getRawData()
{
    return new Promise((resolve, reject) => {
        let options = {};
        options.json = true;
        options.timeout = DEFAULT_SOCKETTIMEOUT;
        options.method = 'GET';
        options.url = DATA_URL;
        if (debug.enabled)
        {
            debug('Retrieving data');
        }
        request(options, (error, response, body) => {
            if (null !== error)
            {
                this._logNetworkError(error, '_getData');
                if (this._isTimeoutError(error))
                {
                    return reject(new Errors.ServiceError.NetworkError.RequestTimeout(this.getId(), error));
                }
                if (this._isDDosProtectionError(error))
                {
                    return reject(new Errors.ServiceError.NetworkError.DDosProtection(this.getId(), error));
                }
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), error));
            }
            if (200 != response.statusCode)
            {
                // maybe a wrong url ?
                this._logNetworkError(response, '_getData');
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), response));
            }
            if (undefined === body.rates)
            {
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), "Missing 'rates' in response"));
            }
            return resolve(body);
        });
    });
}

/**
 * List existing currencies
 *
 * @param {boolean} opt.useCache (optional, default = true)
 * @return {string[]} ['USD', 'EUR',...]
 */
/*
Example output

[
    "BGN",
    "CAD",
    "BRL",
    "HUF",
    "DKK",
    "JPY",
    "ILS",
    "TRY",
    "RON",
    "GBP",
    "PHP",
    "HRK",
    "NOK",
    "ZAR",
    "MXN",
    "AUD",
    "USD",
    "KRW",
    "HKD",
    "EUR",
    "ISK",
    "CZK",
    "THB",
    "MYR",
    "NZD",
    "PLN",
    "CHF",
    "SEK",
    "CNY",
    "SGD",
    "INR",
    "IDR",
    "RUB"
]

*/
async listCurrencies(opt)
{
    let useCache = true;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
    }
    await this._refreshCache(!useCache);
    const list = Object.keys(this.__cache.data.bySymbol);
    return list;
}

/**
 * Indicates whether or not a symbol exists.
 *
 * @param {string} symbol symbol to check (ex: USD)
 * @return {boolean} true if symbol exists, false otherwise
 */
async isValidCurrency(symbol)
{
    await this._refreshCache(false);
    return undefined !== this.__cache.data.bySymbol[symbol];
}

/**
* Returns rates
*
* @param {boolean} opt.useCache (optional, default = true)
* @param {string[]} opt.pairs used to retrieve specific rates (optional, by default will return all rate using USD as base currency)
* @return {object}
*/
/*
Example output

NB : pair USD-EUR means that the rate will be the price of 1 EUR in USD

{
    "USD-EUR": {
        "baseCurrency": "USD",
        "currency": "EUR",
        "rate": 1.1423999999
    },
    "EUR-USD": {
        "baseCurrency": "EUR",
        "currency": "USD",
        "rate": 0.8753501401
    },
    "EUR-GBP": {
        "baseCurrency": "EUR",
        "currency": "GBP",
        "rate": 1.1472757937
    }
}

*/
async getRates(opt)
{
    let useCache = true;
    let pairs;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
        if (undefined !== opt.pairs)
        {
            if (0 != opt.pairs.length)
            {
                pairs = opt.pairs;
            }
        }
    }
    await this._refreshCache(!useCache);
    const list = {};
    // if we don't have any pairs, return rates directly
    if (undefined === pairs)
    {
        _.forEach(this.__cache.data.bySymbol, (rate, symbol) => {
            let pair = `${DEFAULT_BASE_CURRENCY}-${symbol}`;
            list[pair] = {pair:pair, baseCurrency:DEFAULT_BASE_CURRENCY, currency:symbol, rate:rate};
        });
    }
    else
    {
        pairs.forEach((p) => {
            let splittedPair = p.split('-');
            // base currency or currency is not supported
            if (undefined === this.__cache.data.bySymbol[splittedPair[0]] || undefined === this.__cache.data.bySymbol[splittedPair[1]])
            {
                return;
            }
            let rate;
            if (DEFAULT_BASE_CURRENCY == splittedPair[0])
            {
                rate = this.__cache.data.bySymbol[splittedPair[1]];
            }
            else if (splittedPair[0] == splittedPair[1])
            {
                rate = 1;
            }
            // do conversion
            else
            {
                rate = new Big(this.__cache.data.bySymbol[splittedPair[1]]).div(this.__cache.data.bySymbol[splittedPair[0]]);
                rate = parseFloat(rate.toFixed(10));
            }
            list[p] = {pair:p, baseCurrency:splittedPair[0], currency:splittedPair[1], rate:rate};
        });
    }
    return list;
}

}

module.exports = FxConverter;
