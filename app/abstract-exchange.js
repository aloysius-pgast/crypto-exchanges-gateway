"use strict";
const _ = require('lodash');
const logger = require('winston');
const Big = require('big.js');
const Bottleneck = require('bottleneck');
const PromiseHelper = require('./promise-helper');
const Errors = require('./errors');
const CcxtErrors = require('./ccxt-errors');

const precisionToStep = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001, 0.0000001, 0.00000001, 0.000000001, 0.0000000001];

const orderedKlinesIntervals = [
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d',
    '1w',
    '1M'
]
const klinesIntervalsMapping = {
    '1m':60, '3m':180, '5m':300, '15m':900, '30m':1800,
    '1h':3600, '2h':7200, '4h':14400, '6h':21600, '8h':28800, '12h':43200,
    '1d':86400, '3d':259200,
    '1w':604800,
    '1M':2592000
}
// maximum number of klines entries
const MAX_KLINES_ENTRIES = 5000;
// how many klines entries to retrieve for each iteration
const MAX_KLINES_ENTRIES_PER_ITER = 500;

/**
 * All methods prefixed with _ can be called by children classes
 * All methods prefixed with __ are reserved for internal use
 */

/**
 * Updates features list from config (will only change the exchanges which need ws emulation)
 */
const getUpdatedFeatures = (supportedFeatures, config) => {
    let features = _.cloneDeep(supportedFeatures);
    _.forEach(['wsTickers','wsOrderBooks','wsTrades'], (type) => {
        if (features[type].enabled && features[type].emulated)
        {
            if (undefined === config.emulatedWs[type] || !config.emulatedWs[type].enabled)
            {
                features[type] = {enabled:false};
            }
            else
            {
                features[type].period = config.emulatedWs[type].period;
            }
        }
    });
    return features;
}

