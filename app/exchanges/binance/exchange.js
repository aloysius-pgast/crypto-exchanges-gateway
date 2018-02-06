"use strict";
const Api = require('binance');
const PromiseHelper = require('../../promise-helper');
const Bottleneck = require('bottleneck');
const util = require('util');
const logger = require('winston');
const _ = require('lodash');
const Big = require('big.js');
const AbstractExchangeClass = require('../../abstract-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

// list of possible interval for klines
const supportedKlinesIntervals = [
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d',
  '1w',
  '1M'
]
const defaultKlinesInterval = '5m';

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
    super(exchangeId, exchangeName);
    let opt = {
        key:config.exchanges.binance.key,
        secret:config.exchanges.binance.secret,
        recvWindow:config.exchanges.binance.recvWindow,
        timeout:15000,
        disableBeautification:true
    };
    this._restClient = new Api.BinanceRest(opt);
    let wait = parseInt(1000 / config.exchanges.binance.throttle.global.maxRequestsPerSecond);
    this._limiterGlobal = new Bottleneck(config.exchanges.binance.throttle.global.maxRequestsPerSecond, wait);
    // how many cached orders should we keep ?
    this._cachedOrdersMaxSize = 500;
    // list of order number => {pair:"X-Y", state:"open|closed", timestamp:int}
    this._cachedOrders = {};
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
}

getSupportedKlinesIntervals()
{
    return supportedKlinesIntervals;
}

getDefaultKlinesInterval()
{
    return defaultKlinesInterval;
}

isKlinesIntervalSupported(interval)
{
    return -1 !== supportedKlinesIntervals.indexOf(interval);
}

/**
 * Free cache to ensure we don't keep too many entries in memory
 */
_freeCachedOrders()
{
    if (Object.keys(this._cachedOrders).length > this._cachedOrdersMaxSize)
    {
        let self = this;
        let arr = [];
        // remove all closed orders
        _.forEach(self._cachedOrders, function (entry, orderNumber) {
            if ('closed' == entry.state)
            {
                arr.push(orderNumber);
            }
        });
        _.forEach(arr, function (orderNumber) {
            delete self._cachedOrders[orderNumber];
        });
    }
}

/**
 * Convert pair from exchange format YX to custom format X-Y
 *
 * @param {string} pair pair in exchange format (YX)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let baseCurrency = pair.substr(-3);
    let currency;
    if ('SDT' == baseCurrency)
    {
        baseCurrency = 'USDT';
        currency = pair.substr(0, pair.length - 4);
    }
    else
    {
        currency = pair.substr(0, pair.length - 3);
    }
    return baseCurrency + '-' + currency;
}

/**
 * Convert pair from custom format X-Y to exchange format YX
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (YX)
 */
_toExchangePair(pair)
{
    let arr = pair.split('-');
    return arr[1] + arr[0];
}

/**
 * @param {array} pairs array of pair symbol (X-Y)
 */
_tickers(pairs)
{
    let self = this;
    // last price returned by ticker24hr does not match the real last price
    let p = self._limiterGlobal.schedule(function(){
        return self._restClient.allPrices();
    });
    let arr = [{promise:p, context:{exchange:'binance',api:'allPrices'}}];
    _.forEach(pairs, function (entry) {
        let p = self._limiterGlobal.schedule(function(){
            let pair = self._toExchangePair(entry);
            return self._restClient.ticker24hr({symbol:pair});
        });
        arr.push({promise:p, context:{exchange:'binance',api:'ticker24hr',pair:entry}});
    });
    return new Promise((resolve, reject) => {
        PromiseHelper.all(arr).then(function(data){
            let list = {};
            let allPrices = {};
            _.forEach(data, function (entry) {
                // could not retrieve specific ticker
                if (!entry.success)
                {
                    return;
                }
                if ('allPrices' == entry.context.api)
                {
                    _.forEach(entry.value, (obj) => {
                        allPrices[obj.symbol] = parseFloat(obj.price);
                    });
                    return;
                }
                list[entry.context.pair] = {
                    pair:entry.context.pair,
                    last: parseFloat(entry.value.lastPrice),
                    priceChangePercent: parseFloat(entry.value.priceChangePercent),
                    sell: parseFloat(entry.value.askPrice),
                    buy: parseFloat(entry.value.bidPrice),
                    high: parseFloat(entry.value.highPrice),
                    low: parseFloat(entry.value.lowPrice),
                    volume: parseFloat(entry.value.volume),
                    timestamp: parseFloat(entry.value.closeTime / 1000.0)
                }
            });
            // update last prices
            _.forEach(list, (entry, pair) => {
                let p = self._toExchangePair(pair);
                if (undefined !== allPrices[p])
                {
                    entry.last = allPrices[p];
                }
            });
            resolve(list);
        });
    });
}

