"use strict";

const Api = require('poloniex-api-node');
const Bottleneck = require('bottleneck');
const _ = require('lodash');

class Exchange
{

constructor(config)
{
    this._client = new Api(config.exchanges.poloniex.key, config.exchanges.poloniex.secret);
    let wait = parseInt(1000 / config.exchanges.poloniex.throttle.publicApi.maxRequestsPerSecond);
    this._limiterPublic = new Bottleneck(config.exchanges.poloniex.throttle.publicApi.maxRequestsPerSecond, wait);
    wait = parseInt(1000 / config.exchanges.poloniex.throttle.tradingApi.maxRequestsPerSecond);
    this._limiterTrading = new Bottleneck(config.exchanges.poloniex.throttle.tradingApi.maxRequestsPerSecond, wait);
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
* Returns tickers
*
* Format of result depends on opt.outputFormat parameter
*
* If opt.outputFormat is 'exchange', the result returned by exchange will be returned unchanged
*
* {
*     "BTC_BCN":{
*         "id":7,
*         "last":"0.00000056",
*         "lowestAsk":"0.00000056",
*         "highestBid":"0.00000055",
*         "percentChange":"0.00000000",
*         "baseVolume":"87.33194286",
*         "quoteVolume":"154720180.28237054",
*         "isFrozen":"0",
*         "high24hr":"0.00000058",
*         "low24hr":"0.00000055"
*     },...
* }
*
* If opt.outputFormat is 'custom', the result will be as below
*
* {
*     "BTC-BCN":{
*         "pair":"BTC-BCN",
*         "last":5.5e-7,
*         "sell":5.6e-7,
*         "buy":5.5e-7,
*         "high":5.8e-7,
*         "low":5.5e-7,
*         "volume":156102499.96825832,
*         "timestamp":1501144180430
*     },...
* }
*
* @param {string} opt.outputFormat if value is 'exchange', response returned will be returned untouched
* @param {string} opt.pairs used to retrieve ticker for only a list of pairs (optional) (will be ignored if opt.outputFormat is exchange)
* @return {Promise} format depends on parameter opt.outputFormat
*/
tickers(opt)
{
    let self = this;
    return this._limiterPublic.schedule(function(){
        let p = self._client.returnTicker();
        // return raw results
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {};
                let filteredList = {};
                if (undefined !== opt.pairs && 0 !== opt.pairs.length)
                {
                    _.forEach(opt.pairs, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(data, function (value, key) {
                    // convert pair to custom format
                    let pair = self._toCustomPair(key);
                    // only keep the pair we're interested in
                    if (undefined !== opt.pairs && undefined === filteredList[pair])
                    {
                        return;
                    }
                    list[pair] = {
                        pair:pair,
                        last: parseFloat(value.last),
                        sell: parseFloat(value.lowestAsk),
                        buy: parseFloat(value.highestBid),
                        high: parseFloat(value.high24hr),
                        low: parseFloat(value.low24hr),
                        volume: parseFloat(value.quoteVolume),
                        timestamp: parseInt(new Date().getTime() / 1000.0)
                    }
                });
                resolve(list);
            }).catch(function(err){
                reject(err);
            });
        });
    });
}

