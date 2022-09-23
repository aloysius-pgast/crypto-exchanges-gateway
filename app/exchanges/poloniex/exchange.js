"use strict";
const fs = require('fs');
const Api = require('poloniex-api-node');
const logger = require('winston');
const _ = require('lodash');
const Big = require('big.js');
const Errors = require('../../errors');
const DateTimeHelper = require('../../datetime-helper');
const AbstractExchangeClass = require('../../abstract-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

const exchangeType = 'poloniex';

// maximum number of entries when retrieving own trades
const OWN_TRADES_LIMIT_PER_ITER = 10000;
// number of days to search back for trades when user did not ask to retrieve complete history
const OWN_TRADES_MAX_DAYS = 30;

// default limit when retrieving order book
const ORDER_BOOK_DEFAULT_LIMIT = 100;

// list of possible interval for klines
const supportedKlinesIntervals = [
  '5m', '15m', '30m',
  '2h', '4h',
  '1d'
]
const klinesIntervalsMapping = {
    '5m':300, '15m':900, '30m':1800,
    '2h':7200, '4h':14400,
    '1d':86400
}
const defaultKlinesInterval = '5m';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    'pairs':{enabled:true},
    'tickers':{enabled:true, withoutPair:true}, 'wsTickers':{enabled:true, emulated:false},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true, emulated:false},
    'trades':{enabled:true}, 'wsTrades':{enabled:true, emulated:false},
    'klines':{enabled:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval}, 'wsKlines':{enabled:true,emulated:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval},
    'orders':{enabled:true, withoutPair:true},
    'openOrders':{enabled:true, withoutPair:true},
    'closedOrders':{enabled:true, withoutPair:true, completeHistory:true},
    'balances':{enabled:true, withoutCurrency:true}
};

class Exchange extends AbstractExchangeClass
{

/**
 * Constructor
 *
 * @param {string} exchangeId exchange identifier (ex: bittrex)
 * @param {string} exchangeName exchange name (ex: Bittrex)
 * @param {object} config full config object
 */
constructor(exchangeId, exchangeName, config)
{
    super(exchangeId, exchangeType, exchangeName, supportedFeatures, config);
    this._client = new Api(config.exchanges[exchangeId].key, config.exchanges[exchangeId].secret);
    this._limiterPublic = this._getRateLimiter(config.exchanges[exchangeId].throttle.publicApi.maxRequestsPerSecond);
    this._limiterTrading = this._getRateLimiter(config.exchanges[exchangeId].throttle.tradingApi.maxRequestsPerSecond);
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
}

/**
 * Convert pair from exchange format X_Y to custom format X-Y
 *
 * @param {string} pair pair in exchange format (X_Y)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let arr = pair.split('_');
    return arr[0] + '-' + arr[1];
}

/**
 * Convert pair from custom format X-Y to exchange format X-Y
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (X_Y)
 */
_toExchangePair(pair)
{
    let arr = pair.split('-');
    return arr[0] + '_' + arr[1];
}

/**
 * Extract error from the error returned by API
 *
 * @param {object} e exception returned by API
 * @return {string|object}
 */
_parseError(e)
{
    if (this._isNetworkError(e))
    {
        return e;
    }
    // Poloniex API error with non 200 http code
    if (0 === e.message.indexOf('Poloniex error'))
    {
        let message = e.message.substr(15).trim();
        return message;
    }
    // Poloniex API error with 200 http code
    return e.message;
}

/**
 * Indicates whether or not error is an authentication error
 *
 * @param {string} message error message
 * @return {boolean}
 */
_isInvalidAuthError(message)
{
    if ('403' == message.substr(0, 3))
    {
        return true;
    }
    return false;
}

/**
 * Indicates whether or not error is a Poloniex internal error
 *
 * @param {string} message error message
 * @return {boolean}
 */
_isInternalError(message)
{
    if ('500' == message.substr(0, 3))
    {
        return true;
    }
    return false;
}

/**
 * Return mapping {id:{id:integer,pair:string},...}
 *
 * @return {Promise}
 */
 /*
 Raw output example for GET https://poloniex.com/public?command=returnTicker

 {
     "BTC_BCN":{
         "id":7,
         "last":"0.00000032",
         "lowestAsk":"0.00000033",
         "highestBid":"0.00000032",
         "percentChange":"0.00000000",
         "baseVolume":"30.19185337",
         "quoteVolume":"93692623.83040726",
         "isFrozen":"0",
         "high24hr":"0.00000034",
         "low24hr":"0.00000031"
     },
     "BTC_BELA":{
         "id":8,
         "last":"0.00001064",
         "lowestAsk":"0.00001093",
         "highestBid":"0.00001073",
         "percentChange":"-0.01481481",
         "baseVolume":"0.70109830",
         "quoteVolume":"64454.01418726",
         "isFrozen":"0",
         "high24hr":"0.00001111",
         "low24hr":"0.00001058"
     },...
 }
 */
/*
 Output example

 {
     7:{
         "id":7,
         "pair":"BTC-BCN"
     },
     8:{
         "id":8,
         "pair":"BTC-BELA"
     },
     10:{
         "id":10,
         "pair":"BTC-BLK"
     },...
}
*/
async getPairsById()
{
    let self = this;
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnTicker();
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = {};
        _.forEach(data, (value, key) => {
            let pair = self._toCustomPair(key);
            list[value.id] = {
                id:value.id,
                pair:pair
            }
        });
        return list;
    });
}