/**
* Returns ticker for a list of currencies
*
* Format of result depends on opt.outputFormat parameter
*
* If opt.outputFormat is 'exchange' AND opt.pairs only contains one pair, the result returned by exchange will be returned unchanged
*
* {
*     priceChange: '0.00009500',
*     priceChangePercent: '1.820',
*     weightedAvgPrice: '0.00543070',
*     prevClosePrice: '0.00523400',
*     lastPrice: '0.00531500',
*     lastQty: '35.50000000',
*     bidPrice: '0.00529800',
*     bidQty: '15.34000000',
*     askPrice: '0.00532000',
*     askQty: '57.00000000',
*     openPrice: '0.00522000',
*     highPrice: '0.00575600',
*     lowPrice: '0.00519800',
*     volume: '274380.34000000',
*     quoteVolume: '1490.07613021',
*     openTime: 1505055069221,
*     closeTime: 1505141469221,
*     fristId: 798353,
*     lastId: 812361,
*     count: 14009
* }
*
* If opt.outputFormat is 'custom' OR opt.pairs contains more than one pair, the result will be as below
*
* {
*     "BTC-NEO":{
*         "pair":"BTC-NEO",
*         "last":0.00531500,
*         "priceChangePercent":2.5,
*         "sell":0.00532000,
*         "buy":0.00529800,
*         "high":0.00575600,
*         "low":0.00519800,
*         "volume":274380.34,
*         "timestamp":1502120848.34
*      },...
* }
*
* @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair)
* @param {string} opt.pairs list of pairs to retrieve tickers for
* @return {Promise} format depends on parameter opt.outputFormat
*/
tickers(opt)
{
    let self = this;
    if (1 == opt.pairs.length && 'exchange' == opt.outputFormat)
    {
        return this._limiterGlobal.schedule(function(){
            let pair = self._toExchangePair(opt.pairs[0]);
            let p = self._restClient.ticker24hr({symbol:pair});
            return p;
        });
    }
    // no pairs ? => retrieve all
    if (0 == opt.pairs.length)
    {
        return new Promise((resolve, reject) => {
            self.pairs({useCache:true}).then(function(data){
                let pairs = [];
                _.forEach(data, function (entry, pair) {
                    pairs.push(pair);
                });
                resolve(self._tickers(pairs));
            }).catch(function(err){
                logger.error('Could not retrieve pairs : %s', err.msg);
                resolve({});
            });
        });
    }
    return self._tickers(opt.pairs);
}

/**
 * Returns existing pairs
 *
 * Result will be as below
 *
 * {
 *     "X-Y":{
 *         "pair":"X-Y",
 *         "baseCurrency":"X",
 *         "currency":"Y"
 *     },...
 * }
 *
 * @param {boolean} opt.useCache : if true cached version will be used (optional, default = false)
 * @param {string} opt.pair : retrieve a single pair (ex: BTC-ETH pair) (optional)
 * @param {string} opt.currency : retrieve only pairs having a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if pair is set)
 * @param {string} opt.baseCurrency : retrieve only pairs having a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if currency or pair are set)
 * @return {Promise}
 */