/**
 * Returns existing pairs
 *
 * Format of result depends on parameter opt.outputFormat
 *
 * If opt.outputFormat is 'exchange', pairs will be returned using exchange format (ie: X_Y)
 *
 * {
 *     "X_Y":{
 *         "baseCurrency":"X",
 *         "currency":"Y"
 *     },...
 * }
 *
 * If opt.outputFormat is 'custom', pairs will be returned using custom format (ie: X-Y)
 *
 * {
 *     "X-Y":{
 *         "pair":"X-Y",
 *         "baseCurrency":"X",
 *         "currency":"Y"
 *     },...
 * }
 *
 * @param {string} opt.pair : retrieve a single pair (ex: BTC-ETH pair) (optional)
 * @param {string} opt.currency : retrieve only pairs having a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if pair is set)
 * @param {string} opt.baseCurrency : retrieve only pairs having a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if currency or pair are set)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
pairs(opt)
{
    let self = this;
    return this._limiterPublic.schedule(function(){
        let p = self._client.returnTicker();
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {}
                _.forEach(data, function (value, key) {
                    let arr = key.split('_');
                    let pair = arr[0] + '-' + arr[1];
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
                    list[pair] = {
                        pair:pair,
                        baseCurrency: arr[0],
                        currency: arr[1]
                    }
                });
                resolve(list);
            }).catch(function(err){
                reject(err);
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
 *     "asks":[
 *         ["0.07919999",21.60087589],
 *         ["0.07920000",306.69861098],
 *         ...
 *     ],
 *     "bids":[
 *         ["0.07917900",122.4966921],
 *         ["0.07915744",5.88],
 *         ...
 *     ]
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "buy":[
 *         {"rate":0.07917900,"quantity":122.4966921},
 *         {"rate":0.07915744,"quantity":5.88},
 *         ...
 *     ],
 *     "sell":[
 *         {"rate":0.07919999,"quantity":21.60087589},
 *         {"rate":0.07920000,"quantity":306.69861098},
 *         ...
 *     ]
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to retrieve order book for (X-Y)
 * @param {integer} opt.limit how many entries to retrieve from order book
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 orderBook(opt) {
    let self = this;
    // convert pair to remote format
    let pair = self._toExchangePair(opt.pair);
    return this._limiterPublic.schedule(function(){
        let p = self._client.returnOrderBook(pair, opt.limit);
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
                resolve(result);
            }).catch(function(err){
                reject(err);
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
 *     "BTC_AMP":[
 *         {
 *             "orderNumber":"27372196264",
 *             "type":"sell",
 *              "rate":"0.00021042",
 *              "startingAmount":"1004.12793858",
 *              "amount":"1004.12793858",
 *              "total":"0.21128860",
 *              "date":"2017-07-06 16:09:34",
 *              "margin":0
 *         },
 *         ...
 *     ],
 *     "BTC_ARDR":[],
 *     ...
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "27372196264": {
 *         "pair":"BTC-AMP"
 *         "orderType":"sell",
 *         "orderNumber":"27372196264",
 *         "quantity":1004.12793858,
 *         "remainingQuantity":1004.12793858,
 *         "targetRate":0.00021042,
 *         "targetPrice":0.2112886,
 *         "openTimestamp":1499350174
 *     },
 *     ...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned) (will be ignored if opt.outputFormat is exchange)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (will be ignored if opt.outputFormat is exchange)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
 openOrders(opt) {
    let self = this;
    return this._limiterTrading.schedule(function(){
        let p = self._client.returnOpenOrders('all');
        // return raw results by default
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {};
                let filteredList = {};
                if (undefined !== opt.pairs && 0 !== opt.pairs.length)
                {
                    _.forEach(opt.pairs, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                _.forEach(data, function (entries, key) {
                    // ignore pair if we don't have any entry
                    if (0 == entries.length)
                    {
                        return;
                    }
                    // convert pair to custom format
                    let pair = self._toCustomPair(key);
                    // only keep the pairs we're interested in
                    if (undefined !== opt.pairs && undefined === filteredList[pair])
                    {
                        return;
                    }
                    _.forEach(entries, function(entry) {
                        // only keep the order we're interested in
                        if (undefined !== opt.orderNumber && opt.orderNumber != entry.orderNumber)
                        {
                            return;
                        }
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
                            openTimestamp:parseInt(new Date(entry.date).getTime() / 1000.0)
                        }
                        list[o.orderNumber] = o;
                    });
                });
                resolve(list);
            }).catch(function(err){
                reject(err);
            });
        });
    });
}

/**
 * Format a list of trades
 *
 * Result will be as below
 *
 * {
 *     "119431400298":{
 *         "pair":"USDT-ETH",
 *         "orderNumber":"119431400298",
 *         "orderType":"sell",
 *         "quantity":0.7551751469,
 *         "actualRate":193.5,
 *         "actualPrice":146.1263909251,
 *         "closedTimestamp":1500488953
 *     },
 *     "27126940036":{
 *         "pair":"BTC-AMP",
 *         "orderNumber":"27126940036",
 *         "orderType":"buy",
 *         "quantity":697.02533491,
 *         "actualRate":0.00017535,
 *         "actualPrice":0.12222339,
 *         "closedTimestamp":1498939537
 *     },...
 * }
 * @param openOrders dictionary containing openOrders (as return by openOrders method) (used to ensure we only keep orders which are not open anymore)
 * @param data data returned by exchange {"pair":[]}
 * @param opt.pairs pairs we're interested in
 */
