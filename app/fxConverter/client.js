"use strict";

/*
    Implemented using api.exchangerate.host
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
const DATA_URL = `https://api.exchangerate.host/latest?base=${DEFAULT_BASE_CURRENCY}`;

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
    "motd":{
        "msg":"If you or your company use this project or like what we doing, please consider backing us so we can continue maintaining and evolving this project.",
        "url":"https://exchangerate.host/#/donate"
    },
    "success":true,
    "base":"USD",
    "date":"2021-05-31",
    "rates":{
        "AED":3.672963,
        "AFN":78.41335,
        "ALL":100.986314,
        "AMD":520.21148,
        "ANG":1.792941,
        "AOA":642.220921,
        "ARS":94.293188,
        "AUD":1.293997,
        "AWG":1.8,
        "AZN":1.700805,
        "BAM":1.604217,
        "BBD":2,
        "BDT":84.647335,
        "BGN":1.6042,
        "BHD":0.376565,
        "BIF":1974.638924,
        "BMD":1,
        "BND":1.321872,
        "BOB":6.89715,
        "BRL":5.238999,
        "BSD":1,
        "BTC":0.00003,
        "BTN":72.399588,
        "BWP":10.637602,
        "BYN":2.529087,
        "BZD":2.013418,
        "CAD":1.207845,
        "CDF":1986.48611,
        "CHF":0.899099,
        "CLF":0.026256,
        "CLP":724.500699,
        "CNH":6.357349,
        "CNY":6.361399,
        "COP":3715.714254,
        "CRC":617.352263,
        "CUC":1,
        "CUP":25.749997,
        "CVE":91.069989,
        "CZK":20.883747,
        "DJF":177.825144,
        "DKK":6.096499,
        "DOP":56.844985,
        "DZD":133.343798,
        "EGP":15.650796,
        "ERN":15.001995,
        "ETB":43.475461,
        "EUR":0.81979,
        "FJD":2.0264,
        "FKP":0.70455,
        "GBP":0.70455,
        "GEL":3.26,
        "GGP":0.70455,
        "GHS":5.773624,
        "GIP":0.70455,
        "GMD":51.179994,
        "GNF":9798.776347,
        "GTQ":7.717533,
        "GYD":208.798633,
        "HKD":7.760939,
        "HNL":23.999012,
        "HRK":6.166875,
        "HTG":90.347165,
        "HUF":285.339965,
        "IDR":14280.35532,
        "ILS":3.25044,
        "IMP":0.70455,
        "INR":72.359486,
        "IQD":1457.336038,
        "IRR":42139.994685,
        "ISK":120.999985,
        "JEP":0.70455,
        "JMD":148.689872,
        "JOD":0.709,
        "JPY":109.666987,
        "KES":107.479987,
        "KGS":84.181792,
        "KHR":4065.331253,
        "KMF":404.374887,
        "KPW":899.99989,
        "KRW":1111.104833,
        "KWD":0.301039,
        "KYD":0.832366,
        "KZT":428.068454,
        "LAK":9422.369367,
        "LBP":1506.272,
        "LKR":198.274477,
        "LRD":171.649957,
        "LSL":13.799304,
        "LYD":4.449976,
        "MAD":8.845115,
        "MDL":17.574987,
        "MGA":3749.058041,
        "MKD":50.451934,
        "MMK":1644.123505,
        "MNT":2850.956199,
        "MOP":7.985481,
        "MRO":356.999784,
        "MRU":36.458256,
        "MUR":40.429994,
        "MVR":15.449998,
        "MWK":796.594411,
        "MXN":19.922323,
        "MYR":4.136499,
        "MZN":60.833992,
        "NAD":13.774998,
        "NGN":410.031422,
        "NIO":34.884916,
        "NOK":8.356339,
        "NPR":115.833581,
        "NZD":1.37779,
        "OMR":0.384982,
        "PAB":1,
        "PEN":3.843601,
        "PGK":3.507864,
        "PHP":47.725538,
        "PKR":155.023073,
        "PLN":3.676049,
        "PYG":6777.71962,
        "QAR":3.691449,
        "RON":4.0323,
        "RSD":96.442268,
        "RUB":73.265191,
        "RWF":1000.755475,
        "SAR":3.750299,
        "SBD":7.968253,
        "SCR":16.49924,
        "SDG":419.499949,
        "SEK":8.309257,
        "SGD":1.3228,
        "SHP":0.70455,
        "SLL":10242.498849,
        "SOS":577.848692,
        "SRD":14.153998,
        "SSP":130.259984,
        "STD":20736.889714,
        "STN":20.449997,
        "SVC":8.740336,
        "SYP":1257.674935,
        "SZL":13.797771,
        "THB":31.244996,
        "TJS":11.392478,
        "TMT":3.5,
        "TND":2.7255,
        "TOP":2.232433,
        "TRY":8.570199,
        "TTD":6.784833,
        "TWD":27.605497,
        "TZS":2316.371327,
        "UAH":27.464881,
        "UGX":3542.981997,
        "USD":1,
        "UYU":43.865348,
        "UZS":10568.650055,
        "VES":3110993.868863,
        "VND":23009.048625,
        "VUV":108.218594,
        "WST":2.51332,
        "XAF":537.746808,
        "XAG":0.035653,
        "XAU":0.000525,
        "XCD":2.70255,
        "XDR":0.691785,
        "XOF":537.746808,
        "XPD":0.000353,
        "XPF":97.826936,
        "XPT":0.000841,
        "YER":250.000094,
        "ZAR":13.789204,
        "ZMW":22.466829,
        "ZWL":321.999961
    }
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
    "AED",
    "AFN",
    "ALL",
    "AMD",
    "ANG",
    "AOA",
    "ARS",
    "AUD",
    "AWG",
    "AZN",
    "BAM",
    "BBD",
    "BDT",
    "BGN",
    "BHD",
    "BIF",
    "BMD",
    "BND",
    "BOB",
    "BRL",
    "BSD",
    "BTC",
    "BTN",
    "BWP",
    "BYN",
    "BZD",
    "CAD",
    "CDF",
    "CHF",
    "CLF",
    "CLP",
    "CNH",
    "CNY",
    "COP",
    "CRC",
    "CUC",
    "CUP",
    "CVE",
    "CZK",
    "DJF",
    "DKK",
    "DOP",
    "DZD",
    "EGP",
    "ERN",
    "ETB",
    "EUR",
    "FJD",
    "FKP",
    "GBP",
    "GEL",
    "GGP",
    "GHS",
    "GIP",
    "GMD",
    "GNF",
    "GTQ",
    "GYD",
    "HKD",
    "HNL",
    "HRK",
    "HTG",
    "HUF",
    "IDR",
    "ILS",
    "IMP",
    "INR",
    "IQD",
    "IRR",
    "ISK",
    "JEP",
    "JMD",
    "JOD",
    "JPY",
    "KES",
    "KGS",
    "KHR",
    "KMF",
    "KPW",
    "KRW",
    "KWD",
    "KYD",
    "KZT",
    "LAK",
    "LBP",
    "LKR",
    "LRD",
    "LSL",
    "LYD",
    "MAD",
    "MDL",
    "MGA",
    "MKD",
    "MMK",
    "MNT",
    "MOP",
    "MRO",
    "MRU",
    "MUR",
    "MVR",
    "MWK",
    "MXN",
    "MYR",
    "MZN",
    "NAD",
    "NGN",
    "NIO",
    "NOK",
    "NPR",
    "NZD",
    "OMR",
    "PAB",
    "PEN",
    "PGK",
    "PHP",
    "PKR",
    "PLN",
    "PYG",
    "QAR",
    "RON",
    "RSD",
    "RUB",
    "RWF",
    "SAR",
    "SBD",
    "SCR",
    "SDG",
    "SEK",
    "SGD",
    "SHP",
    "SLL",
    "SOS",
    "SRD",
    "SSP",
    "STD",
    "STN",
    "SVC",
    "SYP",
    "SZL",
    "THB",
    "TJS",
    "TMT",
    "TND",
    "TOP",
    "TRY",
    "TTD",
    "TWD",
    "TZS",
    "UAH",
    "UGX",
    "USD",
    "UYU",
    "UZS",
    "VES",
    "VND",
    "VUV",
    "WST",
    "XAF",
    "XAG",
    "XAU",
    "XCD",
    "XDR",
    "XOF",
    "XPD",
    "XPF",
    "XPT",
    "YER",
    "ZAR",
    "ZMW",
    "ZWL"
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