pairs(opt)
{
    let timestamp = parseInt(new Date().getTime() / 1000.0);
    let updateCache = true;
    let useCache = false;
    if (undefined !== opt)
    {
        if (undefined !== opt.useCache && opt.useCache && timestamp < this._cachedPairs.nextTimestamp)
        {
            useCache = true;
        }
        // don't use cache if user asked for a list currencies / base currencies
        if (undefined !== opt.pair || undefined !== opt.currency || undefined !== opt.baseCurrency)
        {
            updateCache = false;
            useCache = false;
        }
    }
    if (useCache)
    {
        return new Promise((resolve, reject) => {
            resolve(this._cachedPairs.cache);
        });
    }
    let self = this;
    return this._limiterGlobal.schedule(function(){
        let p = self._restClient.exchangeInfo();
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {}
                _.forEach(data.symbols, function (entry) {
                    // ignore if status != 'TRADING'
                    if ('TRADING' != entry.status)
                    {
                        return;
                    }
                    // ignore dummy entry
                    if ('123456' == entry.symbol)
                    {
                        return;
                    }
                    let baseCurrency = entry.quoteAsset;
                    switch (baseCurrency)
                    {
                        // only keep BTC, ETH, USD & BNC as base currency
                        case 'BTC':
                        case 'ETH':
                        case 'USDT':
                        case 'BNB':
                            break;
                        default:
                            return;
                    }
                    let currency = entry.baseAsset;
                    let pair = baseCurrency + '-' + currency;
                    if (undefined !== opt.pair)
                    {
                        // ignore this pair
                        if (opt.pair != pair)
                        {
                            return;
                        }
                    }
                    else if (undefined !== opt.currency)
                    {
                        // ignore this pair
                        if (opt.currency != currency)
                        {
                            return;
                        }
                    }
                    else if (undefined !== opt.baseCurrency)
                    {
                        // ignore this pair
                        if (opt.baseCurrency != baseCurrency)
                        {
                            return;
                        }
                    }
                    let filters = {};
                    for (var i = 0; i < entry.filters.length; ++i)
                    {
                        filters[entry.filters[i].filterType] = entry.filters[i];
                    }
                    // add precision & limits
                    let obj = {
                        pair:pair,
                        baseCurrency: baseCurrency,
                        currency: currency,
                        limits:{
                            rate:{
                               min:parseFloat(filters['PRICE_FILTER'].minPrice),
                               max:parseFloat(filters['PRICE_FILTER'].maxPrice),
                               step:parseFloat(filters['PRICE_FILTER'].tickSize),
                               precision:self._stepToPrecision(filters['PRICE_FILTER'].tickSize)
                            },
                            quantity:{
                                min:parseFloat(filters['LOT_SIZE'].minQty),
                                max:parseFloat(filters['LOT_SIZE'].maxQty),
                                step:parseFloat(filters['LOT_SIZE'].stepSize),
                                precision:self._stepToPrecision(filters['LOT_SIZE'].stepSize)
                            },
                            price:{
                                min:parseFloat(filters['MIN_NOTIONAL'].minNotional),
                                max:null
                            }
                        }
                    }
                    list[pair] = obj;
                });
                if (updateCache)
                {
                    self._cachedPairs.cache = list;
                    self._cachedPairs.lastTimestamp = timestamp;
                    self._cachedPairs.nextTimestamp = timestamp + self._cachedPairs.cachePeriod;
                }
                resolve(list);
            }).catch(function(err){
                reject(err.msg);
            });
        });
    });
}

/**
 * Returns order book
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "lastUpdateId":5030329,
 *     "bids":[
 *         ["0.00529700","125.74000000",[]],
 *         ["0.00528800","385.20000000",[]],
 *         ...
 *     ],
 *     "asks":[
 *         ["0.00530300","16.83000000",[]],
 *         ["0.00530500","16.02000000",[]],
 *         ...
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "buy":[
 *         {"rate":0.005297,"quantity":125.74},
 *         {"rate":0.005288,"quantity":385.2},
 *         ...
 *     ],
 *     "sell":[
 *         {"rate":0.005303,"quantity":16.83},
 *         {"rate":0.005305,"quantity":16.02},
 *         ...
 *     ]
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to retrieve order book for
 * @param {integer} opt.limit how many entries to retrieve from order book (max = 100)
 * @param {boolean} opt.includeLastUpdateId whether or not 'lastUpdateId' field should be present in result (optional, default = false) (will be ignored if outputFormat is 'exchange')
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 orderBook(opt) {
    let self = this;
    return this._limiterGlobal.schedule(function(){
        let pair = self._toExchangePair(opt.pair);
        let p = self._restClient.depth({symbol:pair, limit:opt.limit});
        // return raw results
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let result = {
                    buy:_.map(data.bids, arr => {
                        return {
                            rate:parseFloat(arr[0]),
                            quantity:parseFloat(arr[1])
                        }
                    }),
                    sell:_.map(data.asks, arr => {
                        return {
                            rate:parseFloat(arr[0]),
                            quantity:parseFloat(arr[1])
                        }
                    })
                }
                if (true === opt.includeLastUpdateId)
                {
                    result.lastUpdateId = data.lastUpdateId;
                }
                resolve(result);
            }).catch(function(err){
                reject(err.msg);
            });
        });
    });
}

/**
 * Returns charts data
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to retrieve order book for
 * @param {string} opt.interval charts interval
 * @return {Promise} format depends on parameter opt.outputFormat
 */

 /*
 If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched

 [
     [
         1513256400000,
         "47.92800000",
         "48.70000000",
         "45.80100000",
         "47.07600000",
         "6361.94700000",
         1513259999999,
         "300408.63210100",
         431,
         "3017.09900000",
         "142185.99138900",
         "3445945.45866000"
     ],
     [
         1513260000000,
         "47.11000000",
         "47.11000000",
         "44.74400000",
         "45.35700000",
         "5352.61100000",
         1513263599999,
         "244037.18913000",
         470,
         "1670.36500000",
         "76024.59013000",
         "3449014.45866000"
     ],
     ...
 ]

 If opt.outputFormat is 'custom', the result will be as below

 [
     {
         "timestamp":1513256400,
         "open":47.928,
         "high":48.7,
         "low":45.801,
         "close":47.076,
         "volume":6361.947
     },
     {
         "timestamp":1513260000,
         "open":47.11,
         "high":47.11,
         "low":44.744,
         "close":45.357,
         "volume":5352.611
     },
     {
         "timestamp":1513263600,
         "open":45.271,
         "high":46.8,
         "low":43,
         "close":46.018,
         "volume":8146.15
     },
     ...
 ]
 */
 klines(opt) {
    let self = this;
    return this._limiterGlobal.schedule(function(){
        let pair = self._toExchangePair(opt.pair);
        let p = self._restClient.klines({symbol:pair, interval:opt.interval});
        // return raw results
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = [];
                _.forEach(data, (entry) => {
                    list.push({
                        timestamp:parseFloat(entry[0] / 1000.0),
                        open:parseFloat(entry[1]),
                        high:parseFloat(entry[2]),
                        low:parseFloat(entry[3]),
                        close:parseFloat(entry[4]),
                        volume:parseFloat(entry[5])
                    });
                });
                resolve(list);
            }).catch(function(err){
                reject(err.msg);
            });
        });
    });
}