_formatClosedOrders(openOrders, data, opt)
{
    let self = this;
    // return a list using orderNumber as index
    let list = {};
    let filteredList = {};
    if (undefined !== opt.pairs && 0 !== opt.pairs.length)
    {
        _.forEach(opt.pairs, function(entry){
            filteredList[entry] = 1;
        });
    }
    _.forEach(data, function (entries, key) {
        // ignore pair if we don't have any entry
        if (0 == entries.length)
        {
            return;
        }
        // convert pair to custom format
        let pair = self._toCustomPair(key);
        // only keep the pairs we're interested in
        if (undefined !== opt.pairs && undefined === filteredList[pair])
        {
            return;
        }
        _.forEach(entries, function(entry) {
            // ignore order if it's still open
            if (undefined !== openOrders[entry.orderNumber])
            {
                return;
            }
            // order not in the list yet ?
            if (undefined === list[entry.orderNumber])
            {
                list[entry.orderNumber] = {
                    pair:pair,
                    orderNumber:entry.orderNumber,
                    orderType:entry.type,
                    quantity:0.0,
                    actualPrice:0.0
                }
            }
            // add/update timestamp
            let timestamp = parseInt(new Date(entry.date).getTime() / 1000.0);
            if (undefined === list[entry.orderNumber].closedTimestamp || timestamp > list[entry.orderNumber].closedTimestamp)
            {
                list[entry.orderNumber].closedTimestamp = timestamp;
            }
            let price = parseFloat(entry.total);
            list[entry.orderNumber].quantity += parseFloat(entry.amount);
            list[entry.orderNumber].actualPrice += price;
        });
    });
    // compute actualRate
    _.forEach(list, function (order, orderNumber) {
        order.actualRate = order.actualPrice / order.quantity;
    });
    return list;
}

/**
 * Returns closed orders for all pairs or a list of pairs
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched (it will always be a dictionary)
 *
 * {
 *      "USDT_ETH":[
 *          {
 *              "globalTradeID":194586565,
 *              "tradeID":"2797109",
 *              "date":"2017-07-19 20:29:17",
 *              "rate":"193.50000000",
 *              "amount":"0.6417567523",
 *              "total":"124.99315700",
 *              "fee":"0.00150000",
 *              "orderNumber":"119431400298",
 *              "type":"sell",
 *              "category":"exchange"
 *          },
 *          {
 *              "globalTradeID":194586524,
 *              "tradeID":"2797108",
 *              "date":"2017-07-19 20:29:13",
 *              "rate":"193.50000000",
 *              "amount":"0.114183946",
 *              "total":"21.64593551",
 *              "fee":"0.00150000",
 *              "orderNumber":"119431400298",
 *              "type":"sell",
 *              "category":"exchange"
 *          }
 *      ],
 *      "BTC_AMP":[
 *          {
 *              "globalTradeID":182176257,
 *              "tradeID":"1199779",
 *              "date":"2017-07-01 22:05:37",
 *              "rate":"0.00017535",
 *              "amount":"697.02533491",
 *              "total":"0.12222339",
 *              "fee":"0.00250000",
 *              "orderNumber":"27126940036",
 *              "type":"buy",
 *              "category":"exchange"
 *          }
 *      ],...
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "119431400298":{
 *         "pair":"USDT-ETH",
 *         "orderNumber":"119431400298",
 *         "orderType":"sell",
 *         "quantity":0.7551751469,
 *         "actualRate":193.5,
 *         "actualPrice":146.1263909251,
 *         "closedTimestamp":1500488953
 *     },
 *     "27126940036":{
 *         "pair":"BTC-AMP",
 *         "orderNumber":"27126940036",
 *         "orderType":"buy",
 *         "quantity":697.02533491,
 *         "actualRate":0.00017535,
 *         "actualPrice":0.12222339,
 *         "closedTimestamp":1498939537
 *     },...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {integer} opt.fromTimestamp unix timestamp when to start searching for completed orders
 * @param {integer} opt.toTimestamp unix timestamp when to stop searching for completed orders
 * @param {string} opt.pairs used to restrict results to only a list of pairs (will be ignored if opt.outputFormat is exchange)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
closedOrders(opt)
{
    let self = this;
    // first retrieve open orders to ignore orders which are still open
    return new Promise((resolve, reject) => {
        self.openOrders({outputFormat:'custom'}).then(function(openOrders){
            self._limiterTrading.schedule(function(){
                return self._client.returnMyTradeHistory('all', opt.fromTimestamp, opt.toTimestamp);
            }).then(function(data){
                // return raw result if we've been asked to
                if ('exchange' == opt.outputFormat)
                {
                    resolve(data);
                    return;
                }
                resolve(self._formatClosedOrders(openOrders, data, opt));
            }).catch(function(err){
                reject(err);
            });
        }).catch(function(err){
            reject(err);
        });
    });
}

/**
 * Returns closed orders for all pairs or a list of pairs
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched (it will always be a dictionary)
 *
 *
 * [
 *     {
 *         "globalTradeID":194586565,
 *         "currencyPair":"USDT_ETH",
 *         "tradeID":"2797109",
 *         "date":"2017-07-19 20:29:17",
 *         "rate":"193.50000000",
 *         "amount":"0.6417567523",
 *         "total":"124.99315700",
 *         "fee":"0.00150000",
 *         "type":"sell",
 *         "category":"exchange"
 *     },
 *     {
 *         "globalTradeID":194586524,
 *         "currencyPair":"USDT_ETH",
 *         "tradeID":"2797108",
 *         "date":"2017-07-19 20:29:13",
 *         "rate":"193.50000000",
 *         "amount":"0.114183946",
 *         "total":"21.64593551",
 *         "fee":"0.00150000",
 *         "type":"sell",
 *         "category":"exchange"
 *     }
 * ]
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "119431400298":{
 *         "pair":"USDT-ETH",
 *         "orderNumber":"119431400298",
 *         "orderType":"sell",
 *         "quantity":0.7551751469,
 *         "actualRate":193.5,
 *         "actualPrice":146.1263909251,
 *         "closedTimestamp":1500488953
 *     }
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.orderNumber order to retrieve
 * @return {Promise}
 */