class AbstractExchange
{

/**
 * @param {string} id exchange unique identifier (ex: binance2)
 * @param {string} type exchange type (ex: binance)
 * @param {string} name exchange name (ex: 'Binance #2')
 * @param {object} supportedFeatures dictionary of all supportedFeatures
 * @param {object} config loaded from JSON
 */
constructor(id, type, name, supportedFeatures, config)
{
    this.__id = id;
    this.__type = type,
    this.__name = name;

    // all supported features
    this.__features = getUpdatedFeatures(supportedFeatures, config.exchanges[id]);

    // whether or not pair is required when requesting tickers, orders ...
    this.__requirePair = false;
    if (true === config.exchanges[id].requirePair)
    {
        this.__requirePair = true;
    }

    this.__feesPercent = config.exchanges[id].feesPercent;

    // whether or not we have credentials and demo mode is enabled
    this.__credentials = {provided:false, isDemo:false};
    if ('' != config.exchanges[id].key && '' != config.exchanges[id].secret)
    {
        this.__credentials.provided = true;
        if ('demo' == config.exchanges[id].key && 'demo' == config.exchanges[id].secret)
        {
            this.__credentials.isDemo = true;
        }
    }

    this.__cachedPairs = {
        lastTimestamp:0,
        nextTimestamp:0,
        // cache result for 1H
        cachePeriod:3600 * 1000,
        cache:{}
    };

    this.__subscriptionManager = null;
    // how many cached orders should we keep ?
    this.__cachedOrdersMaxSize = 1024;
    // list of order number => {pair:"X-Y", state:"open|closed|cancelled", timestamp:int}
    this.__cachedOrders = {
        size:0,
        orders:{}
    };
}

/**
 * Whether or not exchange has credentials (correct or wrong does not matter)
 *
 * @return {boolean} true if exchange has credentials
 */
hasCredentials()
{
    return this.__credentials.provided;
}

/**
 * Whether or not pair we should require pair when tickers, orders are requeted
 * @param {string} feature (optional)
 */
doesRequirePair(feature)
{
    if (!this.__requirePair)
    {
        return false;
    }
    if (undefined === feature || undefined === this.__features[feature])
    {
        return this.__requirePair;
    }
    if (undefined === this.__features[feature].withoutPair || this.__features[feature].withoutPair)
    {
        return false;
    }
    return true;
}

/**
 * Whether or not exchange is running in demo mode
 *
 * @return {boolean} true if exchange is running in demo mode
 */
isDemo()
{
    return this.__credentials.isDemo;
}

/**
 * Indicates whether or not we're using a ccxt exchange
 */
isCcxt()
{
    return false;
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

__logError(e, method)
{
    Errors.logError(e, `exchange|${this.__id}|${method}`)
}

__logNetworkError(e, method)
{
    Errors.logNetworkError(e, `exchange|${this.__id}|${method}`);
}

_precisionToStep(value)
{
    let step = 0.00000001;
    if ('string' == typeof(value))
    {
        step = value.toFixed(10);
    }
    else
    {
        if (value >= 0 && value <= 10)
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
        split = value.toFixed(10).replace(/0+$/g, '').split('.');
    }
    return (split.length > 1) ? (split[1].length) : 0;
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
 * Returns description for an order
 *
 * @param {string} orderNumber order number
 * @return {object|null} {pair:"X-Y", state:"open|closed|cancelled", timestamp:int} or null if order was not found
 */
_getCachedOrder(orderNumber)
{
    if (undefined === this.__cachedOrders.orders[orderNumber])
    {
        return null;
    }
    return this.__cachedOrders.orders[orderNumber];
}

/**
 * Adds a new order to the cache
 *
 * @param {string} orderNumber order number
 * @param {string} orderType order type
 * @param {string} pair order pair
 * @param {string} state order state (open|closed|cancelled)
 */
_cacheOrder(orderNumber, orderType, pair, state)
{
    if (undefined === this.__cachedOrders.orders[orderNumber])
    {
        let timestamp = new Date().getTime();
        this.__cachedOrders.orders[orderNumber] = {orderType:orderType, pair:pair, state:state, timestamp:timestamp};
        ++this.__cachedOrders.size;
    }
    else if (this.__cachedOrders.orders[orderNumber].state != state)
    {
        let timestamp = new Date().getTime();
        this.__cachedOrders.orders[orderNumber].state = state;
        this.__cachedOrders.orders[orderNumber].timestamp = timestamp;
    }
    // too many cached orders ?
    if (this.__cachedOrders.size > this.__cachedOrdersMaxSize)
    {
        this.__freeCachedOrders();
    }
}

/**
 * Free cache to ensure we don't keep too many entries in memory
 */
__freeCachedOrders()
{
    let arr = [];
    // remove all closed orders
    _.forEach(this.__cachedOrders.orders, function (entry, orderNumber) {
        if ('open' != entry.state)
        {
            arr.push(orderNumber);
        }
    });
    _.forEach(arr, function (orderNumber) {
        delete this.__cachedOrders[orderNumber];
    });
    this.__cachedOrders.size = Object.keys(this.__cachedOrders.orders).length;
}

/**
 * Returns a new object with default limits
 *
 * @return {object}
 */
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
 * Whether or not exchange is a dummy exchange (ie: paper exchange for test purpose, mostly for internal use)
 */
isDummy()
{
    return 'dummy' == this.__type;
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
 * Returns the fees % ([0,100])
 *
 * @return {float}
 */
getFeesPercent()
{
    return this.__feesPercent;
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
 * Returns a specific feature
 *
 * @param {string} feature feature to return
 * @return {object} feature object
 */
getFeature(feature)
{
    if (undefined === this.__features[feature])
    {
        return null;
    }
    return this.__features[feature];
}

/**
 * Returns the type of exchange (ex: binance, bittrex...)
 *
 * @return {string}
 */
getType()
{
    return this.__type;
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

//-- subscriptions
_setSubscriptionManager(manager)
{
    this.__subscriptionManager = manager;
}

getSubscriptionManager()
{
    return this.__subscriptionManager;
}

//-- exchange methods

/**
 * Internal function used to update cached pairs
 *
 * @param {boolean} forceRefresh if true cache will be refreshed even if it's not expired
 * @return {Promise} which resolves to true on success, false otherwise
 */
async __refreshCachedPairs(forceRefresh)
{
    let timestamp = Date.now();
    if (!forceRefresh && timestamp < this.__cachedPairs.nextTimestamp)
    {
        return true;
    }
    try
    {
        let list = await this._getPairs();
        // only update cache if list is not empty
        if (!_.isEmpty(list))
        {
            timestamp = Date.now();
            this.__cachedPairs.cache = list;
            this.__cachedPairs.lastTimestamp = timestamp;
            this.__cachedPairs.nextTimestamp = timestamp + this.__cachedPairs.cachePeriod;
        }
    }
    catch (e)
    {
        this.__logError(e, '__refreshCachedPairs');
        return false;
    }
    return true;
}

/**
 * Retrieves pairs symbols
 *
 * @param {boolean} useCache whether or not cache should be used
 * @param {string[]} opt.pairs used to retrieve a list of pairs (optional)
 * @param {string[]} opt.currencies used to retrieve pairs for a list of currencies (optional, will be ignored if 'opt.pairs' is set)
 * @param {string[]} opt.baseCurrencies used to retrieve pairs for a list of base currencies (optional, will be ignored if 'opt.pairs' or 'opt.currencies' is set)
 * @return {Promise} Promise which will resolve to an array such as below
 */
/*

Output example

["BTC-LTC", "BTC-DOGE"]

*/
async getPairsSymbols(useCache, opt)
{
    return Object.keys(await this.getPairs(useCache, opt));
}

/**
 * Retrieves pairs
 *
 * @param {boolean} useCache whether or not cache should be used
 * @param {string[]} opt.pairs used to retrieve a list of pairs (optional)
 * @param {string[]} opt.currencies used to retrieve pairs for a list of currencies (optional, will be ignored if 'opt.pairs' is set)
 * @param {string[]} opt.baseCurrencies used to retrieve pairs for a list of base currencies (optional, will be ignored if 'opt.pairs' or 'opt.currencies' is set)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "BTC-LTC":{
        "pair":"BTC-LTC",
        "baseCurrency":"BTC",
        "currency":"LTC",
        "limits":{
            "rate":{
                "min":1e-8,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "quantity":{
                "min":0.01469482,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "price":{
                "min":0,
                "max":null
            }
        }
    },
    "BTC-DOGE":{
        "pair":"BTC-DOGE",
        "baseCurrency":"BTC",
        "currency":"DOGE",
        "limits":{
            "rate":{
                "min":1e-8,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "quantity":{
                "min":274.72527473,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "price":{
                "min":0,
                "max":null
            }
        }
    }
}
*/
async getPairs(useCache, opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    await this.__refreshCachedPairs(!useCache);
    // filter by pairs
    if (undefined !== opt.pairs && 0 != opt.pairs.length)
    {
        let list = {};
        for (let i = 0; i < opt.pairs.length; ++i)
        {
            if (undefined !== this.__cachedPairs.cache[opt.pairs[i]])
            {
                list[opt.pairs[i]] = this.__cachedPairs.cache[opt.pairs[i]];
            }
        }
        return list;
    }
    // filter by currencies
    else if (undefined !== opt.currencies && 0 != opt.currencies.length)
    {
        let filter = {};
        // build filter
        for (let i = 0; i < opt.currencies.length; ++i)
        {
            filter[opt.currencies[i]] = true;
        }
        let list = {};
        _.forEach(this.__cachedPairs.cache, (e) => {
            if (undefined !== filter[e.currency])
            {
                list[e.pair] = e;
            }
        });
        return list;
    }
    // filter by based currencies
    else if (undefined !== opt.baseCurrencies && 0 != opt.baseCurrencies.length)
    {
        let filter = {};
        // build filter
        for (let i = 0; i < opt.baseCurrencies.length; ++i)
        {
            filter[opt.baseCurrencies[i]] = true;
        }
        let list = {};
        _.forEach(this.__cachedPairs.cache, (e) => {
            if (undefined !== filter[e.baseCurrency])
            {
                list[e.pair] = e;
            }
        });
        return list;
    }
    return this.__cachedPairs.cache;
}

/**
 * Retrieves pairs
 *
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "BTC-LTC":{
        "pair":"BTC-LTC",
        "baseCurrency":"BTC",
        "currency":"LTC",
        "limits":{
            "rate":{
                "min":1e-8,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "quantity":{
                "min":0.01469482,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "price":{
                "min":0,
                "max":null
            }
        }
    },
    "BTC-DOGE":{
        "pair":"BTC-DOGE",
        "baseCurrency":"BTC",
        "currency":"DOGE",
        "limits":{
            "rate":{
                "min":1e-8,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "quantity":{
                "min":274.72527473,
                "max":null,
                "step":1e-8,
                "precision":8
            },
            "price":{
                "min":0,
                "max":null
            }
        }
    }
}
*/
_getPairs()
{
    throw new Error('Override !');
}

/**
 * Retrieve tickers for a list of pairs
 *
 * @param {string[]} pairs array of pairs to retrieve tickers for. If undefined or empty, tickers for all pairs will be retrieved
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */

/*
Output example

{
    "USDT-NEO":{
        "pair":"USDT-NEO",
        "last":137.081,
        "priceChangePercent":-3.041,
        "sell":137.143,
        "buy":137.081,
        "high":145,
        "low":132,
        "volume":399433.119,
        "timestamp":1519806208.086
    },
    "USDT-ETH":{
        "pair":"USDT-ETH",
        "last":877.66,
        "priceChangePercent":-1.607,
        "sell":877.66,
        "buy":877.58,
        "high":897.39,
        "low":864.21,
        "volume":60846.31843,
        "timestamp":1519806207.27
    }
}
*/
async getTickers(pairs)
{
    if (undefined === pairs)
    {
        pairs = [];
    }
    // we can retrieve all tickers at once
    if (this.__features['tickers'].withoutPair)
    {
        let data;
        try
        {
            data = await this._getTickers();
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getTickers');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getTickers');
            throw new Errors.GatewayError.InternalError();
        }
        if (0 == pairs.length)
        {
            return data;
        }
        // filter pairs
        let list = {};
        for (let i = 0; i < pairs.length; ++i)
        {
            if (undefined !== data[pairs[i]])
            {
                list[pairs[i]] = data[pairs[i]];
            }
        }
        return list;
    }
    else
    {
        // ensure we're allowed to retrieve all open orders by looping through all pairs
        if (0 == pairs.length)
        {
            if (this.__requirePair)
            {
                let message = `Retrieving all tickers without specifying a list of pairs is not allowed`;
                throw new Errors.GatewayError.InvalidRequest.MissingParameters('pairs', message);
            }
        }
        try
        {
            let _pairs = await this.getPairsSymbols(true, {pairs:pairs});
            let list = await this.__getTickers(_pairs);
            return await this._finalizeTickers(list);
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getTickers');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getTickers');
            throw new Errors.GatewayError.InternalError();
        }
    }
}

//-- tickers methods

/**
 * Calls _getTicker multiple times
 * @param {string[]} pairs list of pairs
 * @return {Promise}
 */
async __getTickers(pairs)
{
    let list = {};
    if (0 == pairs.length)
    {
        return list;
    }
    let arr = [];
    _.forEach(pairs, (pair) => {
        let p = this._getTicker(pair);
        arr.push({promise:p, context:{exchange:this.__id,api:'_getTicker',pair:pair}});
    });
    let data = await PromiseHelper.all(arr);
    _.forEach(data, function (entry) {
        // could not retrieve specific ticker
        if (!entry.success)
        {
            return;
        }
        list[entry.value.pair] = entry.value;
    });
    return list;
}

/**
 * Gives exchange an opportunity to do extra processing on a list of tickers. Will be called in case exchange does not support retrieving tickers for all pairs at once
 * @param {object} dictionary of tickers
 * @return {Promise}
 */
async _finalizeTickers(list)
{
    return Promise.resolve(list);
}

/**
 * Retrieve tickers for all pairs
 *
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "USDT-NEO":{
        "pair":"USDT-NEO",
        "last":137.081,
        "priceChangePercent":-3.041,
        "sell":137.143,
        "buy":137.081,
        "high":145,
        "low":132,
        "volume":399433.119,
        "timestamp":1519806208.086
    },
    "USDT-ETH":{
        "pair":"USDT-ETH",
        "last":877.66,
        "priceChangePercent":-1.607,
        "sell":877.66,
        "buy":877.58,
        "high":897.39,
        "low":864.21,
        "volume":60846.31843,
        "timestamp":1519806207.27
    }
}
*/
async _getTickers()
{
    throw new Error('Override');
}

/**
 * Retrieve ticker for a single pair

 * @param {string} pair pair to retrieve ticker for
 * @return {Promise} Promise which will resolve to an object such as below
 */
/*
Output example

{
    "pair":"USDT-NEO",
    "last":137.081,
    "priceChangePercent":-3.041,
    "sell":137.143,
    "buy":137.081,
    "high":145,
    "low":132,
    "volume":399433.119,
    "timestamp":1519806208.086
}
*/
async _getTicker(pair)
{
    throw new Error('Override');
}

//-- order book methods
/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (optional)
 * @return {Promise} Promise which will resolve to an object such as below
 */
/*
Output example

{
    "buy":[
        {"rate":0.005297,"quantity":125.74},
        {"rate":0.005288,"quantity":385.2},
        ...
    ],
    "sell":[
        {"rate":0.005303,"quantity":16.83},
        {"rate":0.005305,"quantity":16.02},
        ...
    ]
}
*/
async getOrderBook(pair, opt)
{
    let _opt = {custom:{}};
    let requestedLimit = this.getDefaultOrderBookLimit();
    if (undefined !== opt)
    {
        if (undefined !== opt.limit && opt.limit > 0)
        {
            requestedLimit = opt.limit;
            _opt.limit = this._fixOrderBookLimit(requestedLimit);
        }
        if (undefined !== opt.custom)
        {
            _opt.custom = opt.custom;
        }
    }
    if (undefined === _opt.limit)
    {
        _opt.limit = requestedLimit;
    }
    let data;
    try
    {
        data = await this._getOrderBook(pair, _opt);
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'getOrderBook');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'getOrderBook');
        throw new Errors.GatewayError.InternalError();
    }
    if (undefined !== requestedLimit)
    {
        if (data.buy.length > requestedLimit || data.sell.length > requestedLimit)
        {
            data.buy = data.buy.slice(0, requestedLimit);
            data.sell = data.sell.slice(0, requestedLimit);
        }
    }
    return data;
}

/**
 * Returns the default value for order book limit
 * @return {integer}
 */
getDefaultOrderBookLimit()
{
    return undefined;
}

/**
 * Used to ensure we use a supported limit
 *
 * @param {integer} limit requested order book limit
 * @return {integer} supported limit (>= requested limit)
 */
_fixOrderBookLimit(limit)
{
    return limit;
}

/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise} Promise which will resolve to an object such as below
 */
 /*
 Output example

 {
     "buy":[
         {"rate":0.005297,"quantity":125.74},
         {"rate":0.005288,"quantity":385.2},
         ...
     ],
     "sell":[
         {"rate":0.005303,"quantity":16.83},
         {"rate":0.005305,"quantity":16.02},
         ...
     ]
 }
 */
async _getOrderBook(pair, opt)
{
    throw new Error('Override');
}

//-- trades methods

/**
 * Returns last trades
 *
 * @param {string} pair pair to retrieve trades for
 * @param {integer} opt.limit maximum number of entries (optional)
 * @param {integer|string} opt.afterTradeId only retrieve trade with an ID > opt.afterTradeId (optional)
 * @param {float} opt.afterTimestamp unix timestamp (sec) to only retrieve trade with a timestamp > opt.afterTimestamp (optional)
 * @param {object} opt.custom exchange specific options (optional)
 * @return {Promise} Promise which will resolve to an array such as below
 */
/*
Output example

[
    {
        "id":1132933,
        "quantity":0.95,
        "rate":0.072699,
        "price":0.06906405,
        "orderType":"sell",
        "timestamp":1505731777.52
    },
    {
        "id":1132932,
        "quantity":1,
        "rate":0.072602,
        "price":0.072602,
        "orderType":"buy",
        "timestamp":1505731693.57
    }
]
*/
async getTrades(pair, opt)
{
    let _opt = {custom:{}};
    let requestedLimit = this.getDefaultTradesLimit();
    let afterTradeId = 0;
    let afterTimestamp = 0;

    if (undefined !== opt)
    {
        if (undefined !== opt.limit && opt.limit > 0)
        {
            requestedLimit = opt.limit;
            _opt.limit = this._fixTradesLimit(requestedLimit);
        }
        if (undefined !== opt.custom)
        {
            _opt.custom = opt.custom;
        }
        // handle afterTradeId & afterTimestamp
        if (undefined !== opt.afterTradeId)
        {
            afterTradeId = opt.afterTradeId;
        }
        if (undefined !== opt.afterTimestamp)
        {
            afterTimestamp = opt.afterTimestamp;
        }
    }
    if (undefined === _opt.limit)
    {
        _opt.limit = requestedLimit;
    }

    let data;
    try
    {
        data = await this._getTrades(pair, _opt);
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'getTrades');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'getTrades');
        throw new Errors.GatewayError.InternalError();
    }

    if (undefined === requestedLimit && 0 == afterTradeId && 0 == afterTimestamp)
    {
        return data;
    }
    // handle limits, afterTradeId & afterTimestamp
    let r = [];
    _.forEach(data, (entry) => {
        // check afterTradeId
        if (0 != afterTradeId)
        {
            // trade id might not be supported for all exchanges, and might be set to null
            if (null === entry.id)
            {
                return;
            }
            if (entry.id <= afterTradeId)
            {
                return;
            }
        }
        // check afterTimestamp
        if (0 != afterTimestamp && entry.timestamp <= afterTimestamp)
        {
            return;
        }
        r.push(entry);
        // check limit
        if (undefined !== requestedLimit && requestedLimit == r.length)
        {
            return false;
        }
    });
    return r;
}