/**
 * Returns last trades
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * [
 *     {
 *         "a":1132434,
 *         "p":"0.07252000",
 *         "q":"0.50000000",
 *         "f":1199586,
 *         "l":1199586,
 *         "T":1505725537806,
 *         "m":true,
 *         "M":true
 *     },
 *     {
 *         "a":1132435,
 *         "p":"0.07252000",
 *         "q":"0.50000000",
 *         "f":1199587,
 *         "l":1199587,
 *         "T":1505725538108,
 *         "m":true,
 *         "M":true
 *     }
 * ]
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * [
 *     {
 *         "id":1132933,
 *         "quantity":0.95,
 *         "rate":0.072699,
 *         "price":0.06906405,
 *         "orderType":"sell",
 *         "timestamp":1505731777.52
 *     },
 *     {
 *         "id":1132932,
 *         "quantity":1,
 *         "rate":0.072602,
 *         "price":0.072602,
 *         "orderType":"buy",
 *         "timestamp":1505731693.57
 *     }
 * ]
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {integer} opt.afterTradeId only retrieve trade with an ID > opt.afterTradeId (optional, will be ignored if opt.outputFormat is set to 'exchange')
 * @param {string} opt.pair pair to retrieve trades for (X-Y)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 trades(opt) {
    let self = this;
    return this._limiterGlobal.schedule(function(){
        let exchangePair = self._toExchangePair(opt.pair);
        let params = {symbol:exchangePair};
        if (undefined !== opt.afterTradeId)
        {
            // fromId is inclusive, we want all trades with an ID > afterTradeId
            params.fromId = opt.afterTradeId + 1;
        }
        let p = self._restClient.aggTrades(params);
        // return raw results
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = [];
                _.forEach(data, function(entry){
                    let quantity = parseFloat(entry.q);
                    let rate = parseFloat(entry.p);
                    let price = parseFloat(new Big(quantity).times(rate));
                    let orderType = 'sell';
                    // seems to be reversed and when 'm' is true, entry is displayed in RED on Binance website
                    if (false === entry.m)
                    {
                        orderType = 'buy';
                    }
                    list.unshift({
                        id:entry.a,
                        quantity:quantity,
                        rate:rate,
                        price:price,
                        orderType:orderType,
                        timestamp:parseFloat(entry.T / 1000.0)
                    })
                });
                resolve(list);
            }).catch(function(err){
                reject(err.msg);
            });
        });
    });
}

/**
 * @param {string} orderNumber identifier of the order
 * @param {string} pair pair of the order (X-Y)
 * @param {object} dictionary of expected order states {'state1':1,'state2':1} (ex: {'NEW':1,'PARTIALLY_FILLED':1}) (optional)
 */
_queryOrder(orderNumber,pair,orderStates)
{
    let self = this;
    return this._limiterGlobal.schedule(function(){
        return new Promise((resolve, reject) => {
            let exchangePair = self._toExchangePair(pair);
            let p = self._restClient.queryOrder({symbol:exchangePair,origClientOrderId:orderNumber});
            p.then(function(order){
                // we only support LIMIT orders
                if ('LIMIT' != order.type)
                {
                    resolve(null);
                    return;
                }
                // not the status we are looking for
                if (undefined !== orderStates && undefined === orderStates[order.status])
                {
                    resolve(null);
                    return;
                }
                resolve(order);
            }).catch(function(err){
                logger.error("Could not query order '%s' : %s", orderNumber, err.msg);
                resolve(null);
            });
        });
    });
}

