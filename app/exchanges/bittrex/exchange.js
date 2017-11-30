"use strict";
const Bottleneck = require('bottleneck');
const _ = require('lodash');
const Big = require('big.js');
const AbstractExchangeClass = require('../../abstract-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

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
    this._client = require('node-bittrex-api');
    let opt = {
        apikey:config.exchanges.bittrex.key,
        apisecret:config.exchanges.bittrex.secret,
        verbose:false,
        stream:false,
        cleartext:false
    };
    this._client.options(opt);
    this._limiterLowIntensity = new Bottleneck(1, config.exchanges.bittrex.throttle.lowIntensity.minPeriod * 1000);
    this._limiterMediumIntensity = new Bottleneck(1, config.exchanges.bittrex.throttle.mediumIntensity.minPeriod * 1000);
    this._limiterHighIntensity = new Bottleneck(1, config.exchanges.bittrex.throttle.highIntensity.minPeriod * 1000);
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
}

/**
* Returns ticker for all currencies
*
* Format of result depends on opt.outputFormat parameter
*
* If opt.outputFormat is 'exchange', the result returned by exchange will be returned unchanged
*
* {
*     "success":true,
*     "message":"",
*     "result":[
*         {
*             "MarketName":"BITCNY-BTC",
*             "High":23400.00099998,
*             "Low":21000.03,
*             "Volume":2.13098225,
*             "Last":22499.99999078,
*             "BaseVolume":47823.64813412,
*             "TimeStamp":"2017-08-07T15:47:03.217",
*             "Bid":21802.22000043,
*             "Ask":22499.99999078,
*             "OpenBuyOrders":460,
*             "OpenSellOrders":49,
*             "PrevDay":22900,
*             "Created":"2015-12-11T06:31:40.653"
*         },...
*     ]
* }
*
* If opt.outputFormat is 'custom', the result will be as below
*
* {
*     "BITCNY-BTC":{
*         "pair":"BITCNY-BTC",
*         "last":21802.21999999,
*         "priceChangePercent":2.5,
*         "sell":21802.21999999,
*         "buy":21802.20000021,
*         "high":23400.00099998,
*         "low":21000.03,
*         "volume":2.12833311,
*         "timestamp":1502120848.53
*      },...
* }
*
* @param {string} opt.outputFormat if value is 'exchange', response returned will be returned untouched
* @param {string} opt.pairs used to retrieve ticker for only a list of pairs (optional) (will be ignored if opt.outputFormat is exchange)
* @return {Promise} format depends on parameter opt.outputFormat
*/
tickers(opt)
{
    let self = this;
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getmarketsummaries((response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                let list = {};
                let filteredList = {};
                if (undefined !== opt.pairs && 0 !== opt.pairs.length)
                {
                    _.forEach(opt.pairs, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(response.result, function (entry) {
                    // only keep the pairs we're interested in
                    if (undefined !== opt.pairs && undefined === filteredList[entry.MarketName])
                    {
                        return;
                    }
                    let last = parseFloat(entry.Last);
                    let previousDay = parseFloat(entry.PrevDay);
                    let percentChange = 0;
                    if (previousDay > 0)
                    {
                        percentChange = ((last/previousDay) - 1) * 100;
                    }
                    list[entry.MarketName] = {
                        pair:entry.MarketName,
                        last: last,
                        priceChangePercent:percentChange,
                        sell: parseFloat(entry.Ask),
                        buy: parseFloat(entry.Bid),
                        high: parseFloat(entry.High),
                        low: parseFloat(entry.Low),
                        volume: parseFloat(entry.Volume),
                        timestamp: parseFloat(new Date(entry.TimeStamp).getTime() / 1000.0)
                    }
                });
                resolve(list);
            });
        });
    });
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
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getmarketsummaries((response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                let list = {}
                _.forEach(response.result, function (entry) {
                    let arr = entry.MarketName.split('-');
                    if (undefined !== opt.pair)
                    {
                        // ignore this pair
                        if (opt.pair != entry.MarketName)
                        {
                            return;
                        }
                    }
                    else if (undefined !== opt.currency)
                    {
                        // ignore this pair
                        if (opt.currency != arr[1])
                        {
                            return;
                        }
                    }
                    else if (undefined !== opt.baseCurrency)
                    {
                        // ignore this pair
                        if (opt.baseCurrency != arr[0])
                        {
                            return;
                        }
                    }
                    list[entry.MarketName] = {
                        pair:entry.MarketName,
                        baseCurrency: arr[0],
                        currency: arr[1]
                    }
                });
                if (updateCache)
                {
                    self._cachedPairs.cache = list;
                    self._cachedPairs.lastTimestamp = timestamp;
                    self._cachedPairs.nextTimestamp = timestamp + self._cachedPairs.cachePeriod;
                }
                resolve(list);
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
 *     "success":true,
 *     "message":"",
 *     "result":{
 *         "buy":[
 *             {
 *                 "Quantity":0.006,
 *                 "Rate":271.66292
 *             },
 *             {
 *                 "Quantity":96.61178755,
 *                 "Rate":269.65000001
 *             },...
 *         ],
 *         "sell":[
 *             {
 *                 "Quantity":0.01537121,
 *                 "Rate":271.663
 *             },
 *             {
 *                 "Quantity":15.52871902,
 *                 "Rate":271.999
 *             },...
 *         ]
 *     }
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "buy":[
 *         {
 *             "quantity":0.006,
 *             "rate":271.66292
 *         },
 *         {
 *             "quantity":96.61178755,
 *             "rate":269.65000001
 *         },...
 *     ],
 *     "sell":[
 *         {
 *             "quantity":0.01537121,
 *             "rate":271.663
 *         },
 *         {
 *             "quantity":15.52871902,
 *             "rate":271.999
 *         },...
 *     ]
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to retrieve order book for (X-Y)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 orderBook(opt) {
    let self = this;
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getorderbook({market:opt.pair, type:'both'}, (response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                let result = {
                    buy:_.map(response.result.buy, entry => {
                        return {
                            rate:parseFloat(entry.Rate),
                            quantity:parseFloat(entry.Quantity)
                        }
                    }),
                    sell:_.map(response.result.sell, entry => {
                        return {
                            rate:parseFloat(entry.Rate),
                            quantity:parseFloat(entry.Quantity)
                        }
                    })
                }
                resolve(result);
            });
        });
    });
}