/**
 * Returns the default value for trades limit
 * @return {integer}
 */
getDefaultTradesLimit()
{
    return undefined;
}

/**
 * Used to ensure we use a supported limit
 *
 * @param {integer} limit requested trades limit
 * @return {integer} supported limit (>= requested limit)
 */
_fixTradesLimit(limit)
{
    return limit;
}

/**
 * Returns last trades
 *
 * @param {string} pair pair to retrieve trades for
 * @param {integer} opt.limit maximum number of entries (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise}
 */
 /*
 Output example

[
    {
        "id":1132933,
        "quantity":0.95,
        "rate":0.072699,
        "price":0.06906405,
        "orderType":"sell",
        "timestamp":1505731777.52
    },
    {
        "id":1132932,
        "quantity":1,
        "rate":0.072602,
        "price":0.072602,
        "orderType":"buy",
        "timestamp":1505731693.57
    }
]
*/
async _getTrades(pair, opt)
{
    throw new Error('Override');
}


//-- klines methods

/**
 * Returns charts data (max entries = 5000)
 *
 * @param {string} pair pair to retrieve chart data for
 * @param {string} opt.interval charts interval (optional, if not set will use default interval for exchange)
 * @param {float} opt.fromTimestamp unix timestamp in seconds (optional, if not set will return last 'limit' entries)
 * @param {float} opt.toTimestamp unix timestamp in seconds (optional, if not set will return first 500 entries from 'opt.fromTimestamp')
 * @param {integer} opt.limit number of entries to return (optional, default = 500, max = 5000) (will be ignored if 'opt.toTimestamp' is set)
 * @return {Promise}
 */