/**
 * @param {array} data array as returned by openOrders exchange API
 */
_formatOpenOrders(data)
{
    let self = this;
    if (0 != data.length)
    {
        this._freeCachedOrders();
    }
    let list = {};
    let timestamp = parseInt(new Date().getTime() / 1000.0);
    _.forEach(data, function (entry) {
        let orderType;
        let pair =  self._toCustomPair(entry.symbol);
        self._cachedOrders[entry.clientOrderId] = {pair:pair,state:'open',timestamp:timestamp};
        switch (entry.side)
        {
            case 'BUY':
                orderType = 'buy';
                break;
            case 'SELL':
                orderType = 'sell';
                break;
            default:
                return;
        }
        let order = {
            pair:pair,
            orderType:orderType,
            orderNumber:entry.clientOrderId,
            targetRate:parseFloat(entry.price),
            quantity:parseFloat(entry.origQty),
            openTimestamp:parseFloat(entry.time / 1000.0)
        }
        order.targetPrice = parseFloat(new Big(order.targetRate).times(order.quantity));
        order.remainingQuantity = order.quantity - parseFloat(entry.executedQty);
        list[order.orderNumber] = order;
    });
    return list;
}

/**
 * @param {array} pairs array of pair symbols (X-Y)
 */
_openOrders(pairs)
{
    let self = this;
    let arr = [];
    _.forEach(pairs, function (entry) {
        let p = self._limiterGlobal.schedule(function(){
            let pair = self._toExchangePair(entry);
            return self._restClient.openOrders({symbol:pair});
        });
        arr.push({promise:p, context:{exchange:'binance',api:'openOrders',pair:entry}});
    });
    return new Promise((resolve, reject) => {
        PromiseHelper.all(arr).then(function(data){
            let list = [];
            _.forEach(data, function (entry) {
                // could not retrieve order for this key
                if (!entry.success)
                {
                    return;
                }
                _.forEach(entry.value, function (order) {
                    // we only support LIMIT orders
                    if ('LIMIT' != order.type)
                    {
                        return;
                    }
                    list.push(order);
                });
            });
            resolve(self._formatOpenOrders(list));
        });
    });
}

/**
 * Returns open orders
 *
 * If opt.outputFormat is 'exchange' AND opt.pairs only contains one pair, the result returned by exchange will be returned unchanged
 *
 * [
 *     {
 *         "symbol":"BNBETH",
 *         "orderId":989273,
 *         "clientOrderId":"Xfs4XfHeXqHYycNB4s2PoT",
 *         "price":"0.00950000",
 *         "origQty":"250.00000000",
 *         "executedQty":"0.00000000",
 *         "status":"NEW",
 *         " timeInForce":"GTC",
 *         "type":"LIMIT",
 *         "side":"SELL",
 *         "stopPrice":"0.00000000",
 *         "icebergQty":"0.00000000",
 *         "time":1503564675740
 *     },...
 * ]
 *
 * Otherwise result will be as below
 *
 * {
 *     "Xfs4XfHeXqHYycNB4s2PoT":{
 *         "pair":"ETH-BNB",
 *         "orderType":"sell",
 *         "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
 *         "targetRate":0.0095,
 *         "quantity":250,
 *         "openTimestamp":1503564675,
 *         "targetPrice":2.375,
 *         "remainingQuantity":250
 *     },...
 * }
 *
 * @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (optional)
 * @return {Promise}
 */
openOrders(opt)
{
    let self = this;
    if (1 == opt.pairs.length && 'exchange' == opt.outputFormat)
    {
        return this._limiterGlobal.schedule(function(){
            let pair = self._toExchangePair(opt.pairs[0]);
            let p = self._restClient.openOrders({symbol:pair});
            return p;
        });
    }
    if (0 == opt.pairs.length)
    {
        return new Promise((resolve, reject) => {
            self.pairs({useCache:true}).then(function(data){
                let pairs = [];
                _.forEach(data, function (entry, pair) {
                    pairs.push(pair);
                });
                resolve(self._openOrders(pairs));
            }).catch(function(err){
                logger.error('Could not retrieve pairs : %s', err.msg);
                resolve({});
            });
        });
    }
    return self._openOrders(opt.pairs);
}

 /**
  * Returns a single open order
  *
  * Output format will be as below
  *
  * {
  *     "Xfs4XfHeXqHYycNB4s2PoT":{
  *         "pair":"ETH-BNB",
  *         "orderType":"sell",
  *         "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
  *         "targetRate":0.0095,
  *         "quantity":250,
  *         "openTimestamp":1503564675,
  *         "targetPrice":2.375,
  *         "remainingQuantity":250
  *     },...
  * }
  *
  * @param {string} opt.orderNumber identifier or the order to retrieve
  * @param {string} opt.pair order pair (optional)
  * @return {Promise}
  */