/**
 * Returns all active pairs
 *
 * @return {Promise}
 */
/*
Raw output example for GET https://poloniex.com/public?command=returnTicker

{
    "BTC_BCN":{
        "id":7,
        "last":"0.00000032",
        "lowestAsk":"0.00000033",
        "highestBid":"0.00000032",
        "percentChange":"0.00000000",
        "baseVolume":"30.19185337",
        "quoteVolume":"93692623.83040726",
        "isFrozen":"0",
        "high24hr":"0.00000034",
        "low24hr":"0.00000031"
    },
    "BTC_BELA":{
        "id":8,
        "last":"0.00001064",
        "lowestAsk":"0.00001093",
        "highestBid":"0.00001073",
        "percentChange":"-0.01481481",
        "baseVolume":"0.70109830",
        "quoteVolume":"64454.01418726",
        "isFrozen":"0",
        "high24hr":"0.00001111",
        "low24hr":"0.00001058"
    },...
}
*/
async _getPairs()
{
    let self = this;
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnTicker();
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = {};
        // same limits for all pairs
        let limits = self._getDefaultLimits();
        _.forEach(data, (value, key) => {
            let arr = key.split('_');
            // Based on Poloniex errors "422: . Total must be at least 1." for USDT and "422: . Total must be at least 0.0001." for BTC/ETH
            if ('USDT' == arr[0])
            {
                limits.price.min = 1;
            }
            else
            {
                limits.price.min = 0.0001;
            }
            let pair = arr[0] + '-' + arr[1];
            list[pair] = {
                pair:pair,
                baseCurrency: arr[0],
                currency: arr[1],
                limits:limits
            }
        });
        return list;
    });
}

/**
 * Retrieve tickers for all pairs
 *
 * @return {Promise}
 */
/*
Raw output example for GET https://poloniex.com/public?command=returnTicker

{
    "BTC_BCN":{
        "id":7,
        "last":"0.00000032",
        "lowestAsk":"0.00000033",
        "highestBid":"0.00000032",
        "percentChange":"0.00000000",
        "baseVolume":"30.19185337",
        "quoteVolume":"93692623.83040726",
        "isFrozen":"0",
        "high24hr":"0.00000034",
        "low24hr":"0.00000031"
    },
    "BTC_BELA":{
        "id":8,
        "last":"0.00001064",
        "lowestAsk":"0.00001093",
        "highestBid":"0.00001073",
        "percentChange":"-0.01481481",
        "baseVolume":"0.70109830",
        "quoteVolume":"64454.01418726",
        "isFrozen":"0",
        "high24hr":"0.00001111",
        "low24hr":"0.00001058"
    },...
}
*/
async _getTickers()
{
    let self = this;
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnTicker();
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = {};
        _.forEach(data, (value, key) => {
            let pair = self._toCustomPair(key);
            list[pair] = {
                pair:pair,
                last: parseFloat(value.last),
                priceChangePercent: parseFloat(value.percentChange) * 100,
                sell: parseFloat(value.lowestAsk),
                buy: parseFloat(value.highestBid),
                high: parseFloat(value.high24hr),
                low: parseFloat(value.low24hr),
                volume: parseFloat(value.quoteVolume),
                timestamp: parseFloat(new Date().getTime() / 1000.0)
            }
        });
        return list;
    });
}

/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise}
 */