/*
Output example

[
    {
        "timestamp":1513256400,
        "remainingTime":0,
        "closed":true,
        "open":47.928,
        "high":48.7,
        "low":45.801,
        "close":47.076,
        "volume":6361.947
    },
    {
        "timestamp":1513260000,
        "remainingTime":0,
        "closed":true,
        "open":47.11,
        "high":47.11,
        "low":44.744,
        "close":45.357,
        "volume":5352.611,
    },
    {
        "timestamp":1513263600,
        "remainingTime":17,
        "closed":false,
        "open":45.271,
        "high":46.8,
        "low":43,
        "close":46.018,
        "volume":8146.15
    }
]
*/
async getKlines(pair, opt)
{
    let interval = this.__features.klines.defaultInterval;
    let fromTimestamp;
    let toTimestamp;
    let now = Math.floor(Date.now() / 1000.0);
    let limit;
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined !== opt.interval)
    {
        interval = this.__fixKlinesInterval(opt.interval);
    }
    // compute timestamp so that we retrieve MAX_KLINES_ENTRIES_PER_ITER entries
    if (undefined === opt.fromTimestamp || opt.fromTimestamp > now)
    {
        limit = MAX_KLINES_ENTRIES_PER_ITER;
        if (undefined !== opt.limit)
        {
            limit = opt.limit;
            if (limit > MAX_KLINES_ENTRIES)
            {
                limit = MAX_KLINES_ENTRIES;
            }
        }
        fromTimestamp = now - klinesIntervalsMapping[interval] * limit;
        toTimestamp = now;
    }
    else
    {
        fromTimestamp = parseInt(opt.fromTimestamp);
        if (fromTimestamp > now)
        {
            fromTimestamp = now;
        }
        if (undefined === opt.toTimestamp)
        {
            limit = MAX_KLINES_ENTRIES_PER_ITER;
            if (undefined !== opt.limit)
            {
                limit = opt.limit;
                if (limit > MAX_KLINES_ENTRIES)
                {
                    limit = MAX_KLINES_ENTRIES;
                }
            }
            toTimestamp = fromTimestamp + klinesIntervalsMapping[interval] * limit;
        }
        else
        {
            toTimestamp = parseInt(opt.toTimestamp);
        }
        if (toTimestamp > now)
        {
            toTimestamp = now;
        }
    }
    let list = [];
    // loop to get all requested klines
    let stop = false;
    let _toTimestamp = toTimestamp;
    let iter = 0;
    while (true)
    {
        // all klines with a timestamp <= should be considered as closed
        let _now = Math.floor(Date.now() / 1000.0);
        let closedTimestamp = _now - klinesIntervalsMapping[interval];
        ++iter;
        let data;
        try
        {
            data = await this._getKlines(pair, interval, fromTimestamp, _toTimestamp);
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getKlines');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getKlines');
            throw new Errors.GatewayError.InternalError();
        }
        // remove first entry if it's not the first iteration
        if (iter > 1)
        {
            data.shift();
        }
        // we got less entries than expected => check last entry
        // we need to do this because there might be missing entries after exchange outage (Binance for example)
        if (data.length < MAX_KLINES_ENTRIES_PER_ITER)
        {
            if (0 != data.length)
            {
                let last = data[data.length - 1];
                // consider we're done is last kline has at least toTimestamp - interval
                let minTimestamp = toTimestamp - klinesIntervalsMapping[interval];
                if (last.timestamp >= minTimestamp)
                {
                    stop = true;
                }
            }
        }
        // no more data
        if (0 == data.length)
        {
            break;
        }

        _.forEach(data, (e) => {
            // entry is newer than max timestamp (stop processing)
            if (e.timestamp > toTimestamp)
            {
                stop = true;
                return false;
            }
            // entry is older than min timestamp (ignore and stop if it's not first iteration)
            if (e.timestamp < fromTimestamp)
            {
                if (iter > 1)
                {
                    stop = true;
                    return false;
                }
                return;
            }
            e.remainingTime = (e.timestamp <= closedTimestamp) ? 0 : e.timestamp + klinesIntervalsMapping[interval] - _now;
            if (e.remainingTime < 0)
            {
                e.remainingTime = 0;
            }
            e.closed = 0 == e.remainingTime;
            list.push(e);
            // we reached requested limit
            if (undefined !== limit && list.length == limit)
            {
                stop = true;
                return false;
            }
            // we reached the maximum number of entries
            if (MAX_KLINES_ENTRIES == list.length)
            {
                stop = true;
                return false;
            }
        });
        if (stop)
        {
            if (0 !== list.length)
            {
                /*
                  Change 'closed' for last entry since some exchanges will only update volume for kline K1 after the
                  first trade in kline K2 (yeah, looking at you Poloniex & Bittrex...)
                */
                list[list.length - 1].closed = false;
            }
            break;
        }
        if (0 == list.length)
        {
            break;
        }
        // update timestamps for next iteration (start from the timestamp in last entry)
        fromTimestamp = parseInt(list[list.length - 1].timestamp);
        _toTimestamp = fromTimestamp + klinesIntervalsMapping[interval] * MAX_KLINES_ENTRIES_PER_ITER;
        if (_toTimestamp > now)
        {
            _toTimestamp = now;
        }
    }
    return list;
}

/**
 * Used to ensure we use a supported kline interval
 *
 * @param {string} interval requested interval
 * @return {string} supported interval
 */
__fixKlinesInterval(interval)
{
    if (-1 !== this.__features.klines.intervals.indexOf(interval))
    {
        return interval;
    }
    let index = orderedKlinesIntervals.indexOf(interval);
    // use default if we don't know this interval
    if (-1 === index)
    {
        return this.__features.klines.defaultInterval;
    }
    let maxIndex = orderedKlinesIntervals.length - 1;
    // use default if we don't have any greater interval
    if (maxIndex == index)
    {
        return this.__features.klines.defaultInterval;
    }
    // try to find the first greater interval which is supported
    for (let i = index + 1; i <= maxIndex; ++i)
    {
        if (-1 !== this.__features.klines.intervals.indexOf(orderedKlinesIntervals[i]))
        {
            return orderedKlinesIntervals[i];
        }
    }
    // use default by default
    return this.__features.klines.defaultInterval;
}


/**
 * Returns charts data
 *
 * @param {string} pair pair to retrieve chart data for
 * @param {string} interval charts interval
 * @param {integer} fromTimestamp unix timestamp in seconds
 * @param {integer} toTimestamp unix timestamp in seconds
 * @return {Promise}
 */
async _getKlines(pair, interval, fromTimestamp, toTimestamp)
{
    throw new Error('Override');
}

/**
 * Returns a list of supported klines intervals
 *
 * @return {string[]} will be null if klines are not supported
 */
/*
Output example

["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"]

*/
getSupportedKlinesIntervals()
{
    if (!this.__features.klines.enabled)
    {
        return null;
    }
    return this.__features.klines.intervals;
}

/**
 * Returns the default interval for klines
 *
 * @return {string[]} will be null if klines are not supported
 */
/*
Output example

"5m"
*/
getDefaultKlinesInterval()
{
    if (!this.__features.klines.enabled)
    {
        return null;
    }
    return this.__features.klines.defaultInterval;
}

/**
 * Indicates whether or not an interval if supported
 *
 * @return {boolean}
 */