openOrder(opt)
{
    let self = this;
    // we don't know the pair for this order
    let pair = this._cachedOrders[opt.orderNumber];
    if (undefined !== pair)
    {
        pair = pair.pair;
    }
    else
    {
        // retrieve all open orders
        if (undefined === opt.pair)
        {
            return new Promise((resolve, reject) => {
                self.openOrders({outputFormat:'custom',pairs:[]}).then(function(list){
                    // order not found ?
                    if (undefined === list[opt.orderNumber])
                    {
                        resolve({});
                        return;
                    }
                    let result = {};
                    result[opt.orderNumber] = list[opt.orderNumber];
                    resolve(result);
                }).catch(function(err){
                    reject(err.msg);
                });
            });
        }
        else
        {
            pair = opt.pair;
        }
    }
    return new Promise((resolve, reject) => {
        let p = self._queryOrder(opt.orderNumber, pair, {'NEW':1,'PARTIALLY_FILLED':1});
        p.then(function(order){
            // order was not found
            if (null === order)
            {
                resolve({});
                return;
            }
            let list = self._formatOpenOrders([order]);
            // order is not open
            if (undefined === list[opt.orderNumber])
            {
                resolve({});
                return;
            }
            resolve(list);
        });
    });
}

/**
 * @param {array} data array as returned by openOrders exchange API
 */
_formatClosedOrders(data)
{
    let self = this;
    if (0 != data.length)
    {
        this._freeCachedOrders();
    }
    let list = {};
    let timestamp = parseInt(new Date().getTime() / 1000.0);
    _.forEach(data, function (entry) {
        let orderType;
        let pair =  self._toCustomPair(entry.symbol);
        self._cachedOrders[entry.clientOrderId] = {pair:pair,state:'closed',timestamp:timestamp};
        switch (entry.side)
        {
            case 'BUY':
                orderType = 'buy';
                break;
            case 'SELL':
                orderType = 'sell';
                break;
            // we only support buy/sell orders
            default:
                return;
        }
        let order = {
            pair:pair,
            orderType:orderType,
            orderNumber:entry.clientOrderId,
            actualRate:parseFloat(entry.price),
            quantity:parseFloat(entry.executedQty),
            closedTimestamp:parseFloat(entry.time / 1000.0)
        }
        order.actualPrice = parseFloat(new Big(order.actualRate).times(order.quantity));
        list[order.orderNumber] = order;
    });
    return list;
}

/**
 * @param {array} pairs array of pair symbols (X-Y)
 */
_closedOrders(pairs)
{
    let self = this;
    let arr = [];
    _.forEach(pairs, function (entry) {
        let p = self._limiterGlobal.schedule(function(){
            let pair = self._toExchangePair(entry);
            return self._restClient.allOrders({symbol:pair});
        });
        arr.push({promise:p, context:{exchange:'binance',api:'allOrders',pair:entry}});
    });
    return new Promise((resolve, reject) => {
        PromiseHelper.all(arr).then(function(data){
            let list = [];
            _.forEach(data, function (entry) {
                // could not retrieve order for this key
                if (!entry.success)
                {
                    return;
                }
                _.forEach(entry.value, function (order) {
                    // we only support LIMIT orders
                    if ('LIMIT' != order.type)
                    {
                        return;
                    }
                    // only keep filled OR canceled orders with qty != 0
                    switch (order.status)
                    {
                        case 'FILLED':
                            list.push(order);
                            break;
                        case 'CANCELED':
                            // accept canceled orders if qty != 0
                            if (0 != order.executedQty)
                            {
                                list.push(order);
                                break;
                            }
                        default:
                            return;
                    }
                });
            });
            resolve(self._formatClosedOrders(list));
        });
    });
}