/*
  Raw output example for GET https://poloniex.com/public?command=returnOrderBook&currencyPair=BTC_GAS&depth=10

  {
      "asks":[
          [
              "0.00226146",
              7.1034641
          ],
          [
              "0.00227279",
              5.99
          ]
      ],
      "bids":[
          [
              "0.00225381",
              0.0525312
          ],
          [
              "0.00224381",
              3.1062
          ]
      ],
      "isFrozen":"0",
      "seq":20869192
  }
*/
async _getOrderBook(pair, opt)
{
    if (undefined == opt.limit)
    {
        opt.limit = ORDER_BOOK_DEFAULT_LIMIT;
    }
    let self = this;
    // convert pair to remote format
    let _pair = this._toExchangePair(pair);
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnOrderBook(_pair, opt.limit);
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let result = {
            buy:_.map(data.bids, (arr) => {
                return {
                    rate:parseFloat(arr[0]),
                    quantity:parseFloat(arr[1])
                }
            }),
            sell:_.map(data.asks, (arr) => {
                return {
                    rate:parseFloat(arr[0]),
                    quantity:parseFloat(arr[1])
                }
            })
        }
        return result;
    });
}

/**
 * Returns the default value for order book limit
 * @return {integer}
 */
getDefaultOrderBookLimit()
{
    return ORDER_BOOK_DEFAULT_LIMIT;
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
 Raw output example for GET https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_GAS&start=1410158341&end=1410499372

 [
     {
         "globalTradeID":360105608,
         "tradeID":720432,
         "date":"2018-04-10 18:31:29",
         "type":"sell",
         "rate":"0.00224092",
         "amount":"1.41933222",
         "total":"0.00318060"
     },
     {
         "globalTradeID":360105607,
         "tradeID":720431,
         "date":"2018-04-10 18:31:29",
         "type":"sell",
         "rate":"0.00224093",
         "amount":"0.62265659",
         "total":"0.00139532"
     }
 ]

 */
async _getTrades(pair, opt)
{
    let self = this;
    // convert pair to remote format
    let _pair = this._toExchangePair(pair);
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnTradeHistory(_pair);
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = [];
        _.forEach(data, (entry) => {
            let orderType = 'sell';
            if ('buy' == entry.type)
            {
                orderType = 'buy';
            }
            list.push({
                id:entry.tradeID,
                quantity:parseFloat(entry.amount),
                rate:parseFloat(entry.rate),
                price:parseFloat(entry.total),
                orderType:orderType,
                timestamp:parseFloat(new Date(entry.date).getTime() / 1000.0)
            })
        });
        return list;
    });
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
 /*
 Raw output example for GET https://poloniex.com/public?command=returnChartData&currencyPair=BTC_GAS&start=1405699200&end=9999999999&period=300

 [
     {
         "date":1523300700,
         "high":0.00223558,
         "low":0.00223519,
         "open":0.00223519,
         "close":0.00223558,
         "volume":0.01714407,
         "quoteVolume":7.67,
         "weightedAverage":0.00223521
     },
     {
         "date":1523301000,
         "high":0.00223558,
         "low":0.00223558,
         "open":0.00223558,
         "close":0.00223558,
         "volume":0.00000132,
         "quoteVolume":0.00059157,
         "weightedAverage":0.00223558
     }
 ]
 */
async _getKlines(pair, interval, fromTimestamp, toTimestamp)
{
    let _pair = this._toExchangePair(pair);
    let period = klinesIntervalsMapping[interval];
    let self = this;
    return this._limiterPublic.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnChartData(_pair, period, fromTimestamp, toTimestamp);
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = [];
        _.forEach(data, (entry) => {
            list.push({
                // we have ts in ms
                timestamp:parseFloat(entry.date / 1000.0),
                open:parseFloat(entry.open),
                high:parseFloat(entry.high),
                low:parseFloat(entry.low),
                close:parseFloat(entry.close),
                volume:parseFloat(entry.quoteVolume)
            });
        });
        return list;
    });
}

/**
 * Retrieve open orders for all pairs
 *
 * @return {Promise}
 */
