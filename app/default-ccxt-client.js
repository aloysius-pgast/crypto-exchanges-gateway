"use strict";
const ccxt = require('ccxt');
const logger = require('winston');
const _ = require('lodash');
const Big = require('big.js');
const CcxtErrors = require('./ccxt-errors');

const precisionToStep = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001, 0.0000001, 0.00000001];

/*

Default client for CCXT exchanges. Handles custom formatting

Each method will return an object such as below

{
    // output returned by ccxt
    ccxt:{},
    // formatted output (gateway format)
    custom:{}
}

When an error is triggered by ccxt, a CcxtErrors.BaseError will be thrown

*/

const klinesIntervalsMapping = {
    '1m':60, '3m':180, '5m':300, '15m':900, '30m':1800,
    '1h':3600, '2h':7200, '4h':14400, '6h':21600, '8h':28800, '12h':43200,
    '1d':86400, '3d':259200,
    '1w':604800,
    '1M':2592000
}

class DefaultCcxtClient
{

/**
 * @param {string} ccxtExchangeId ccxt exchange id
 * @param {object} ccxtExchangeOpt ccxt options
 */
constructor(ccxtExchangeId, ccxtExchangeOpt)
{
    this.ccxt = new ccxt[ccxtExchangeId](ccxtExchangeOpt);
    // disable pair substitution
    this.ccxt.substituteCommonCurrencyCodes = false;
    this._redefineCcxtErrorHandlers();
}

_redefineCcxtErrorHandlers()
{
    let self = this;
    // redefine market
    this.ccxt._market = this.ccxt.market;
    this.ccxt.market = (symbol) => {
        try
        {
            return self.ccxt._market.call(self.ccxt, symbol);
        }
        catch (e)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
    };

    // redefine executeRestRequest
    this.ccxt._executeRestRequest = this.ccxt.executeRestRequest;
    this.ccxt.executeRestRequest = (url, method = 'GET', headers = undefined, body = undefined) => {
        return new Promise((resolve, reject) => {
            self.ccxt._executeRestRequest.call(self.ccxt, url, method, headers, body).then((data) => {
                return resolve(data);
            }).catch ((e) => {
                if (e instanceof CcxtErrors.BaseError)
                {
                    return reject(e);
                }
                return reject(new CcxtErrors.BaseError(e, {method:method,url:url}, undefined, undefined));
            });
        });
    };
    // redefine parseJson
    this.ccxt._parseJson = this.ccxt.parseJson;
    this.ccxt.parseJson = (response, responseBody, url, method) => {
        try
        {
            return self.ccxt._parseJson.call(self.ccxt, response, responseBody, url, method);
        }
        catch (e)
        {
            throw new CcxtErrors.BaseError(e, {method:method,url:url}, {statusCode:response.status,statusMessage:response.statusText,body:responseBody}, undefined);
        }
    };
    // redefine default error handler
    this.ccxt._defaultErrorHandler = this.ccxt.defaultErrorHandler;
    this.ccxt.defaultErrorHandler = (response, responseBody, url, method) => {
        try
        {
            return self.ccxt._defaultErrorHandler.call(self.ccxt, response, responseBody, url, method);
        }
        catch (e)
        {
            throw new CcxtErrors.BaseError(e, {method:method,url:url}, {statusCode:response.status,statusMessage:response.statusText,body:responseBody}, self.ccxt.last_json_response);
        }
    };
    // redefine custom error handler
    this.ccxt._handleErrors = this.ccxt.handleErrors;
    this.ccxt.handleErrors = (statusCode, statusMessage, url, method, requestHeaders, responseBody, json) => {
        try
        {
            return self.ccxt._handleErrors.call(self.ccxt, statusCode, statusMessage, url, method, requestHeaders, responseBody, json);
        }
        catch (e)
        {
            throw new CcxtErrors.BaseError(e, {method:method,url:url}, {statusCode:statusCode,statusMessage:statusMessage,body:responseBody}, json);
        }
    };
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

/**
 * Returns the duration (in sec) of a given klines interval
 * @param {string} interval klines interval
 * @return {integer} duration in sec
 */
_getKlinesIntervalDuration(interval)
{
    return klinesIntervalsMapping[interval];
}

/**
 * Convert pair from ccxt format Y/X to custom format X-Y
 *
 * @param {string} pair pair in ccxt format (Y/X)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let arr = pair.split('/');
    return arr[1] + '-' + arr[0];
}

/**
 * Convert pair from custom format X-Y to exchange format X-Y
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (Y/X)
 */
_toCcxtPair(pair)
{
    let arr = pair.split('-');
    return arr[1] + '/' + arr[0];
}

/**
 * Returns all active pairs
 *
 * @return {ccxt:object[],custom:object}
 */
/*
ccxt output example for loadMarkets

[
    {
        "id":"BTC-USDT",
        "symbol":"BTC/USDT",
        "base":"BTC",
        "quote":"USDT",
        "active":true,
        "taker":0.001,
        "maker":0.001,
        "info":{
            "coinType":"BTC",
            "trading":true,
            "symbol":"BTC-USDT",
            "lastDealPrice":8460,
            "buy":8460,
            "sell":8493.004404,
            "change":-50,
            "coinTypePair":"USDT",
            "sort":100,
            "feeRate":0.001,
            "volValue":1224262.33506258,
            "high":8590.275105,
            "datetime":1526902906000,
            "vol":144.136347,
            "low":8296.830001,
            "changeRate":-0.0059
        },
        "lot":1e-8,
        "precision":{
            "amount":8,
            "price":8
        },
        "limits":{
            "amount":{
                "min":1e-8
            },
            "price":{

            }
        }
    },
    {
        "id":"ETH-BTC",
        "symbol":"ETH/BTC",
        "base":"ETH",
        "quote":"BTC",
        "active":true,
        "taker":0.001,
        "maker":0.001,
        "info":{
            "coinType":"ETH",
            "trading":true,
            "symbol":"ETH-BTC",
            "lastDealPrice":0.08384883,
            "buy":0.08384883,
            "sell":0.08399669,
            "change":-0.00011118,
            "coinTypePair":"BTC",
            "sort":100,
            "feeRate":0.001,
            "volValue":236.60571194,
            "high":0.0857787,
            "datetime":1526902906000,
            "vol":2802.3795454,
            "low":0.08341012,
            "changeRate":-0.0013
        },
        "lot":1e-8,
        "precision":{
            "amount":8,
            "price":8
        },
        "limits":{
            "amount":{
                "min":1e-8
            },
            "price":{

            }
        }
    }
]

*/
async getPairs()
{
    let data;
    try
    {
        data = await this.ccxt.loadMarkets(true);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data, custom:this.formatPairs(data)};
}

/**
 * Formats a list of pairs result returned by ccxt
 *
 * @param {object[]} ccxtData list of pairs returned by ccxt loadMarkets
 * @return {object}
 */
formatPairs(ccxtData)
{
    let result = {};
    _.forEach(ccxtData, (e) => {
        // ignore non-active pairs
        if (!e.active)
        {
            return;
        }
        let pair = this._toCustomPair(e.symbol);
        result[pair] = this.formatPair(pair, e);
    });
    return result;
}

/**
 * Formats a single of pair returned by ccxt
 *
 * @param {string} pair pair in custom format
 * @param {object} ccxtData single pair entry returned by ccxt loadMarkets
 * @return {object}
 */
formatPair(pair, ccxtData)
{
    let limits = this._getDefaultLimits();
    //-- update precision & step
    if (undefined !== ccxtData.precision)
    {
        // rate
        if (undefined !== ccxtData.precision.price)
        {
            limits.rate.precision = ccxtData.precision.price;
            limits.rate.step = this._precisionToStep(limits.rate.precision);
        }
        // quantity
        if (undefined !== ccxtData.precision.amount)
        {
            limits.quantity.precision = ccxtData.precision.amount;
            limits.quantity.step = this._precisionToStep(limits.quantity.precision);
        }
    }
    //-- update min/max
    if (undefined !== ccxtData.limits)
    {
        // rate
        if (undefined !== ccxtData.limits.price)
        {
            if (undefined !== ccxtData.limits.price.min)
            {
                limits.rate.min = ccxtData.limits.price.min;
            }
            if (undefined !== ccxtData.limits.price.max)
            {
                limits.rate.max = ccxtData.limits.price.max;
            }
        }
        // quantity
        if (undefined !== ccxtData.limits.amount)
        {
            if (undefined !== ccxtData.limits.amount.min)
            {
                limits.quantity.min = ccxtData.limits.amount.min;
            }
            if (undefined !== ccxtData.limits.amount.max)
            {
                limits.quantity.max = ccxtData.limits.amount.max;
            }
        }
        // price
        if (undefined !== ccxtData.limits.cost)
        {
            if (undefined !== ccxtData.limits.cost.min)
            {
                // convert to fixed to avoid pb such as 0.001 * 0.0001 => 1.0000000000000001e-7
                limits.price.min = parseFloat(ccxtData.limits.cost.min.toFixed(8));
                if (limits.price.min < 0.00000001)
                {
                    limits.price.min = 0.00000001;
                }
            }
            if (undefined !== ccxtData.limits.cost.max)
            {
                limits.price.max = ccxtData.limits.cost.max;
            }
        }
    }
    return {
        pair:pair,
        baseCurrency:ccxtData.quote,
        currency:ccxtData.base,
        limits:limits
    }
}

/**
 * Retrieve tickers for all pairs
 *
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object}
 */
/*
ccxt output example for fetchTickers

{
    "BTC/USDT":{
        "symbol":"BTC/USDT",
        "timestamp":1526907160000,
        "datetime":"2018-05-21T12:52:40.000Z",
        "high":8590.275105,
        "low":8300,
        "bid":8489.698,
        "ask":8508,
        "open":8510,
        "close":8489.698,
        "last":8489.698,
        "change":-20.302,
        "percentage":-0.0024,
        "baseVolume":146.98216467,
        "quoteVolume":1248775.44123063,
        "info":{
            "coinType":"BTC",
            "trading":true,
            "symbol":"BTC-USDT",
            "lastDealPrice":8489.698,
            "buy":8489.698,
            "sell":8508,
            "change":-20.302,
            "coinTypePair":"USDT",
            "sort":100,
            "feeRate":0.001,
            "volValue":1248775.44123063,
            "high":8590.275105,
            "datetime":1526907160000,
            "vol":146.98216467,
            "low":8300,
            "changeRate":-0.0024
        }
    },
    "ETH/BTC":{
        "symbol":"ETH/BTC",
        "timestamp":1526907160000,
        "datetime":"2018-05-21T12:52:40.000Z",
        "high":0.08574385,
        "low":0.08337457,
        "bid":0.083443,
        "ask":0.083731,
        "open":0.08396001,
        "close":0.083729,
        "last":0.083729,
        "change":-0.00023101,
        "percentage":-0.0028,
        "baseVolume":3018.9296003,
        "quoteVolume":254.63643405,
        "info":{
            "coinType":"ETH",
            "trading":true,
            "symbol":"ETH-BTC",
            "lastDealPrice":0.083729,
            "buy":0.083443,
            "sell":0.083731,
            "change":-0.00023101,
            "coinTypePair":"BTC",
            "sort":100,
            "feeRate":0.001,
            "volValue":254.63643405,
            "high":0.08574385,
            "datetime":1526907160000,
            "vol":3018.9296003,
            "low":0.08337457,
            "changeRate":-0.0028
        }
    }
}

*/
async getTickers(ccxtParams)
{
    let data;
    try
    {
        data = await this.ccxt.fetchTickers(undefined, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatTickers(data)};
}

/**
 * Retrieve ticker for a single pair
 *
 * @param {string} pair pair to retrieve ticker for
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object}
 */
/*
ccxt output example for fetchTicker

{
    "symbol":"NEO/BTC",
    "timestamp":1528736548000,
    "datetime":"2018-06-11T17:02:28.000Z",
    "high":0.00686581,
    "low":0.00644451,
    "bid":0.00650061,
    "ask":0.00651218,
    "close":0.0065033,
    "last":0.0065033,
    "baseVolume":123005.01657,
    "info":{
        "high":"0.00686581",
        "vol":"123005.01657000",
        "last":"0.00650330",
        "low":"0.00644451",
        "buy":"0.00650061",
        "sell":"0.00651218",
        "timestamp":1528736548000
    }
}

*/
async getTicker(pair, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.fetchTicker(ccxtPair, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatTicker(pair, data)};
}

/**
 * Formats tickers list returned by ccxt
 *
 * @param {object[]} ccxtData list of tickers returned by ccxt fetchTickers
 * @return {object}
 */
formatTickers(ccxtData)
{
    let result = {};
    _.forEach(ccxtData, (e) => {
        let pair = this._toCustomPair(e.symbol);
        result[pair] = this.formatTicker(pair, e);
    });
    return result;
}

/**
 * Formats a single ticker entry returned by ccxt
 *
 * @param {string} pair pair in custom format
 * @param {object} ccxtData ticker entry returned by ccxt fetchTickers
 * @return {object}
 */
formatTicker(pair, ccxtData)
{
    let priceChangePercent = null;
    if (undefined !== ccxtData.percentage)
    {
        priceChangePercent = 100 * ccxtData.percentage;
    }
    return {
        pair:pair,
        last:undefined === ccxtData.last ? null : ccxtData.last,
        sell:undefined === ccxtData.ask ? null : ccxtData.ask ,
        buy:undefined === ccxtData.bid ? null : ccxtData.bid,
        high:undefined === ccxtData.high ? null : ccxtData.high,
        low:undefined === ccxtData.low ? null : ccxtData.low,
        volume:ccxtData.baseVolume,
        priceChangePercent:priceChangePercent,
        timestamp:ccxtData.timestamp / 1000.0
    }
}

/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object,custom:object}
 */
 /*
 ccxt output example

 {
    "bids":[
        [
            8465,
            0.00007027
        ],
        [
            8448.000233,
            0.14250619
        ],...
    ],
    "asks":[
        [
            8487.99711,
            0.0713537
        ],
        [
            8499.99,
            0.52504393
        ],...
    ],
    "timestamp":1526911480103,
    "datetime":"2018-05-21T14:04:40.103Z"
}
 */
async getOrderBook(pair, limit, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.fetchOrderBook(ccxtPair, limit, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatOrderBook(data)};
}

/**
 * Formats order book returned by ccxt
 *
 * @param {object} ccxtData order book returned by ccxt fetchOrderBook
 * @return {object}
 */
formatOrderBook(ccxtData)
{
    let result = {
        buy:_.map(ccxtData.bids, (entry) => {
            return {
                rate:entry[0],
                quantity:entry[1]
            }
        }),
        sell:_.map(ccxtData.asks, (entry) => {
            return {
                rate:entry[0],
                quantity:entry[1]
            }
        })
    }
    return result;
}

/**
 * Returns last trades
 *
 * @param {string} pair pair to retrieve trades for
 * @param {integer} limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object[]}
 */
 /*
 ccxt output example

 [
     {
         "info":[
             1526913526000,
             "SELL",
             8386.346645,
             0.00328233,
             27.52675718
         ],
         "timestamp":1526913526000,
         "datetime":"2018-05-21T14:38:46.000Z",
         "symbol":"BTC/USDT",
         "type":"limit",
         "side":"sell",
         "price":8386.346645,
         "amount":0.00328233
     },
     {
         "info":[
             1526913528000,
             "BUY",
             8386.346645,
             0.00984699,
             82.58027155
         ],
         "timestamp":1526913528000,
         "datetime":"2018-05-21T14:38:48.000Z",
         "symbol":"BTC/USDT",
         "type":"limit",
         "side":"buy",
         "price":8386.346645,
         "amount":0.00984699
     },...
 ]

*/
async getTrades(pair, limit, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.fetchTrades(ccxtPair, undefined, limit, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatTrades(data)};
}

/**
 * Format trades returned by ccxt
 *
 * @param {object[]} ccxtData list of trades returned by ccxt fetchTrades
 * @return {object}
 */
formatTrades(ccxtData)
{
    let result = [];
    // ccxt returns the oldest trade first
    _.forEach(ccxtData, (e) => {
        let trade = {
            id:e.id,
            timestamp:e.timestamp / 1000.0,
            orderType:e.side,
            quantity:e.amount,
            rate:e.price
        };
        trade.price = parseFloat(new Big(trade.quantity).times(trade.rate).toFixed(8));
        // some exchanges do not assign any trade id (Kucoin for example)
        if (undefined === trade.id)
        {
            trade.id = null;
        }
        result.unshift(trade);
    });
    return result;
}

/**
 * Returns charts data
 *
 * @param {string} pair pair to retrieve chart data for
 * @param {string} interval charts interval
 * @param {integer} fromTimestamp unix timestamp in seconds
 * @param {integer} toTimestamp unix timestamp in seconds
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object[]}
 */
/*
ccxt output example

[
    [
        1526822400000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526822700000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526823000000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526823300000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526823600000,
        59.99002,
        59.99003,
        59.99002,
        59.99003,
        4.12389
    ],
    [
        1526823900000,
        60.629473,
        60.629473,
        59.910011,
        59.910011,
        0.510837
    ],
    [
        1526824200000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526824500000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526824800000,
        null,
        null,
        null,
        null,
        0
    ],
    [
        1526825100000,
        null,
        null,
        null,
        null,
        0
    ]
]

*/
async getKlines(pair, interval, fromTimestamp, toTimestamp, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let intervalDuration = this._getKlinesIntervalDuration(interval);
    // ccxt is expecting a number of klines points
    let count = Math.ceil((toTimestamp - fromTimestamp) / intervalDuration);
    let data;
    try
    {
        data = await this.ccxt.fetchOHLCV(ccxtPair, interval, fromTimestamp * 1000, count, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatKlines(data)};
}

/**
 * Format klines returned by ccxt
 *
 * @param {object[]} ccxtData list of klines returned by ccxt fetchOHLCV
 * @return {object[]}
 */
formatKlines(ccxtData)
{
    let result = [];
    _.forEach(ccxtData, (e) => {
        result.push({
            timestamp:Math.floor(e[0] / 1000.0),
            open:null === e[1] ? null : parseFloat(e[1]),
            high:null === e[2] ? null : parseFloat(e[2]),
            low:null === e[3] ? null : parseFloat(e[3]),
            close:null === e[4] ? null : parseFloat(e[4]),
            volume:parseFloat(e[5])
        });
    });
    return result;
}

/**
 * Retrieve open orders for a single pair

 * @param {string} pair pair to retrieve open orders for
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object}
 */
/*
ccxt output for fetchOpenOrders

[
    {
        "id":"5b043105f773770d72d28ea4",
        "timestamp":1527001350000,
        "datetime":"2018-05-22T15:02:30.000Z",
        "symbol":"GAS/BTC",
        "type":"limit",
        "side":"sell",
        "price":0.1,
        "amount":0.1,
        "cost":0.010000000000000002,
        "filled":0,
        "remaining":0.1,
        "status":"open",
        "fee":{
            "currency":"BTC"
        }
    },...
]

*/
async getOpenOrdersForPair(pair, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.fetchOpenOrders(ccxtPair, undefined, undefined, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatOpenOrders(data)};
}

/**
 * Formats a list of open order returned by ccxt
 *
 * @param {object[]} ccxtData list of open orders returned by ccxt fetchOpenOrders
 * @return {object}
 */
formatOpenOrders(ccxtData)
{
    let result = {};
    _.forEach(ccxtData, (e) => {
        let order = this.formatOpenOrder(e);
        result[order.orderNumber] = order;
    });
    return result;
}

/**
 * Formats a single open order returned by ccxt
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {object}
 */
formatOpenOrder(ccxtData)
{
    let splittedPair = ccxtData.symbol.split('/');
    let order = {
        pair:`${splittedPair[1]}-${splittedPair[0]}`,
        orderNumber:ccxtData.id,
        openTimestamp:ccxtData.timestamp / 1000.0,
        orderType:ccxtData.side,
        quantity:ccxtData.amount,
        remainingQuantity:ccxtData.remaining,
        targetRate:ccxtData.price
    };
    order.targetPrice = parseFloat(new Big(order.targetRate).times(order.quantity).toFixed(8));
    return order;
}

/**
 * Retrieve closed orders for a single pair

 * @param {string} pair pair to retrieve closed orders for
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object}
 */
/*
ccxt output for fetchClosedOrders

[
    {
        "id":"5b0430f0f773770f4aa46b3a",
        "timestamp":1527001329000,
        "datetime":"2018-05-22T15:02:09.000Z",
        "symbol":"GAS/BTC",
        "type":"limit",
        "side":"sell",
        "price":0.00268962,
        "amount":0.1,
        "cost":0.00026896,
        "filled":0.1,
        "remaining":0,
        "status":"closed",
        "fee":{
            "cost":2.7e-7,
            "rate":0.001,
            "currency":"BTC"
        }
    }
]

*/
async getClosedOrdersForPair(pair, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.fetchClosedOrders(ccxtPair, undefined, undefined, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    return {ccxt:data,custom:this.formatClosedOrders(data)};
}

/**
 * Formats a list of open order returned by ccxt
 *
 * @param {object[]} ccxtData list of open orders returned by ccxt fetchClosedOrders
 * @return {object}
 */
formatClosedOrders(ccxtData)
{
    let result = {};
    _.forEach(ccxtData, (e) => {
        let order = this.formatClosedOrder(e);
        result[order.orderNumber] = order;
    });
    return result;
}

/**
 * Formats a single open order returned by ccxt
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {object}
 */
formatClosedOrder(ccxtData)
{
    let splittedPair = ccxtData.symbol.split('/');
    let order = {
        pair:`${splittedPair[1]}-${splittedPair[0]}`,
        orderNumber:ccxtData.id,
        closedTimestamp:ccxtData.timestamp / 1000.0,
        orderType:ccxtData.side,
        quantity:ccxtData.filled,
        actualRate:this.getActualRate(ccxtData),
        actualPrice:0,
        finalRate:null,
        finalPrice:null,
        fees:null
    };
    if (undefined !== ccxtData.lastTradeTimestamp)
    {
        order.closedTimestamp = ccxtData.lastTradeTimestamp / 1000.0;
    }
    // compute fees, rate & price
    if (0 != order.quantity)
    {
        order.actualPrice = this.getActualPrice(ccxtData);
        if (undefined !== ccxtData.fee)
        {
            order.fees = {
                amount:ccxtData.fee.cost,
                currency:ccxtData.fee.currency
            }
            // only compute order.finalPrice & order.finalRate if fees.currency != from baseCurrency (otherwise use order.actualPrice & order.actualRate)
            if (splittedPair[1] != order.fees.currency)
            {
                order.finalPrice = order.actualPrice;
                order.finalRate = order.actualRate;
            }
            else
            {
                let finalPrice;
                if ('buy' == order.orderType)
                {
                    finalPrice =  new Big(order.actualPrice).plus(order.fees.amount);
                }
                else
                {
                    finalPrice =  new Big(order.actualPrice).minus(order.fees.amount);
                }
                order.finalPrice = parseFloat(finalPrice.toFixed(8));
                order.finalRate = parseFloat(finalPrice.div(order.quantity).toFixed(8));
            }
        }
    }
    return order;
}

/**
 * Extract actual rate from ccxt data
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {float}
 */
getActualRate(ccxtData)
{
    if (undefined !== ccxtData.price)
    {
        return ccxtData.price;
    }
    return null;
}

/**
 * Extract actual price from ccxt data
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {float}
 */
getActualPrice(ccxtData)
{
    return ccxtData.cost;
}


/**
 * Retrieves a single order (open or closed)
 *
 * @param {string} orderNumber
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object,custom:object}
 */
/*

ccxt output for fetchOrder

Closed order
-----------

{
    "info":{
        "coinType":"GAS",
        "dealValueTotal":0.00026896,
        "feeTotal":2.7e-7,
        "userOid":"5a54cb07130e183273bd96ec",
        "dealAmount":0.1,
        "coinTypePair":"BTC",
        "type":"SELL",
        "orderOid":"5b0430f0f773770f4aa46b3a",
        "createdAt":1527001329000,
        "dealOrders":{
            "total":1,
            "firstPage":true,
            "lastPage":false,
            "datas":[
                {
                    "createdAt":1527001329000,
                    "amount":0.1,
                    "dealValue":0.00026896,
                    "fee":2.7e-7,
                    "dealPrice":0.00268962,
                    "feeRate":0.001
                }
            ],
            "currPageNo":1,
            "limit":20,
            "pageNos":1
        },
        "dealPriceAverage":0.0026896,
        "orderPrice":0.00268761,
        "pendingAmount":0
    },
    "id":"5b0430f0f773770f4aa46b3a",
    "timestamp":1527001329000,
    "datetime":"2018-05-22T15:02:09.000Z",
    "symbol":"GAS/BTC",
    "type":"limit",
    "side":"sell",
    "price":0.0026896,
    "amount":0.1,
    "cost":0.00026896,
    "filled":0.1,
    "remaining":0,
    "status":"closed",
    "fee":{
        "cost":2.7e-7,
        "currency":"BTC"
    },
    "trades":[
        {
            "order":"5b0430f0f773770f4aa46b3a",
            "info":{
                "createdAt":1527001329000,
                "amount":0.1,
                "dealValue":0.00026896,
                "fee":2.7e-7,
                "dealPrice":0.00268962,
                "feeRate":0.001
            },
            "timestamp":1527001329000,
            "datetime":"2018-05-22T15:02:09.000Z",
            "symbol":"GAS/BTC",
            "side":"sell",
            "price":0.00268962,
            "cost":0.00026896,
            "amount":0.1,
            "fee":{
                "cost":2.7e-7,
                "currency":"GAS"
            }
        }
    ]
}

Open order
----------

{
    "info":{
        "coinType":"GAS",
        "dealValueTotal":0,
        "feeTotal":0,
        "userOid":"5a54cb07130e183273bd96ec",
        "dealAmount":0,
        "coinTypePair":"BTC",
        "type":"SELL",
        "orderOid":"5b0bd23cf77377090d13bdf2",
        "createdAt":1527501373000,
        "dealOrders":{
            "total":0,
            "firstPage":true,
            "lastPage":false,
            "datas":[

            ],
            "currPageNo":1,
            "limit":20,
            "pageNos":1
        },
        "dealPriceAverage":0,
        "orderPrice":0.00924542,
        "pendingAmount":0.5
    },
    "id":"5b0bd23cf77377090d13bdf2",
    "timestamp":1527501373000,
    "datetime":"2018-05-28T09:56:13.000Z",
    "symbol":"GAS/BTC",
    "type":"limit",
    "side":"sell",
    "price":0.00924542,
    "amount":0.5,
    "cost":0.00462271,
    "filled":0,
    "remaining":0.5,
    "status":"open",
    "fee":{
        "cost":0,
        "currency":"BTC"
    },
    "trades":[

    ]
}

*/
async getOrder(orderNumber, pair, ccxtParams)
{
    let ccxtPair;
    if (undefined !== pair)
    {
        ccxtPair = this._toCcxtPair(pair);
    }
    let data;
    try
    {
        data = await this.ccxt.fetchOrder(orderNumber, ccxtPair, ccxtParams);
    }
    catch (e)
    {
        if (e instanceof ccxt.BaseError)
        {
            throw new CcxtErrors.BaseError(e, undefined, undefined, undefined);
        }
        throw e;
    }
    // order is still open
    if (data.hasOwnProperty('remaining'))
    {
        return {ccxt:data,custom:this.formatOpenOrder(data)};
    }
    // this is a closed order
    return {ccxt:data,custom:this.formatClosedOrder(data)};
}

/**
 * Creates a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to buy/sell
 * @param {float} targetRate expected buy/sell price
 * @param {float} quantity quantity to buy/sell
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object,custom:object}
 */
/*

ccxt output for createOrder

{
    "info":{
        "success":true,
        "code":"OK",
        "msg":"OK",
        "timestamp":1527504951508,
        "data":{
            "orderOid":"5b0be037f7737741ee125577"
        }
    },
    "id":"5b0be037f7737741ee125577",
    "timestamp":1527504951508,
    "datetime":"2018-05-28T10:55:51.508Z",
    "symbol":"GAS/BTC",
    "type":"limit",
    "side":"sell",
    "amount":0.1,
    "price":0.00924542,
    "cost":0.0009245420000000001,
    "status":"open"
}

*/
async createOrder(orderType, pair, targetRate, quantity, ccxtParams)
{
    let ccxtPair = this._toCcxtPair(pair);
    let data;
    try
    {
        data = await this.ccxt.createOrder(ccxtPair, 'limit', orderType, quantity, targetRate, ccxtParams);
    }
    catch (e)
    {
        throw e;
    }
    return {ccxt:data,custom:this.formatNewOrder(data)};
}

/**
 * Formats a new order returned by ccxt
 *
 * @param {object} ccxtData new order returned by ccxt createOrder
 * @return {object} {orderNumber:string}
 */
formatNewOrder(ccxtData)
{
    return {orderNumber:ccxtData.id};
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object,custom:object}
 */
/*

ccxt output for cancelOrder : none as ccxt classed will return the raw output from exchange

*/
async cancelOrder(orderNumber, pair, ccxtParams)
{
    let ccxtPair;
    if (undefined !== pair)
    {
        ccxtPair = this._toCcxtPair(pair);
    }
    let data;
    try
    {
        data = await this.ccxt.cancelOrder(orderNumber, ccxtPair, ccxtParams);
    }
    catch (e)
    {
        throw e;
    }
    // we don't have any custom info to add
    return {ccxt:data,custom:{}};
}

/**
 * Return balances for all currencies (currencies with balance = 0 should be filtered out)
 *
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object,custom:object}
 */
/*
ccxt output example for fetchBalances

{
    "info":[
        {
            "coinType":"KCS",
            "balanceStr":"0.0",
            "freezeBalance":0,
            "balance":0,
            "freezeBalanceStr":"0.0"
        },
        {
            "coinType":"ETH",
            "balanceStr":"0.0",
            "freezeBalance":0,
            "balance":0,
            "freezeBalanceStr":"0.0"
        },
        {
            "coinType":"GAS",
            "balanceStr":"1.90343399",
            "freezeBalance":0.5,
            "balance":1.90343399,
            "freezeBalanceStr":"0.5"
        }
    ],
    "KCS":{
        "free":0,
        "used":0,
        "total":0
    },
    "ETH":{
        "free":0,
        "used":0,
        "total":0
    },
    "GAS":{
        "free":1.90343399,
        "used":0.5,
        "total":2.40343399
    },
    "free":{
        "KCS":0,
        "ETH":0,
        "GAS":1.90343399
    },
    "used":{
        "KCS":0,
        "ETH":0,
        "GAS":0.5
    },
    "total":{
        "KCS":0,
        "ETH":0,
        "GAS":2.40343399
    }
}
*/
async getBalances(ccxtParams)
{
    let data;
    try
    {
        data = await this.ccxt.fetchBalance(ccxtParams);
    }
    catch (e)
    {
        throw e;
    }
    return {ccxt:data,custom:this.formatBalances(data)};
}

/**
 * Formats balances returned by ccxt
 *
 * @param {object} ccxtData result returned by ccxt fetchBalance (currencies with balance = 0 should be filtered out)
 * @return {object}
 */
formatBalances(ccxtData)
{
    let result = {};
    _.forEach(ccxtData.total, (balance, currency) => {
        if (0 == balance)
        {
            return;
        }
        result[currency] = this.formatBalance(currency, ccxtData[currency]);
    });
    return result;
}

/**
 * Formats a single balance entry returned by ccxt
 *
 * @param {object} ccxtData currency entry returned by ccxt fetchBalance
 * @return {object}
 */
formatBalance(currency, ccxtData)
{
    return {
        currency:currency,
        total:ccxtData.total,
        available:ccxtData.free,
        onOrders:ccxtData.used
    }
}

}

module.exports = DefaultCcxtClient;