/**
 * Returns closed orders
 *
 * If opt.outputFormat is 'exchange' AND opt.pairs only contains one pair, the result returned by exchange will be returned unchanged
 *
 * [
 *     {
 *         "symbol":"BNBETH",
 *         "orderId":308098,
 *         "clientOrderId":"wFqzWVr3QFbChRphOndNBG",
 *         "price":"0.00472143",
 *         "origQty":"1269.00000000",
 *         "executedQty":"1269.00000000",
 *         "status":"FILLED",
 *         "timeInForce":"GTC",
 *         "type":"LIMIT",
 *         "side":"BUY",
 *         "stopPrice":"0.00000000",
 *         "icebergQty":"0.00000000",
 *         "time":1502718468838
 *     },...
 * ]
 *
 * Otherwise result will be as below
 *
 * {
 *     "Xfs4XfHeXqHYycNB4s2PoT":{
 *         "pair":"ETH-BNB",
 *         "orderType":"sell",
 *         "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
 *         "targetRate":0.0095,
 *         "quantity":250,
 *         "openTimestamp":1503564675,
 *         "targetPrice":2.375,
 *         "remainingQuantity":250
 *     },...
 * }
 *
 * @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (optional)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
closedOrders(opt)
{
    let self = this;
    if (1 == opt.pairs.length && 'exchange' == opt.outputFormat)
    {
        return this._limiterGlobal.schedule(function(){
            return new Promise((resolve, reject) => {
                let pair = self._toExchangePair(opt.pairs[0]);
                let p = self._restClient.allOrders({symbol:pair});
                let list = [];
                p.then(function(data){
                    _.forEach(data, function (entry) {
                        // only keep filled OR canceled orders with qty != 0
                        switch (entry.status)
                        {
                            case 'FILLED':
                                list.push(entry);
                                break;
                            case 'CANCELED':
                                // accept canceled orders if qty != 0
                                if (0 != entry.executedQty)
                                {
                                    list.push(entry);
                                    break;
                                }
                            default:
                                return;
                        }
                    });
                    resolve(list);
                }).catch(function(err){
                    reject(err.msg);
                });
            });
        });
    }
    if (0 == opt.pairs.length)
    {
        return new Promise((resolve, reject) => {
            self.pairs({useCache:true}).then(function(data){
                let pairs = [];
                _.forEach(data, function (entry, pair) {
                    pairs.push(pair);
                });
                resolve(self._closedOrders(pairs));
            }).catch(function(err){
                logger.error('Could not retrieve pairs : %s', err.msg);
                resolve({});
            });
        });
    }
    return self._closedOrders(opt.pairs);
}

/**
 * Returns a single closed order
 *
 * Output format will be as below
 *
 * {
 *     "Xfs4XfHeXqHYycNB4s2PoT":{
 *         "pair":"ETH-BNB",
 *         "orderType":"sell",
 *         "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
 *         "actualRate":0.0095,
 *         "quantity":250,
 *         "closedTimestamp":1503564675,
 *         "actualPrice":2.375
 *     },...
 * }
 *
 * @param {string} opt.orderNumber identifier or the order to retrieve
 * @param {string} opt.pair order pair (optional)
 * @return {Promise}
 */
closedOrder(opt)
{
   let self = this;
   // we don't know the pair for this order
   let pair = this._cachedOrders[opt.orderNumber];
   if (undefined !== pair)
   {
       pair = pair.pair;
   }
   else
   {
       // retrieve all open orders
       if (undefined === opt.pair)
       {
           return new Promise((resolve, reject) => {
               self.closedOrders({outputFormat:'custom',pairs:[]}).then(function(list){
                   // order not found ?
                   if (undefined === list[opt.orderNumber])
                   {
                       resolve({});
                       return;
                   }
                   let result = {};
                   result[opt.orderNumber] = list[opt.orderNumber];
                   resolve(result);
               }).catch(function(err){
                   reject(err.msg);
               });
           });
       }
       else
       {
           pair = opt.pair;
       }
   }
   return new Promise((resolve, reject) => {
       let p = self._queryOrder(opt.orderNumber, pair, {'FILLED':1,'CANCELED':1});
       p.then(function(order){
           // order was not found
           if (null === order)
           {
               resolve({});
               return;
           }
           if ('CANCELED' == order.status)
           {
               // ignore canceled orders if qty == 0
               if (0 == order.executedQty)
               {
                   resolve({});
                   return;
               }
           }
           let list = self._formatClosedOrders([order]);
           // order is not open
           if (undefined === list[opt.orderNumber])
           {
               resolve({});
               return;
           }
           resolve(list);
       });
   });
}

/**
 * Creates a new order
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     symbol: 'QTUMBTC',
 *     orderId: 146789,
 *     clientOrderId: 'sPcSX5jTbNKsthiGBstRlw',
 *     transactTime: 1505409949340
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "orderNumber": "sPcSX5jTbNKsthiGBstRlw"
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to create order for
 * @param {string} opt.orderType (buy|sell) order type
 * @param {float} opt.quantity quantity to buy/sell
 * @param {float} opt.targetRate price per unit
 * @return {Promise} format depends on parameter opt.outputFormat
 */