isKlinesIntervalSupported(interval)
{
    if (!this.__features.klines.enabled)
    {
        return false;
    }
    return -1 !== this.__features.klines.intervals.indexOf(interval);
}

/**
 * Returns the duration (in sec) of a given klines interval
 * @param {string} interval klines interval
 * @return {integer} duration in sec
 */
_getKlinesIntervalDuration(interval)
{
    return klinesIntervalsMapping[interval];
}

//-- order methods

/**
 * Test an order and update quantity. Ensure the following :
 *
 * - rate is > min(rate) and matches precision/step
 * - quantity is > min(quantity) and matches precision/step
 * - targetPrice is > min(price)
 *
 *
 * NB: one of opt.quantity|opt.targetPrice|opt.finalPrice should be defined
 *
 * @param {string} orderType order type (buy|sell)
 * @param {string} pair pair (ex: USDT-NEO)
 * @param {float} targetRate
 * @param {float} opt.quantity (optional)
 * @param {float} opt.targetPrice targetRate * opt.quantity (optional, will be ignored if opt.quantity is defined)
 * @param {float} opt.finalPrice (targetRate * opt.quantity) +- fees (optional, will be ignored if opt.quantity or opt.targetPrice is defined)
 * @param {float} opt.feesPercent fees % (optional) (0-100)
 * @return {Promise}
 */
/*
Output example

{
    "orderType":"buy",
    "pair":"USDT-NEO",
    "targetRate":12,
    "quantity":8.341,
    "targetPrice":100.092,
    "fees":0.100092,
    "finalPrice":100.192092
}

*/
async testOrder(orderType, pair, targetRate, opt)
{
    let pairs;
    try
    {
        pairs = await this.getPairs(true, {pairs:[pair]});
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'testOrder');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'testOrder');
        throw new Errors.GatewayError.InternalError();
    }
    if (undefined === pairs[pair])
    {
        throw new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair(this.__id, pair);
    }
    let _pair = pairs[pair];
    let order = {orderType:orderType,pair:pair};
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined === opt.feesPercent)
    {
        opt.feesPercent = this.__feesPercent;
    }
    let feesPercent = new Big(opt.feesPercent).div(100.0);
    // ensure rate is within limits
    let rate = new Big(this._getRoundedFloat(targetRate, _pair.limits.rate.precision, _pair.limits.rate.step));
    if (rate.lt(_pair.limits.rate.min))
    {
        rate = new Big(_pair.limits.rate.min);
    }
    else if (null !== _pair.limits.rate.max)
    {
        if (rate.gt(_pair.limits.rate.max))
        {
            rate = new Big(_pair.limits.rate.max);
        }
    }
    order.targetRate = parseFloat(rate.toFixed(_pair.limits.rate.precision));

    // compute targetPrice
    let targetPrice;
    if (undefined !== opt.quantity)
    {
        let quantity = new Big(opt.quantity);
        targetPrice = quantity.times(rate);
    }
    else if (undefined !== opt.targetPrice)
    {
        targetPrice = new Big(opt.targetPrice);
    }
    else if (undefined !== opt.finalPrice)
    {
        if ('buy' == orderType)
        {
            let feesFactor = new Big(1).plus(feesPercent);
            targetPrice = new Big(opt.finalPrice).div(feesFactor);
        }
        else
        {
            let feesFactor = new Big(1).minus(feesPercent);
            targetPrice = new Big(opt.finalPrice).div(feesFactor);
        }
    }
    else
    {
        logger.warn("At least one of [opt.quantity,opt.rawPrice,opt.finalPrice] should be defined when calling 'testOrder'");
        throw new Errors.GatewayError.InternalError();
    }
    // ensure targetPrice is >= min
    if (targetPrice.lt(_pair.limits.price.min))
    {
        targetPrice = new Big(_pair.limits.price.min);
    }
    // ensure targetPrice is <= max
    else if (null !== _pair.limits.price.max)
    {
        if (targetPrice.gt(_pair.limits.price.max))
        {
            targetPrice = new Big(_pair.limits.price.max);
        }
    }

    // compute quantity from targetPrice & targetRate
    let quantity = targetPrice.div(rate);
    quantity = new Big(this._getRoundedFloat(quantity, _pair.limits.quantity.precision, _pair.limits.quantity.step));
    if (quantity.lt(_pair.limits.quantity.min))
    {
        quantity = new Big(_pair.limits.quantity.min);
    }
    else if (null !== _pair.limits.quantity.max)
    {
        if (quantity.gt(_pair.limits.quantity.max))
        {
            quantity = new Big(_pair.limits.quantity.max);
        }
    }

    // recompute targetPrice from quantity & targetRate
    targetPrice = quantity.times(rate);
    if (targetPrice < _pair.limits.price.min)
    {
        // increase quantity by 1 step
        quantity = quantity.plus(_pair.limits.quantity.step);
        targetPrice = quantity.times(rate);
    }

    // now we have correct quantity & targetPrice
    order.quantity = parseFloat(quantity.toFixed(_pair.limits.quantity.precision));
    order.targetPrice = parseFloat(targetPrice.toFixed(8));

    // compute fees
    let fees = targetPrice.times(feesPercent);
    order.fees = parseFloat(fees.toFixed(8));

    // compute finalPrice
    let finalPrice;
    if ('buy' == orderType)
    {
        finalPrice = new Big(targetPrice).plus(order.fees);
    }
    else
    {
        finalPrice = new Big(targetPrice).minus(order.fees);
    }
    order.finalPrice = parseFloat(finalPrice.toFixed(8));

    return order;
}

/**
 * Retrieve open orders for a list of pairs
 *
 * @param {string[]} pairs array of pairs to retrieve open orders for. If undefined or empty, open orders for all pairs will be retrieved
 * @param {string} opt.orderNumber used to return only one order (optional)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */

/*
Output example

{
    "Xfs4XfHeXqHYycNB4s2PoT":{
        "pair":"ETH-BNB",
        "orderType":"sell",
        "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
        "targetRate":0.0095,
        "quantity":250,
        "openTimestamp":1503564675,
        "targetPrice":2.375,
        "remainingQuantity":250
    },...
}
*/
async getOpenOrders(pairs, opt)
{
    if (undefined === pairs)
    {
        pairs = [];
    }
    if (undefined === opt)
    {
        opt = {};
    }
    // we can retrieve all open orders at once
    if (this.__features['openOrders'].withoutPair)
    {
        if (this.__requirePair)
        {

        }
        let data;
        try
        {
            data = await this._getOpenOrders();
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getOpenOrders');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getOpenOrders');
            throw new Errors.GatewayError.InternalError();
        }
        if (0 == pairs.length && undefined === opt.orderNumber)
        {
            return data;
        }
        let _pairs = {};
        for (let i = 0; i < pairs.length; ++i)
        {
            _pairs[pairs[i]] = true;
        }
        let list = {};
        _.forEach(data, (order) => {
            // we're not interested in this pair
            if (0 != pairs.length && undefined === _pairs[order.pair])
            {
                return;
            }
            // filter orderNumber
            if (undefined !== opt.orderNumber)
            {
                // we're not interested in this order
                if (opt.orderNumber != order.orderNumber)
                {
                    return;
                }
                list[order.orderNumber] = order;
                return false;
            }
            list[order.orderNumber] = order;
        });
        return list;
    }
    else
    {
        // ensure we're allowed to retrieve all open orders by looping through all pairs
        if (0 == pairs.length)
        {
            if (this.__requirePair)
            {
                let message = `Retrieving all open orders without specifying a list of pairs is not allowed`;
                throw new Errors.GatewayError.InvalidRequest.MissingParameters('pairs', message);
            }
        }
        try
        {
            let _pairs = await this.getPairsSymbols(true, {pairs:pairs});
            let list = await this.__getOpenOrders(_pairs, opt.orderNumber);
            return list;
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getOpenOrders');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getOpenOrders');
            throw new Errors.GatewayError.InternalError();
        }
    }
}