/*
Raw output example for POST https://poloniex.com/tradingApi?command=returnOpenOrders&currencyPair=all

{
    "BTC_AMP":[

    ],
    "BTC_ARDR":[

    ],
    "USDT_LTC":[
        {
            "orderNumber":"115945630531",
            "type":"sell",
            "rate":"300.00000000",
            "startingAmount":"0.05000000",
            "amount":"0.05000000",
            "total":"15.00000000",
            "date":"2018-04-11 13:53:55",
            "margin":0
        }
    ]
}

*/
async _getOpenOrders()
{
    let self = this;
    return this._limiterTrading.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnOpenOrders('all');
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInvalidAuthError(error))
                {
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(self.getId(), error);
                }
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = {};
        _.forEach(data, (entries, key) => {
            // ignore pair if we don't have any entry
            if (0 == entries.length)
            {
                return;
            }
            // convert pair to custom format
            let pair = self._toCustomPair(key);
            _.forEach(entries, (entry) => {
                let orderType;
                // we only support buy or sell orders
                switch (entry.type)
                {
                    case 'buy':
                    case 'sell':
                        orderType = entry.type;
                        break;
                    default:
                        return;
                }
                let o = {
                    pair:pair,
                    orderType:orderType,
                    orderNumber:entry.orderNumber,
                    targetRate:parseFloat(entry.rate),
                    targetPrice:parseFloat(entry.total),
                    quantity:parseFloat(entry.startingAmount),
                    remainingQuantity:parseFloat(entry.amount),
                    openTimestamp:parseFloat(new Date(entry.date).getTime() / 1000.0)
                }
                list[o.orderNumber] = o;
            });
        });
        return list;
    });
}

/**
 * Returns user trades for all pairs
 *
 * @param {boolean} completeHistory whether or not complete history should be retrieved
 * @param {integer} limit used to limit results (optional)
 * @return {object[]} array of trades (newest first)
 */