closedOrder(opt)
{
    let self = this;
    // first retrieve open orders to ignore orders which are still open
    return new Promise((resolve, reject) => {
        self.openOrders({outputFormat:'custom'}).then(function(openOrders){
            self._limiterTrading.schedule(function(){
                return self._client.returnOrderTrades(opt.orderNumber);
            }).then(function(data){
                // return raw result if we've been asked to
                if ('exchange' == opt.outputFormat)
                {
                    resolve(data);
                    return;
                }
                let list = {};
                if (0 != data.length)
                {
                    // add orderNumber
                    _.forEach(data, function(entry) {
                        entry.orderNumber = opt.orderNumber;
                    });
                    list[data[0].currencyPair] = data;
                }
                resolve(self._formatClosedOrders(openOrders, list, opt));
            }).catch(function(err){
                // just return an empty dict if order does not exist
                if (undefined !== err.message && err.message.startsWith('Order not found') && 'custom' == opt.outputFormat)
                {
                    resolve({});
                    return;
                }
                reject(err);
            });
        }).catch(function(err){
            reject(err);
        });
    });
}

/**
 * Creates a new order
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "orderNumber": "122559296172",
 *     "resultingTrades": []
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below
 *
 * {
 *     "orderNumber": "122559296172"
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.pair pair to create order for (X-Y)
 * @param {string} opt.orderType (buy|sell) order type
 * @param {float} opt.quantity quantity to buy/sell
 * @param {float} opt.targetRate price per unit
 * @return {Promise} format depends on parameter opt.outputFormat
 */
addOrder(opt) {
    let self = this;
    return this._limiterTrading.schedule(function(){
        // convert pair to remote format
        let pair = self._toExchangePair(opt.pair);
        let p;
        if ('buy' == opt.orderType)
        {
            p = self._client.buy(pair, opt.targetRate, opt.quantity);
        }
        else
        {
            p = self._client.sell(pair, opt.targetRate, opt.quantity);
        }
        // return raw results by default
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                // only return order number
                let result = {
                    orderNumber:data.orderNumber
                }
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
 *     "success":1,
 *     "amount":"1.00000000",
 *     "message":"Order #123047949039 canceled."
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
    return this._limiterTrading.schedule(function(){
        let p = self._client.cancelOrder(opt.orderNumber);
        // return raw results by default
        if ('exchange' == opt.outputFormat)
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
 * Return balances
 *
 * If opt.outputFormat is 'exchange', the result returned by remote exchange will be returned untouched
 *
 * {
 *     "1CR":{
 *         "available":"0.00000000",
 *         "onOrders":"0.00000000",
 *         "btcValue":"0.00000000"
 *     },
 *     "ABY":{
 *         "available":"0.00000000",
 *         "onOrders":"0.00000000",
 *         "btcValue":"0.00000000"
 *     },...
 * }
 *
 * If opt.outputFormat is 'custom', the result will be as below (currencies with a 0 balance will be filtered out)
 *
 * {
 *     "AMP":{
 *         "currency":"AMP",
 *         "total":1004.12793858,
 *         "available":0,
 *         "onOrders":1004.12793858
 *     },
 *     "BTC":{
 *         "currency":"BTC",
 *         "total":0.00001557,
 *         "available":0.00001557,
 *         "onOrders":0
 *     },...
 * }
 *
 * @param {string} opt.outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched
 * @param {string} opt.currency used to retrieve balance for a single currency (optional)
 * @return {Promise} format depends on parameter opt.outputFormat
 */
balances(opt) {
    let self = this;
    return this._limiterTrading.schedule(function(){
        let p = self._client.returnCompleteBalances();
        // return raw results by default
        if ('exchange' == opt.outputFormat)
        {
            return p;
        }
        return new Promise((resolve, reject) => {
            p.then(function(data){
                let list = {};
                _.forEach(data, function (value, key) {
                    // only keep the currency we're interested in
                    if (undefined !== opt.currency && opt.currency != key)
                    {
                        return;
                    }
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
                resolve(list);
            }).catch(function(err){
                reject(err);
            });
        });
    });
}

}

module.exports = Exchange;