/**
 * Calls _getOpenOrdersForPair multiple times
 * @param {string[]} pairs list of pairs
 * @param {string} orderNumber used to return only a single order  (optional)
 * @return {Promise}
 */
async __getOpenOrders(pairs, orderNumber)
{
    let list = {};
    if (0 == pairs.length)
    {
        return list;
    }
    let arr = [];
    _.forEach(pairs, (pair) => {
        let p = this._getOpenOrdersForPair(pair);
        arr.push({promise:p, context:{exchange:this.__id,api:'_getOpenOrdersForPair',pair:pair}});
    });
    let data = await PromiseHelper.all(arr);
    _.forEach(data, (entry) => {
        // could not retrieve open orders for a given pair
        if (!entry.success)
        {
            return;
        }
        _.forEach(entry.value, (order) => {
            // filter orderNumber
            if (undefined !== orderNumber)
            {
                // we're not interested in this order
                if (orderNumber != order.orderNumber)
                {
                    return;
                }
                list[order.orderNumber] = order;
                return false;
            }
            list[order.orderNumber] = order;
        });
    });
    return await this._finalizeOpenOrders(list);
}

/**
 * Retrieve open orders for all pairs
 *
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "Xfs4XfHeXqHYycNB4s2PoT":{
        "pair":"ETH-BNB",
        "orderType":"sell",
        "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
        "targetRate":0.0095,
        "quantity":250,
        "openTimestamp":1503564675,
        "targetPrice":2.375,
        "remainingQuantity":250
    },...
}
*/
async _getOpenOrders()
{
    throw new Error('Override');
}

/**
 * Retrieve open orders for a single pair

 * @param {string} pair pair to retrieve open orders for
 * @return {Promise} Promise which will resolve to an object such as below
 */
/*
Output example

{
    "Xfs4XfHeXqHYycNB4s2PoT":{
        "pair":"ETH-BNB",
        "orderType":"sell",
        "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
        "targetRate":0.0095,
        "quantity":250,
        "openTimestamp":1503564675,
        "targetPrice":2.375,
        "remainingQuantity":250
    },...
}
*/
async _getOpenOrdersForPair(pair)
{
    throw new Error('Override');
}

/**
 * Gives exchange an opportunity to do extra processing on a list of open orders. Will be called in case exchange does not support retrieving open orders for all pairs at once
 * @param {object} dictionary of open orders
 * @return {Promise}
 */
async _finalizeOpenOrders(list)
{
    return Promise.resolve(list);
}

/**
 * Retrieve closed orders for a list of pairs
 *
 * @param {string[]} pairs array of pairs to retrieve closed orders for. If undefined or empty, closed orders for all pairs will be retrieved
 * @param {string} opt.orderNumber used to return only one order (optional)
 * @param {boolean} opt.completeHistory used to retrieve all orders (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */

/*
Output example

actualPrice is (quantity * actualRate)
finalPrice is (actualPrice +/- fees.amount)
finalRate is (finalPrice / quantity)

{
    "181217792":{
        "pair":"USDT-BCH",
        "orderNumber":"181217792",
        "orderType":"sell",
        "quantity":0.00001557,
        "actualPrice":0.00463986,
        "finalPrice":"0.00462826",
        "openTimestamp":null,
        "closedTimestamp":1502980611,
        "fees":{
            "amount":0.0000116,
            "currency":"BCH"
        },
        "actualRate":298,
        "finalRate":297.25497752
    },
    "2030423730":{
        "pair":"ETH-GNT",
        "orderNumber":"2030423730",
        "orderType":"buy",
        "quantity":1017.943,
        "actualPrice":2.46182388,
        "finalPrice":"2.46551661",
        "openTimestamp":null,
        "closedTimestamp":1495788784,
        "fees":{
            "amount":0.00369273,
            "currency":"ETH"
        },
        "actualRate":0.00241843,
        "finalRate":0.00242206
    }
}
*/
async getClosedOrders(pairs, opt)
{
    if (undefined === pairs)
    {
        pairs = [];
    }
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined !== opt.orderNumber)
    {
        // only if we can retrieve a single order
        if (this.__features['orders'].enabled)
        {
            let pair = pairs[0];
            let order;
            try
            {
                order = await this.getOrder(opt.orderNumber, pair);
            }
            // if order is not found, return an empty result
            catch (e)
            {
                if (e instanceof Errors.BaseError)
                {
                    // order not found
                    if (!(e instanceof Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound))
                    {
                        this.__logError(e, 'getClosedOrders');
                        logger.warn(JSON.stringify(e));
                    }
                    return {};
                }
                this.__logError(e, 'getClosedOrders');
                throw new Errors.GatewayError.InternalError();
            }
            let list = {};
            list[order.orderNumber] = order;
            return list;
        }
    }
    let completeHistory = false;
    if (undefined !== opt)
    {
        completeHistory = true === opt.completeHistory;
    }
    // we can retrieve all open orders at once
    if (this.__features['closedOrders'].withoutPair)
    {
        let data;
        try
        {
            data = await this._getClosedOrders(completeHistory);
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getClosedOrders');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getClosedOrders');
            throw new Errors.GatewayError.InternalError();
        }
        if (0 == pairs.length && undefined === opt.orderNumber)
        {
            return data;
        }
        let _pairs = {};
        for (let i = 0; i < pairs.length; ++i)
        {
            _pairs[pairs[i]] = true;
        }
        let list = {};
        _.forEach(data, (order) => {
            // we're not interested in this pair
            if (0 != pairs.length && undefined === _pairs[order.pair])
            {
                return;
            }
            // filter orderNumber
            if (undefined !== opt.orderNumber)
            {
                // we're not interested in this order
                if (opt.orderNumber != order.orderNumber)
                {
                    return;
                }
                list[order.orderNumber] = order;
                return false;
            }
            list[order.orderNumber] = order;
        });
        return list;
    }
    else
    {
        // ensure we're allowed to retrieve all open orders by looping through all pairs
        if (0 == pairs.length)
        {
            if (this.__requirePair)
            {
                let message = `Retrieving all closed orders without specifying a list of pairs is not allowed`;
                throw new Errors.GatewayError.InvalidRequest.MissingParameters('pairs', message);
            }
        }
        try
        {
            let _opt = {completeHistory:completeHistory};
            if (undefined !== opt.orderNumber)
            {
                _opt.orderNumber = opt.orderNumber;
            }
            let _pairs = await this.getPairsSymbols(true, {pairs:pairs});
            let list = await this.__getClosedOrders(_pairs, _opt);
            return list;
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getClosedOrders');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getClosedOrders');
            throw new Errors.GatewayError.InternalError();
        }
    }
}

/**
 * Calls _getClosedOrdersForPair multiple times
 * @param {string[]} pairs list of pairs
 * @param {boolean} opt.orderNumber used to return only a single order (optional)
 * @param {boolean} opt.completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise}
 */
 /*
 Output example

 actualPrice is (quantity * actualRate)
 finalPrice is (actualPrice +/- fees.amount)
 finalRate is (finalPrice / quantity)

 {
     "181217792":{
         "pair":"USDT-BCH",
         "orderNumber":"181217792",
         "orderType":"sell",
         "quantity":0.00001557,
         "actualPrice":0.00463986,
         "finalPrice":"0.00462826",
         "openTimestamp":null,
         "closedTimestamp":1502980611,
         "fees":{
             "amount":0.0000116,
             "currency":"BCH"
         },
         "actualRate":298,
         "finalRate":297.25497752
     },
     "2030423730":{
         "pair":"ETH-GNT",
         "orderNumber":"2030423730",
         "orderType":"buy",
         "quantity":1017.943,
         "actualPrice":2.46182388,
         "finalPrice":"2.46551661",
         "openTimestamp":null,
         "closedTimestamp":1495788784,
         "fees":{
             "amount":0.00369273,
             "currency":"ETH"
         },
         "actualRate":0.00241843,
         "finalRate":0.00242206
     }
 }
 */