/*
Raw output example for POST https://poloniex.com/tradingApi?command=returnTradeHistory&currencyPair=all

{
    "USDT_ETH":[
        {
            "globalTradeID":213557404,
            "tradeID":"3531440",
            "date":"2017-08-21 05:41:25",
            "rate":"311.00000000",
            "amount":"1.23392975",
            "total":"383.75215225",
            "fee":"0.00150000",
            "orderNumber":"124203465356",
            "type":"sell",
            "category":"exchange"
        },
        {
            "globalTradeID":209065946,
            "tradeID":"3424196",
            "date":"2017-08-14 12:47:04",
            "rate":"301.80000010",
            "amount":"0.91958004",
            "total":"277.52925616",
            "fee":"0.00150000",
            "orderNumber":"123702824498",
            "type":"buy",
            "category":"exchange"
        },
    ],
    "USDT_BTC":[
        {
            "globalTradeID":210799911,
            "tradeID":"7265393",
            "date":"2017-08-17 14:35:35",
            "rate":"4464.45999996",
            "amount":"0.36356883",
            "total":"1623.13849876",
            "fee":"0.00150000",
            "orderNumber":"85080361594",
            "type":"sell",
            "category":"exchange"
        },
        {
            "globalTradeID":210799903,
            "tradeID":"7265392",
            "date":"2017-08-17 14:35:33",
            "rate":"4464.45999996",
            "amount":"0.00008722",
            "total":"0.38939020",
            "fee":"0.00150000",
            "orderNumber":"85080361594",
            "type":"sell",
            "category":"exchange"
        }
    ]
}

*/
/*
Output example

actualPrice is (quantity * actualRate)
finalPrice is (actualPrice +/- fees.amount)

[
    {
        "globalTradeID":213557404,
        "pair":"USDT-ETH",
        "orderNumber":"124203465356",
        "orderType":"sell",
        "actualRate":311,
        "quantity":1.23392975,
        "actualPrice":383.75215225,
        "timestamp":1503294085,
        "fees":{
            "amount":0.57562823,
            "currency":"ETH"
        },
        "finalPrice":383.17652402
    },
    {
        "globalTradeID":209065946,
        "pair":"USDT-ETH",
        "orderNumber":"123702824498",
        "orderType":"buy",
        "actualRate":301.8000001,
        "quantity":0.91958004,
        "actualPrice":277.52925616,
        "timestamp":1502714824,
        "fees":{
            "amount":0.41629388,
            "currency":"USDT"
        },
        "finalPrice":277.94555004
    },
    {
        "globalTradeID":210799903,
        "pair":"USDT-BTC",
        "orderNumber":"85080361594",
        "orderType":"sell",
        "actualRate":4464.45999996,
        "quantity":0.00008722,
        "actualPrice":0.3893902,
        "timestamp":1502980533,
        "fees":{
            "amount":0.00058409,
            "currency":"BTC"
        },
        "finalPrice":0.38880611
    }
]

*/
async getOwnTrades(completeHistory, limit)
{
    let now = parseInt(Date.now() / 1000.0);
    // by default, retrieve all orders of last X days
    let start = now - (3600 * 24 * OWN_TRADES_MAX_DAYS);
    let end = now;
    if (completeHistory)
    {
        // NB: no result will be returned if we use 0
        start = 1;
    }
    let _limit = OWN_TRADES_LIMIT_PER_ITER;
    if (undefined !== limit)
    {
        _limit = limit;
    }
    // keep track of all globalTradeID retrieved during last iter
    let lastGlobalTradeIDList = {};
    let list = [];
    while (true)
    {
        let data;
        try
        {
            let self = this;
            data = await this._limiterTrading.schedule(async function(){
                return await self._client.returnMyTradeHistory('all', start, end, _limit);
            });
        }
        catch (e)
        {
            let error = this._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (this._isInvalidAuthError(error))
                {
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.getId(), error);
                }
                if (this._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(this.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        // Poloniex will return an empty array instead of an object if no order exist
        if (Array.isArray(data) && 0 == data.length)
        {
            break;
        }
        let currentGlobalTradeIDList = {};
        let count = 0;
        let oldest = null;
        _.forEach(data, (entries, key) => {
            // ignore pair if we don't have any entry
            if (0 == entries.length)
            {
                return;
            }
            // used to ensure we don't process same entry on next iteration
            let splittedPair = key.split('_');
            let pair = this._toCustomPair(key);
            _.forEach(entries, (entry) => {
                ++count;
                // entry was already retrieved during last iteration
                if (undefined !== lastGlobalTradeIDList[entry.globalTradeID])
                {
                    return;
                }
                currentGlobalTradeIDList[entry.globalTradeID] = true;
                let timestamp = DateTimeHelper.parseUtcDateTime(entry.date);
                if (null === oldest || timestamp < oldest)
                {
                    oldest = timestamp;
                }
                let trade = {
                    globalTradeID:entry.globalTradeID,
                    pair:pair,
                    orderNumber:entry.orderNumber,
                    orderType:entry.type,
                    actualRate:parseFloat(entry.rate),
                    quantity:parseFloat(entry.amount),
                    actualPrice:parseFloat(entry.total),
                    timestamp:timestamp
                }
                // total returned by Poloniex is quantity * rate (without taking fees into account)
                let finalPrice = new Big(entry.total);
                let feesAmount = finalPrice.times(entry.fee);
                if ('buy' == trade.orderType)
                {
                    trade.fees = {
                        amount:parseFloat(feesAmount.toFixed(8)),
                        currency:splittedPair[0]
                    }
                    trade.finalPrice = parseFloat(finalPrice.plus(feesAmount).toFixed(8));
                }
                else
                {
                    trade.fees = {
                        amount:parseFloat(feesAmount.toFixed(8)),
                        currency:splittedPair[0]
                    }
                    trade.finalPrice = parseFloat(finalPrice.minus(feesAmount).toFixed(8));
                }
                list.push(trade);
            });
        });
        lastGlobalTradeIDList = currentGlobalTradeIDList;
        // less entries than requested => no more entries
        if (count < _limit)
        {
            break;
        }
        // next iter
        end = oldest - 1;
    }
    return list;
}

/**
 * Retrieve closed orders for all pairs
 *
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise}
 */
async _getClosedOrders(completeHistory)
{
    let openOrders;
    // first retrieve open orders to ignore orders which are still open
    try
    {
        openOrders = await this.getOpenOrders();
    }
    catch (e)
    {
        throw e;
    }
    let trades;
    try
    {
        trades = await this.getOwnTrades(completeHistory);
    }
    catch (e)
    {
        throw e;
    }
    let list = {};
    _.forEach(trades, (trade) => {
        if (undefined !== openOrders[trade.orderNumber])
        {
            return;
        }
        // order not in the list yet ?
        if (undefined === list[trade.orderNumber])
        {
            list[trade.orderNumber] = {
                pair:trade.pair,
                orderNumber:trade.orderNumber,
                orderType:trade.orderType,
                quantity:new Big(0.0),
                actualPrice:new Big(0.0),
                finalPrice:new Big(0.0),
                openTimestamp:null,
                closedTimestamp:null,
                fees:{
                    amount:new Big(0.0),
                    currency:trade.fees.currency
                }
            }
        }
        // add/update timestamp
        if (null === list[trade.orderNumber].closedTimestamp || trade.timestamp > list[trade.orderNumber].closedTimestamp)
        {
            list[trade.orderNumber].closedTimestamp = trade.timestamp;
        }
        list[trade.orderNumber].quantity = list[trade.orderNumber].quantity.plus(trade.quantity);
        list[trade.orderNumber].actualPrice = list[trade.orderNumber].actualPrice.plus(trade.actualPrice);
        list[trade.orderNumber].finalPrice = list[trade.orderNumber].finalPrice.plus(trade.finalPrice);
        list[trade.orderNumber].fees.amount = list[trade.orderNumber].fees.amount.plus(trade.fees.amount);
    });
    // format quantity, actualPrice, finalPrice & fees amount + compute actualRate
    _.forEach(list, (entry, orderNumber) => {
        list[entry.orderNumber].actualRate = parseFloat(list[entry.orderNumber].actualPrice.div(list[entry.orderNumber].quantity).toFixed(8));
        list[entry.orderNumber].finalRate = parseFloat(list[entry.orderNumber].finalPrice.div(list[entry.orderNumber].quantity).toFixed(8));
        list[entry.orderNumber].quantity = parseFloat(list[entry.orderNumber].quantity.toFixed(8));
        list[entry.orderNumber].actualPrice = parseFloat(list[entry.orderNumber].actualPrice.toFixed(8));
        list[entry.orderNumber].finalPrice = parseFloat(list[entry.orderNumber].finalPrice.toFixed(8));
        list[entry.orderNumber].fees.amount = parseFloat(list[entry.orderNumber].fees.amount.toFixed(8));
    });
    return list;
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
/*
Raw output example for POST https://poloniex.com/tradingApi?command=buy&currencyPair=BTC_GAS&rate=0.00234500&amount=100

{
    "orderNumber":"116180388438",
    "resultingTrades":[

    ]
}

*/
async _createOrder(orderType, pair, targetRate, quantity)
{
    let self = this;
    // convert pair to remote format
    let _pair = this._toExchangePair(pair);
    return this._limiterTrading.schedule(async function(){
        let data;
        try
        {
            if ('buy' == orderType)
            {
                data = await self._client.buy(_pair, targetRate, quantity);
            }
            else
            {
                data = await self._client.sell(_pair, targetRate, quantity);
            }
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInvalidAuthError(error))
                {
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(self.getId(), error);
                }
                // might be an order definition error
                /*
                Error examples :
                422: . Total must be at least 1.
                422: . Rate must be greater than zero.
                422: . Amount must be at least 0.000001.
                */
                if ('422' == error.substr(0, 3))
                {
                    // quantity is invalid
                    if (/Amount must be/.test(error))
                    {
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidQuantity(self.getId(), pair, quantity, error);
                    }
                    // price is invalid
                    if (/Total must be/.test(error))
                    {
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidPrice(self.getId(), pair, targetRate, quantity, error);
                    }
                    // rate is invalid
                    if (/Rate must be/.test(error))
                    {
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate(self.getId(), pair, targetRate, error);
                    }
                }
                // not enough funds
                /*
                Error examples :
                Not enough USDT.
                */
                if (/Not enough/.test(error))
                {
                    throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InsufficientFunds(self.getId(), pair, targetRate, quantity, error);
                }
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        // only return order number
        return data.orderNumber;
    });
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @return {Promise} Promise which will resolve to true in case of success
 */
/*
Raw output example for POST https://poloniex.com/tradingApi?command=cancelOrder&orderNumber=xxx

{
    "success":1,
    "amount":"0.50000000",
    "message":"Order #116180388438 canceled."
}

*/
async _cancelOrder(orderNumber, pair)
{
    let self = this;
    return this._limiterTrading.schedule(async function(){
        let data;
        try
        {
            data = await self._client.cancelOrder(orderNumber);
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInvalidAuthError(error))
                {
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(self.getId(), error);
                }
                // invalid order
                /*
                Error examples :
                Invalid order number, or you are not the person who placed the order.
                Order not found, or you are not the person who placed it.
                */
                if (/Invalid order number/.test(error) || /Order not found/.test(error))
                {
                    // try to retrieve order to see if it's closed
                    let order;
                    try
                    {
                        order = await self._getOrder(orderNumber, pair);
                    }
                    catch (e)
                    {
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(self.getId(), orderNumber, error);
                    }
                    // order is closed
                    if (undefined !== order.closedTimestamp)
                    {
                        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotOpen(self.getId(), orderNumber, error);
                    }
                }
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        return true;
    });
}

/**
 * Returns trades for a given order
 *
 * @param {string} orderNumber order number
 * @return {object[]} array of trades
 */
/*
Raw output example for POST https://poloniex.com/tradingApi?command=returnOrderTrades&orderNumber=xxx

[
    {
        "globalTradeID":144043967,
        "tradeID":270936,
        "currencyPair":"ETH_GNT",
        "type":"buy",
        "rate":"0.00241843",
        "amount":"0.00000001",
        "total":"0.00000000",
        "fee":"0.00150000",
        "date":"2017-05-26 08:53:04"
    },
    {
        "globalTradeID":144041990,
        "tradeID":270930,
        "currencyPair":"ETH_GNT",
        "type":"buy",
        "rate":"0.00241843",
        "amount":"100.17032920",
        "total":"0.24225493",
        "fee":"0.00150000",
        "date":"2017-05-26 08:51:07"
    },
    {
        "globalTradeID":144040552,
        "tradeID":270920,
        "currencyPair":"ETH_GNT",
        "type":"buy",
        "rate":"0.00241843",
        "amount":"16.23970795",
        "total":"0.03927459",
        "fee":"0.00150000",
        "date":"2017-05-26 08:49:41"
    }
]

*/
/*
Output example

actualPrice is (quantity * actualRate)
finalPrice is (actualPrice +/- fees.amount)

NB: an empty array will be returned if no trade exist (Poloniex error will be swallowed)

[
    {
        "globalTradeID":144043967,
        "pair":"ETH-GNT",
        "orderNumber":"2030423730",
        "orderType":"buy",
        "actualRate":0.00241843,
        "quantity":1e-8,
        "actualPrice":0,
        "timestamp":1495788784,
        "fees":{
            "amount":0,
            "currency":"ETH"
        },
        "finalPrice":0
    },
    {
        "globalTradeID":144041990,
        "pair":"ETH-GNT",
        "orderNumber":"2030423730",
        "orderType":"buy",
        "actualRate":"0.00241843",
        "quantity":"100.17032920",
        "actualPrice":"0.24225493",
        "timestamp":1495788667,
        "fees":{
            "amount":0.000363382,
            "currency":"ETH"
        },
        "finalPrice":0.24261831
    },
    {
        "globalTradeID":144040552,
        "pair":"ETH-GNT",
        "orderNumber":"2030423730",
        "orderType":"buy",
        "actualRate":0.00241843,
        "quantity":16.23970795,
        "actualPrice":0.03927459,
        "timestamp":1495788581,
        "fees":{
            "amount":0.00005891,
            "currency":"ETH"
        },
        "finalPrice":0.0393335
    }
]

*/
async getOrderTrades(orderNumber)
{
    let data;
    try
    {
        let self = this;
        data = await this._limiterTrading.schedule(async function(){
            return await self._client.returnOrderTrades(orderNumber);
        });
    }
    catch (e)
    {
        let error = this._parseError(e);
        // must be a Poloniex error
        if ('string' == typeof error)
        {
            if (this._isInvalidAuthError(error))
            {
                throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(this.getId(), error);
            }
            // invalid order
            /*
            Error examples :
            Order not found, or you are not the person who placed it.
            Invalid order number, or you are not the person who placed the order.
            */
            if (/Order not found/.test(error) || /Invalid order number/.test(error))
            {
                return [];
            }
            if (this._isInternalError(error))
            {
                throw new Errors.ExchangeError.NetworkError.UnknownError(this.getId(), error);
            }
            throw new Errors.ExchangeError.InvalidRequest.UnknownError(this.getId(), error);
        }
        else
        {
            throw error;
        }
    }
    let list = [];
    let splittedPair = data[0].currencyPair.split('_');
    let pair = this._toCustomPair(data[0].currencyPair);
    _.forEach(data, (entry) => {
        let timestamp = DateTimeHelper.parseUtcDateTime(entry.date);
        let trade = {
            globalTradeID:entry.globalTradeID,
            pair:pair,
            orderNumber:orderNumber,
            orderType:entry.type,
            actualRate:parseFloat(entry.rate),
            quantity:parseFloat(entry.amount),
            actualPrice:parseFloat(entry.total),
            timestamp:timestamp
        }
        // total returned by Poloniex is quantity * rate (without taking fees into account)
        let finalPrice = new Big(entry.total);
        let feesAmount = finalPrice.times(entry.fee);
        if ('buy' == trade.orderType)
        {
            trade.fees = {
                amount:parseFloat(feesAmount.toFixed(8)),
                currency:splittedPair[0]
            }
            trade.finalPrice = parseFloat(finalPrice.plus(feesAmount).toFixed(8));
        }
        else
        {
            trade.fees = {
                amount:parseFloat(feesAmount.toFixed(8)),
                currency:splittedPair[0]
            }
            trade.finalPrice = parseFloat(finalPrice.minus(feesAmount).toFixed(8));
        }
        list.push(trade);
    });
    return list;
}

/**
 * Retrieves a single order (open or closed)
 *
 * @param {string} orderNumber
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @return {Promise}
 */
async _getOrder(orderNumber, pair)
{
    let openOrders;
    // first retrieve open orders to ignore orders which are still open
    try
    {
        openOrders = await this.getOpenOrders();
    }
    catch (e)
    {
        throw e;
    }
    if (undefined !== openOrders[orderNumber])
    {
        return openOrders[orderNumber];
    }
    // retrieve trades
    let trades;
    try
    {
        trades = await this.getOrderTrades(orderNumber);
    }
    catch (e)
    {
        throw e;
    }
    // no trades => order does not exist
    if (0 == trades.length)
    {
        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.getId(), orderNumber);
    }
    let order = {
        orderNumber:orderNumber,
        pair:trades[0].pair,
        orderType:trades[0].orderType,
        quantity:new Big(0.0),
        actualPrice:new Big(0.0),
        finalPrice:new Big(0.0),
        openTimestamp:null,
        closedTimestamp:null,
        fees:{
            amount:new Big(0.0),
            currency:trades[0].fees.currency
        }
    };
    _.forEach(trades, (trade) => {
        // add/update timestamp
        if (null === order.closedTimestamp || trade.timestamp > order.closedTimestamp)
        {
            order.closedTimestamp = trade.timestamp;
        }
        order.quantity = order.quantity.plus(trade.quantity);
        order.actualPrice = order.actualPrice.plus(trade.actualPrice);
        order.finalPrice = order.finalPrice.plus(trade.finalPrice);
        order.fees.amount = order.fees.amount.plus(trade.fees.amount);
    });
    // format quantity, actualPrice, finalPrice & fees amount + compute actualRate
    if (order.quantity > 0) {
        order.actualRate = parseFloat(order.actualPrice.div(order.quantity).toFixed(8));
        order.finalRate = parseFloat(order.finalPrice.div(order.quantity).toFixed(8));
    }
    order.quantity = parseFloat(order.quantity.toFixed(8));
    order.actualPrice = parseFloat(order.actualPrice.toFixed(8));
    order.finalPrice = parseFloat(order.finalPrice.toFixed(8));
    order.fees.amount = parseFloat(order.fees.amount.toFixed(8));
    return order;
}

/**
 * Return balances for all currencies (currencies with balance = 0 should be filtered out)
 *
 * @return {Promise}
 */
/*
Raw output example for POST https://poloniex.com/tradingApi?command=returnCompleteBalances

{
    "1CR":{
        "available":"0.00000000",
        "onOrders":"0.00000000",
        "btcValue":"0.00000000"
    },
    "ABY":{
        "available":"0.00000000",
        "onOrders":"0.00000000",
        "btcValue":"0.00000000"
    }
}

*/
async _getBalances()
{
    let self = this;
    return this._limiterTrading.schedule(async function(){
        let data;
        try
        {
            data = await self._client.returnCompleteBalances();
        }
        catch (e)
        {
            let error = self._parseError(e);
            // must be a Poloniex error
            if ('string' == typeof error)
            {
                if (self._isInvalidAuthError(error))
                {
                    throw new Errors.ExchangeError.Forbidden.InvalidAuthentication(self.getId(), error);
                }
                if (self._isInternalError(error))
                {
                    throw new Errors.ExchangeError.NetworkError.UnknownError(self.getId(), error);
                }
                throw new Errors.ExchangeError.InvalidRequest.UnknownError(self.getId(), error);
            }
            else
            {
                throw error;
            }
        }
        let list = {};
        _.forEach(data, function (value, key) {
            let available = parseFloat(value.available);
            let onOrders = parseFloat(value.onOrders);
            let total = available + onOrders;
            // ignore currency with 0 balance
            if (0 == total)
            {
                return;
            }
            let b = {
                currency:key,
                total:total,
                available:available,
                onOrders:onOrders
            }
            list[key] = b;
        });
        return list;
    });
}

}

module.exports = Exchange;