/**
 * Returns last trades
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":[
 *         {
 *             "Id":113534543,
 *             "TimeStamp":"2017-09-18T09:24:55.777",
 *             "Quantity":0.01735772,
 *             "Price":0.0732,
 *             "Total":0.00127058,
 *             "FillType":"PARTIAL_FILL",
 *             "OrderType":"SELL"
 *          },
 *          {
 *             "Id":113534540,
 *             "TimeStamp":"2017-09-18T09:24:55.37",
 *             "Quantity":0.01003977,
 *             "Price":0.0732,
 *             "Total":0.00073491,
 *             "FillType":"PARTIAL_FILL",
 *             "OrderType":"SELL"
 *         },...
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * [
 *     {
 *         "id":113534972,
 *         "quantity":0.19996545,
 *         "rate":0.07320996,
 *         "price":0.01463946,
 *         "orderType":"sell",
 *         "timestamp":1505726820.53
 *     },
 *     {
 *         "id":113534957,
 *         "quantity":0.14025718,
 *         "rate":0.07320997,
 *         "price":0.01026822,
 *         "orderType":"buy",
 *         "timestamp":1505726816.57
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
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getmarkethistory({market:opt.pair}, (response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                let list = [];
                _.forEach(response.result, function(entry){
                    // only keep trades with an ID > afterTradeId
                    if (undefined !== opt.afterTradeId)
                    {
                        if (entry.Id <= opt.afterTradeId)
                        {
                            return;
                        }
                    }
                    let orderType = 'sell';
                    if ('BUY' == entry.OrderType)
                    {
                        orderType = 'buy';
                    }
                    list.push({
                        id:entry.Id,
                        quantity:entry.Quantity,
                        rate:entry.Price,
                        price:entry.Total,
                        orderType:orderType,
                        timestamp:parseFloat(new Date(entry.TimeStamp).getTime() / 1000.0)
                    })
                });
                resolve(list);
            });
        });
    });
}

/**
 * Returns open orders
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":[
 *         {
 *             "Uuid":null,
 *              "OrderUuid":"14250e18-ac45-4742-9647-5ee3d5acc6b1",
 *              "Exchange":"BTC-WAVES",
 *              "OrderType":"LIMIT_SELL",
 *              "Quantity":110.80552162,
 *              "QuantityRemaining":110.80552162,
 *              "Limit":0.00248,
 *              "CommissionPaid":0,
 *              "Price":0,
 *              "PricePerUnit":null,
 *              "Opened":"2017-07-01T21:46:18.653",
 *              "Closed":null,
 *              "CancelInitiated":false,
 *              "ImmediateOrCancel":false,
 *              "IsConditional":false,
 *              "Condition":"NONE",
 *              "ConditionTarget":null
 *       },
 *       {
 *              "Uuid":null,
 *              "OrderUuid":"d3af561a-c3ac-4452-bf0e-a32854b558e5",
 *              "Exchange":"USDT-NEO",
 *              "OrderType":"LIMIT_BUY",
 *              "Quantity":2.33488048,
 *              "QuantityRemaining":2.33488048,
 *              "Limit":12,
 *              "CommissionPaid":0,
 *              "Price":0,
 *              "PricePerUnit":null,
 *              "Opened":"2017-08-07T08:43:58.45",
 *              "Closed":null,
 *              "CancelInitiated":false,
 *              "ImmediateOrCancel":false,
 *              "IsConditional":false,
 *              "Condition":"NONE",
 *              "ConditionTarget":null
 *          },...
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "14250e18-ac45-4742-9647-5ee3d5acc6b1":{
 *         "pair":"BTC-WAVES",
 *         "orderType":"sell",
 *         "orderNumber":"14250e18-ac45-4742-9647-5ee3d5acc6b1",
 *         "targetRate":0.00248,
 *         "quantity":110.80552162,
 *         "remainingQuantity":110.80552162,
 *         "openTimestamp":1498945578.53,
 *         "targetPrice":0.2747976936176
 *     },
 *     "d3af561a-c3ac-4452-bf0e-a32854b558e5":{
 *         "pair":"USDT-NEO",
 *         "orderType":"buy",
 *         "orderNumber":"d3af561a-c3ac-4452-bf0e-a32854b558e5",
 *         "targetRate":12,
 *         "quantity":2.33488048,
 *         "remainingQuantity":2.33488048,
 *         "openTimestamp":1502095438.57,
 *         "targetPrice":28.01856576
 *     },...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned) (will be ignored if opt.outputFormat is exchange)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (will be ignored if opt.outputFormat is exchange)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 openOrders(opt) {
     let self = this;
     // we're using low intensity limiter but there is no official answer on this
     return this._limiterLowIntensity.schedule(function(){
         return new Promise((resolve, reject) => {
             self._client.getopenorders({}, (response, error) => {
                 if (null !== error)
                 {
                     reject(error.message);
                     return;
                 }
                 // return raw results
                 if ('exchange' == opt.outputFormat)
                 {
                     resolve(response);
                     return;
                 }
                 let list = {};
                 let filteredList = {};
                 if (undefined !== opt.pairs && 0 !== opt.pairs.length)
                 {
                     _.forEach(opt.pairs, function(entry){
                         filteredList[entry] = 1;
                     });
                 }
                 _.forEach(response.result, function(entry) {
                     // only keep the order we're interested in
                     if (undefined !== opt.orderNumber && opt.orderNumber != entry.OrderUuid)
                     {
                         return;
                     }
                     if (undefined !== opt.pairs && undefined === filteredList[entry.Exchange])
                     {
                         return;
                     }
                     let orderType;
                     // we only support buy or sell orders
                     switch (entry.OrderType)
                     {
                         case 'LIMIT_BUY':
                             orderType = 'buy';
                             break;
                         case 'LIMIT_SELL':
                             orderType = 'sell';
                             break;
                         default:
                             return;
                     }
                     let o = {
                         pair:entry.Exchange,
                         orderType:orderType,
                         orderNumber:entry.OrderUuid,
                         targetRate:parseFloat(entry.Limit),
                         quantity:parseFloat(entry.Quantity),
                         remainingQuantity:parseFloat(entry.QuantityRemaining),
                         openTimestamp:parseFloat(new Date(entry.Opened).getTime() / 1000.0)
                     }
                     // define targetPrice based on quantity & targetRate
                     o.targetPrice = parseFloat(new Big(o.quantity).times(o.targetRate));
                     list[o.orderNumber] = o;
                 });
                 resolve(list);
             });
         });
     });
}

/**
 * Returns closed orders
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":[
 *         {
 *             "OrderUuid":"dee7c058-3f48-4e6c-bb69-e54d7faf9f98",
 *             "Exchange":"USDT-NEO",
 *             "TimeStamp":"2017-08-07T08:38:37.353",
 *             "OrderType":"LIMIT_SELL",
 *             "Limit":20,
 *             "Quantity":5.00033725,
 *             "QuantityRemaining":0,
 *             "Commission":0.250004801,
 *             "Price":100.19204559,
 *             "PricePerUnit":20.0003706,
 *             "IsConditional":false,
 *             "Condition":"NONE",
 *             "ConditionTarget":null,
 *             "ImmediateOrCancel":false,
 *             "Closed":"2017-08-07T08:38:37.947"
 *         },
 *         {
 *             "OrderUuid":"62d4368c-4363-4c9e-b992-9852189141eb",
 *             "Exchange":"USDT-ANS",
 *             "TimeStamp":"2017-08-06T22:31:05.44",
 *             "OrderType":"LIMIT_SELL",
 *             "Limit":16.11,
 *             "Quantity":2.4927,
 *             "QuantityRemaining":0,
 *             "Commission":0.1005181274,
 *             "Price":40.72509999,
 *             "PricePerUnit":16.12999999,
 *             "IsConditional":false,
 *             "Condition":"NONE",
 *             "ConditionTarget":null,
 *             "ImmediateOrCancel":false,
 *             "Closed":"2017-08-06T22:31:05.61"
 *         }
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "dee7c058-3f48-4e6c-bb69-e54d7faf9f98":{
 *         "pair":"USDT-NEO",
 *         "orderNumber":"dee7c058-3f48-4e6c-bb69-e54d7faf9f98",
 *         "orderType":"sell",
 *         "quantity":5.00033725,
 *         "actualPrice":100.19204559,
 *         "actualRate":20.0003706,
 *         "closedTimestamp":1500488953,
 *     },
 *     "62d4368c-4363-4c9e-b992-9852189141eb":{
 *         "pair":"USDT-ANS",
 *         "orderNumber":"62d4368c-4363-4c9e-b992-9852189141eb",
 *         "orderType":"buy",
 *         "quantity":2.4927,
 *         "actualPrice":40.72509999,
 *         "actualRate":16.12999999
 *         "closedTimestamp":1498939537
 *     },...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned) (will be ignored if opt.outputFormat is exchange)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (will be ignored if opt.outputFormat is exchange)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
closedOrders(opt)
{
    let self = this;
    // all account/* methods are supposed to be throttled to 1 request / 10s
    return this._limiterMediumIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getorderhistory({}, (response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                let list = {};
                let filteredList = {};
                if (undefined !== opt.pairs && 0 !== opt.pairs.length)
                {
                    _.forEach(opt.pairs, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(response.result, function(entry) {
                    // only keep the order we're interested in
                    if (undefined !== opt.orderNumber && opt.orderNumber != entry.OrderUuid)
                    {
                        return;
                    }
                    if (undefined !== opt.pairs && undefined === filteredList[entry.Exchange])
                    {
                        return;
                    }
                    let orderType;
                    // we only support buy or sell orders
                    switch (entry.OrderType)
                    {
                        case 'LIMIT_BUY':
                            orderType = 'buy';
                            break;
                        case 'LIMIT_SELL':
                            orderType = 'sell';
                            break;
                        default:
                            return;
                    }
                    let o = {
                        pair:entry.Exchange,
                        orderNumber:entry.OrderUuid,
                        orderType:orderType,
                        quantity:parseFloat(entry.Quantity),
                        actualRate:parseFloat(entry.PricePerUnit),
                        actualPrice:parseFloat(entry.Price),
                        closedTimestamp:parseFloat(new Date(entry.Closed).getTime() / 1000.0)
                    }
                    list[o.orderNumber] = o;
                });
                resolve(list);
            });
        });
    });
}

/**
 * Creates a new order
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":{
 *         "uuid":"3ec3d53f-70d6-4ee8-b92c-224d62dcf95d"
 *     }
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "orderNumber": "103b190f-0ff8-4418-9377-7b8bcbcdf1ec"
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
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            let params = {
                market:opt.pair,
                quantity:opt.quantity,
                rate:opt.targetRate
            }
            // buy order
            if ('buy' == opt.orderType)
            {
                self._client.buylimit(params, (response, error) => {
                    if (null !== error)
                    {
                        reject(error.message);
                        return;
                    }
                    // return raw results
                    if ('exchange' == opt.outputFormat)
                    {
                        resolve(response);
                        return;
                    }
                    // only return order number
                    let result = {
                        orderNumber:response.result.uuid
                    }
                    resolve(result);
                });
            }
            // sell order
            else
            {
                self._client.selllimit(params, (response, error) => {
                    if (null !== error)
                    {
                        reject(error.message);
                        return;
                    }
                    // return raw results
                    if ('exchange' == opt.outputFormat)
                    {
                        resolve(response);
                        return;
                    }
                    // only return order number
                    let result = {
                        orderNumber:response.result.uuid
                    }
                    resolve(result);
                });
            }
        });
    });
}

/**
 * Cancels an order
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "success":true,
 *     "message":"",
 *     "result":null
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
    // we're using low intensity limiter but there is no official answer on this
    return this._limiterLowIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.cancel({uuid:opt.orderNumber}, (response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                // return empty body
                let result = {}
                resolve(result);
            });
        });
    });
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
    // all account/* methods are supposed to be throttled to 1 request / 10s
    return this._limiterMediumIntensity.schedule(function(){
        return new Promise((resolve, reject) => {
            self._client.getbalances((response, error) => {
                if (null !== error)
                {
                    reject(error.message);
                    return;
                }
                // return raw results
                if ('exchange' == opt.outputFormat)
                {
                    resolve(response);
                    return;
                }
                let list = {};
                let filteredList = {};
                if (undefined !== opt.currencies && 0 !== opt.currencies.length)
                {
                    _.forEach(opt.currencies, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(response.result, function(entry) {
                    // only keep the currencies we're interested in
                    if (undefined !== opt.currencies && undefined === filteredList[entry.Currency])
                    {
                        return;
                    }
                    // ignore currency with 0 balance
                    let total = parseFloat(entry.Balance);
                    if (0 == total)
                    {
                        return;
                    }
                    let available = parseFloat(entry.Available);
                    let onOrders = total - available;
                    let b = {
                        currency:entry.Currency,
                        total:total,
                        available:available,
                        onOrders:onOrders
                    }
                    list[entry.Currency] = b;
                });
                resolve(list);
            });
        });
    });
}

}

module.exports = Exchange;