async __getClosedOrders(pairs, opt)
{
    let list = {};
    if (0 == pairs.length)
    {
         return list;
     }
     let arr = [];
     _.forEach(pairs, (pair) => {
         let p = this._getClosedOrdersForPair(pair, opt.completeHistory);
         arr.push({promise:p, context:{exchange:this.__id,api:'_getClosedOrdersForPair',pair:pair}});
     });
     let data = await PromiseHelper.all(arr);
     _.forEach(data, (entry) => {
         // could not retrieve closed orders for a given pair
         if (!entry.success)
         {
             return;
         }
         _.forEach(entry.value, (order) => {
             // filter orderNumber
             if (undefined !== opt.orderNumber)
             {
                 // we're not interested in this order
                 if (opt.orderNumber != order.orderNumber)
                 {
                     return;
                 }
                 list[order.orderNumber] = order;
                 return false;
             }
             list[order.orderNumber] = order;
         });
     });
     return await this._finalizeClosedOrders(list);
}

/**
 * Retrieve closed orders for all pairs
 *
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
 /*
 Output example

 actualPrice is (quantity * actualRate)
 finalPrice is (actualPrice +/- fees.amount)
 finalRate is (finalPrice / quantity)

 {
     "181217792":{
         "pair":"USDT-BCH",
         "orderNumber":"181217792",
         "orderType":"sell",
         "quantity":0.00001557,
         "actualPrice":0.00463986,
         "finalPrice":"0.00462826",
         "openTimestamp":null,
         "closedTimestamp":1502980611,
         "fees":{
             "amount":0.0000116,
             "currency":"BCH"
         },
         "actualRate":298,
         "finalRate":297.25497752
     },
     "2030423730":{
         "pair":"ETH-GNT",
         "orderNumber":"2030423730",
         "orderType":"buy",
         "quantity":1017.943,
         "actualPrice":2.46182388,
         "finalPrice":"2.46551661",
         "openTimestamp":null,
         "closedTimestamp":1495788784,
         "fees":{
             "amount":0.00369273,
             "currency":"ETH"
         },
         "actualRate":0.00241843,
         "finalRate":0.00242206
     }
 }
 */
async _getClosedOrders(completeHistory)
{
    throw new Error('Override');
}

/**
 * Retrieve closed orders for a single pair

 * @param {string} pair pair to retrieve closed orders for
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to an object such as below
 */
 /*
 Output example

 actualPrice is (quantity * actualRate)
 finalPrice is (actualPrice +/- fees.amount)
 finalRate is (finalPrice / quantity)

 {
     "181217792":{
         "pair":"USDT-BCH",
         "orderNumber":"181217792",
         "orderType":"sell",
         "quantity":0.00001557,
         "actualPrice":0.00463986,
         "finalPrice":"0.00462826",
         "openTimestamp":null,
         "closedTimestamp":1502980611,
         "fees":{
             "amount":0.0000116,
             "currency":"BCH"
         },
         "actualRate":298,
         "finalRate":297.25497752
     }
 }
 */
async _getClosedOrdersForPair(pair, completeHistory)
{
    throw new Error('Override');
}

/**
 * Gives exchange an opportunity to do extra processing on a list of closed orders. Will be called in case exchange does not support retrieving closed orders for all pairs at once
 * @param {object} dictionary of closed orders
 * @return {Promise}
 */
async _finalizeClosedOrders(list)
{
    return Promise.resolve(list);
}

/**
 * Retrieves a single order (open or closed)
 *
 * @param {string} orderNumber
 * @param {string} pair pair (ex: USDT-NEO) (optional)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*

Output example for open order

{
    "pair":"USDT-NEO",
    "orderType":"sell",
    "orderNumber":"8Odh1Rq4N88wW3Xp8gPChq",
    "targetRate":147.5,
    "quantity":2.06,
    "openTimestamp":1517502581.466,
    "targetPrice":303.85,
    "remainingQuantity":2.06
}

Output example for open closed order

{
    "pair":"USDT-NEO",
    "orderType":"buy",
    "orderNumber":"1WrlBQXcvHioYQp4ij0wLm",
    "openTimestamp":1516224191.853,
    "quantity":5.82,
    "actualRate":144,
    "actualPrice":838.08
    "closedTimestamp":1516224650.836,
    "fees":{
        "amount":0.02954382,
        "currency":"BNB"
    }
}

*/
async getOrder(orderNumber, pair)
{
    // we can retrieve order just with the number
    if (this.__features['orders'].withoutPair)
    {
        let order;
        try
        {
            order = await this._getOrder(orderNumber);
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getOrder');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                    case 'OrderNotFound':
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getOrder');
            throw new Errors.GatewayError.InternalError();
        }
        if (undefined === pair || pair == order.pair)
        {
            return order;
        }
        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber);
    }
    if (undefined === pair)
    {
        // ensure we're allowed to identify the pair by looping through all pairs
        if (this.__requirePair)
        {
            let message = `Retrieving an order without specifying its pair is not allowed`;
            throw new Errors.GatewayError.InvalidRequest.MissingParameters('pair', message);
        }
        try
        {
            let cachedOrder = this._getCachedOrder(orderNumber);
            if (null !== cachedOrder)
            {
                pair = cachedOrder.pair;
            }
            else
            {
                pair = await this._getOrderPair(orderNumber);
            }
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'getOrder');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                    case 'OrderNotFound':
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'getOrder');
            throw new Errors.GatewayError.InternalError();
        }
        // pair was not found
        if (null === pair)
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber);
        }
    }
    // ensure pair is supported
    else
    {
        let pairs = await this.getPairsSymbols(true, {pairs:[pair]});
        // pair is not supported
        if (0 == pairs.length)
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber);
        }
    }
    try
    {
        let order = await this._getOrder(orderNumber, pair);
        let orderState = 'open';
        if (undefined === order.closedTimestamp)
        {
            orderState = 'closed';
        }
        this._cacheOrder(order.orderNumber, order.orderType, pair, orderState);
        return order;
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'getOrder');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            switch (e.ccxtErrorType)
            {
                case 'AuthenticationError':
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                case 'PermissionDenied':
                    throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                case 'OrderNotFound':
                    throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
            }
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'getOrder');
        throw new Errors.GatewayError.InternalError();
    }
}

/**
 * Used to retrieve the pair for a given order (will be called in case _getOrder cannot be called without a pair)
 *
 * @param {string} orderNumber order number
 * @return {Promise} Promise which will resolve to a string (X-Y). Result should be null if pair was not found
 */
async _getOrderPair(orderNumber)
{
    let pairs = await this.getPairsSymbols(true);
    let orderPair = await this.__getOrderPair(orderNumber, pairs);
    return orderPair;
}

/**
 * Calls _getOrder multiple times (probably very inefficient but still good as fallback)
 *
 * NB: with Kucoin, it will take =~ 11min to find the pair with a 1 req/s rate :)
 *
 * @param {string} orderNumber order number
 * @param {string[]} pairs list of pairs
 * @return {Promise}
 */