addOrder(opt) {
    let self = this;
    return this._limiterGlobal.schedule(function(){
        // convert pair to remote format
        let pair = self._toExchangePair(opt.pair);
        let timestamp = new Date().getTime();
        let query = {
            symbol:pair,
            side:'BUY',
            type:'LIMIT',
            quantity:opt.quantity,
            price:opt.targetRate,
            timeInForce:'GTC',
            timestamp:timestamp
        };
        if ('sell' == opt.orderType)
        {
            query.side = 'SELL';
        }
        let p = self._restClient.newOrder(query);
        return new Promise((resolve, reject) => {
            p.then(function(data){
                // cache pair for this order
                self._cachedOrders[data.clientOrderId] = {pair:opt.pair,state:'open',timestamp:parseInt(timestamp)};
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(data);
                    return;
                }
                // only return order number
                let result = {
                    orderNumber:data.clientOrderId
                }
                resolve(result);
            }).catch(function(err){
                reject(err);
            });
        });
    });}

_cancelOrder(orderNumber,pair,outputFormat)
{
    let self = this;
    return this._limiterGlobal.schedule(function(){
        // convert pair to remote format
        let exchangePair = self._toExchangePair(pair);
        let query = {
            symbol:exchangePair,
            origClientOrderId:orderNumber
        };
        // we need to retrieve the fucking pair
        let p = self._restClient.cancelOrder(query);
        // return raw results by default
        if ('exchange' == outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                // return empty body
                let result = {}
                resolve(result);
            }).catch(function(err){
                reject(err);
            });
        });
    });
}

/**
 * Cancels an order
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     symbol: 'QTUMBTC',
 *     origClientOrderId: 'TtzziegEebZrQpzPMxITBq',
 *     orderId: 149965,
 *     clientOrderId: '50dybC3DRoSL6sATfm7PCU'
 * }
 *
 * If opt.outputFormat is 'custom', result will be an empty object
 *
 * {
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.orderNumber unique identifier of the order to cancel
 * @return {Promise} format depends on parameter opt.outputFormat
 */
cancelOrder(opt) {
    let self = this;
    // we don't know the pair for this order
    let pair = this._cachedOrders[opt.orderNumber];
    if (undefined !== pair)
    {
        pair = pair.pair;
    }
    else
    {
        // retrieve all open orders
        if (undefined === opt.pair)
        {
            return new Promise((resolve, reject) => {
                self.openOrders({outputFormat:'custom',pairs:[]}).then(function(list){
                    // order not found ?
                    if (undefined === list[opt.orderNumber])
                    {
                        reject('Order does not exist');
                        return;
                    }
                    resolve(self._cancelOrder(opt.orderNumber, list[opt.orderNumber].pair, opt.outputFormat));
                }).catch(function(err){
                    reject(err.msg);
                });
            });
        }
        else
        {
            pair = opt.pair;
        }
    }
    return self._cancelOrder(opt.orderNumber, pair, opt.outputFormat);
}

/**
 * Return balances
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":[
 *         {
 *             "Currency":"BCC",
 *             "Balance":0,
 *             "Available":0,
 *             "Pending":0,
 *             "CryptoAddress":null
 *         },
 *         {
 *             "Currency":"BTC",
 *             "Balance":0.73943812,
 *             "Available":0.73943812,
 *             "Pending":0,
 *             "CryptoAddress":"1AMM8oDfXxfGjLYH8pYRjZhBXRXE98WNt9r"
 *         },...
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below (currencies with a 0 balance will be filtered out)
 *
 * {
 *     "BTC":{
 *         "currency":"BTC",
 *         "total":0.73943812,
 *         "available":0.73943812,
 *         "onOrders":0
 *     },
 *     "NEO":{
 *         "currency":"NEO",
 *         "total":5.70415443,
 *         "available":5.70415443,
 *         "onOrders":0
 *     },...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.currencies used to retrieve balances for a list of currencies (optional)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
balances(opt)
{
    let self = this;
    return this._limiterGlobal.schedule(function(){
        let p = self._restClient.account();
        // return raw results by default
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {};
                let filteredList = {};
                if (undefined !== opt.currencies && 0 !== opt.currencies.length)
                {
                    _.forEach(opt.currencies, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(data.balances, function (value) {
                    // only keep the currencies we're interested in
                    if (undefined !== opt.currencies && undefined === filteredList[value.asset])
                    {
                        return;
                    }
                    let available = parseFloat(value.free);
                    let onOrders = parseFloat(value.locked);
                    let total = available + onOrders;
                    // ignore currency with 0 balance
                    if (0 == total)
                    {
                        return;
                    }
                    let b = {
                        currency:value.asset,
                        total:total,
                        available:available,
                        onOrders:onOrders
                    }
                    list[value.asset] = b;
                });
                resolve(list);
            }).catch(function(err){
                reject(err);
            });
        });
    });
}

}

module.exports = Exchange;