async __getOrderPair(orderNumber, pairs)
{
    let pair = null;
    if (0 == pairs.length)
    {
        return pair;
    }
    // TODO : use a bottleneck instance to send queries in batch
    let arr = [];
    _.forEach(pairs, (pair) => {
        let p = this._getOrder(orderNumber, pair);
        arr.push({promise:p, context:{exchange:this.__id,api:'_getOrder',pair:pair}});
    });
    let data = await PromiseHelper.all(arr, {logError:false});
    _.forEach(data, function (entry) {
        if (!entry.success)
        {
            if (entry.value instanceof Errors.BaseError)
            {
                // this one can be ignored
                if (entry.value instanceof Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound)
                {
                    return;
                }
            }
            else if (entry.value instanceof CcxtErrors.BaseError)
            {
                // this one can be ignored
                if ('OrderNotFound'  == entry.value.ccxtErrorType)
                {
                    return;
                }
            }
            // log unexpected errors
            let message;
            // not a BaseError
            if (entry.value instanceof Error && undefined === entry.value.errorType)
            {
                message = entry.value.message;
            }
            else
            {
                message = JSON.stringify(entry.value);
            }
            logger.error(`${JSON.stringify(entry.context)} => ${message}`);
            if (undefined !== entry.value.stack)
            {
                logger.error(entry.value.stack);
            }
            return;
        }
        pair = entry.value.pair;
        return false;
    });
    return pair;
}

/**
 * Retrieves a single order (open or closed)
 *
 * @param {string} orderNumber
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*

Output example for open order

{
    "pair":"USDT-NEO",
    "orderType":"sell",
    "orderNumber":"8Odh1Rq4N88wW3Xp8gPChq",
    "targetRate":147.5,
    "quantity":2.06,
    "openTimestamp":1517502581.466,
    "targetPrice":303.85,
    "remainingQuantity":2.06
}

Output example for closed order

{
    "pair":"USDT-NEO",
    "orderType":"buy",
    "orderNumber":"1WrlBQXcvHioYQp4ij0wLm",
    "openTimestamp":1516224191.853,
    "quantity":5.82,
    "actualRate":144,
    "actualPrice":838.08
    "closedTimestamp":1516224650.836,
    "fees":{
        "amount":0.02954382,
        "currency":"BNB"
    }
}

*/
async _getOrder(orderNumber, pair)
{
    throw new Error('Override');
}

/**
 * Creates a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to buy/sell
 * @param {float} targetRate expected buy/sell price
 * @param {float} quantity quantity to buy/sell
 * @return {Promise} Promise which will resolve to the number of the new order
 */
async createOrder(orderType, pair, targetRate, quantity)
{
    try
    {
        return await this._createOrder(orderType, pair, targetRate, quantity);
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'createOrder');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            switch (e.ccxtErrorType)
            {
                case 'AuthenticationError':
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                case 'PermissionDenied':
                    throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                case 'InsufficientFunds':
                    throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InsufficientFunds(this.__id, pair, targetRate, quantity, e);
                case 'InvalidOrder':
                    throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.UnknownError(this.__id, pair, targetRate, quantity, e);
            }
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'createOrder');
        throw new Errors.GatewayError.InternalError();
    }
}

/**
 * Creates a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to buy/sell
 * @param {float} targetRate expected buy/sell price
 * @param {float} quantity quantity to buy/sell
 * @return {Promise} Promise which will resolve to the number of the new order
 */
async _createOrder(orderType, pair, targetRate, quantity)
{
    throw new Error('Override');
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (optional)
 * @return {Promise} Promise which will resolve to true in case of success
 */
async cancelOrder(orderNumber, pair)
{
    // we can retrieve order just with the number
    if (this.__features['orders'].withoutPair)
    {
        try
        {
            return await this._cancelOrder(orderNumber);
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'cancelOrder');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                    case 'OrderNotFound':
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
                    case 'CancelPending':
                        return true;
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
            }
            this.__logError(e, 'cancelOrder');
            throw new Errors.GatewayError.InternalError();
        }
    }
    if (undefined === pair)
    {
        // ensure we're allowed to identify the pair by looping through all pairs
        if (this.__requirePair)
        {
            let message = `Cancelling an order without specifying its pair is not allowed`;
            throw new Errors.GatewayError.InvalidRequest.MissingParameters('pair', message);
        }
        try
        {
            let cachedOrder = this._getCachedOrder(orderNumber);
            if (null !== cachedOrder)
            {
                pair = cachedOrder.pair;
            }
            else
            {
                pair = await this._getOrderPair(orderNumber);
            }
        }
        catch (e)
        {
            if (e instanceof Errors.BaseError)
            {
                throw e;
            }
            if (this._isNetworkError(e))
            {
                this.__logNetworkError(e, 'cancelOrder');
                if (this._isTimeoutError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
                }
                if (this._isDDosProtectionError(e))
                {
                    throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
                }
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
            }
            if (e instanceof CcxtErrors.BaseError)
            {
                switch (e.ccxtErrorType)
                {
                    case 'AuthenticationError':
                        throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                    case 'PermissionDenied':
                        throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                    case 'OrderNotFound':
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
                    case 'CancelPending':
                        return true;
                }
            }
            this.__logError(e, 'cancelOrder');
            throw new Errors.GatewayError.InternalError();
        }
        // pair was not found
        if (null === pair)
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber);
        }
    }
    try
    {
        return await this._cancelOrder(orderNumber, pair);
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'cancelOrder');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            switch (e.ccxtErrorType)
            {
                case 'AuthenticationError':
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                case 'PermissionDenied':
                    throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
                case 'OrderNotFound':
                    throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.__id, orderNumber, e);
                case 'CancelPending':
                    return true;
            }
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'cancelOrder');
        throw new Errors.GatewayError.InternalError();
    }
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @return {Promise} Promise which will resolve to true in case of success
 */
async _cancelOrder(orderNumber, pair)
{
    throw new Error('Override');
}

//-- balances methods

/**
 * Return balances for a list of currencies
 *
 * @param {string[]} currencies array of currencies to retrieve balances for. If undefined or empty, balances for all currencies will be retrieved
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "BTC":{
        "currency":"BTC",
        "total":0.07394381,
        "available":0.07394381,
        "onOrders":0
    },
    "NEO":{
        "currency":"NEO",
        "total":5.70415443,
        "available":5.70415443,
        "onOrders":0
    },...
}

*/
async getBalances(currencies)
{
    if (undefined === currencies)
    {
        currencies = [];
    }
    let data;
    try
    {
        data = await this._getBalances();
    }
    catch (e)
    {
        if (e instanceof Errors.BaseError)
        {
            throw e;
        }
        if (this._isNetworkError(e))
        {
            this.__logNetworkError(e, 'getBalances');
            if (this._isTimeoutError(e))
            {
                throw new Errors.ExchangeError.NetworkError.RequestTimeout(this.__id, e);
            }
            if (this._isDDosProtectionError(e))
            {
                throw new Errors.ExchangeError.NetworkError.DDosProtection(this.__id, e);
            }
            throw new Errors.ExchangeError.NetworkError.UnknownError(this.__id, e);
        }
        if (e instanceof CcxtErrors.BaseError)
        {
            switch (e.ccxtErrorType)
            {
                case 'AuthenticationError':
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.__id, e);
                case 'PermissionDenied':
                    throw new Errors.ExchangeError.Forbidden.PermissionDenied(this.__id, e);
            }
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.__id, e);
        }
        this.__logError(e, 'getBalances');
        throw new Errors.GatewayError.InternalError();
    }
    if (0 == currencies.length)
    {
        return data;
    }
    // filter currencies
    let list = {};
    for (let i = 0; i < currencies.length; ++i)
    {
        if (undefined !== data[currencies[i]])
        {
            list[currencies[i]] = data[currencies[i]];
        }
    }
    return list;
}

/**
 * Return balances for all currencies (currencies with balance = 0 should be filtered out)
 *
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "BTC":{
        "currency":"BTC",
        "total":0.07394381,
        "available":0.07394381,
        "onOrders":0
    },
    "NEO":{
        "currency":"NEO",
        "total":5.70415443,
        "available":5.70415443,
        "onOrders":0
    },...
}

*/
async _getBalances()
{
    throw new Error('Override');
}

}

module.exports = AbstractExchange;
