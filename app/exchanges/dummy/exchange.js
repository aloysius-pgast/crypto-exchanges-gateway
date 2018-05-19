"use strict";
const logger = require('winston');
const _ = require('lodash');
const Big = require('big.js');
const Errors = require('../../errors');
const HttpClient = require('crypto-exchanges-http-client');
const AbstractExchangeClass = require('../../abstract-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

const exchangeType = 'dummy';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    'pairs':{enabled:true},
    'tickers':{enabled:true, withoutPair:true}, 'wsTickers':{enabled:true},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true},
    'trades':{enabled:true}, 'wsTrades':{enabled:true},
    'klines':{enabled:false}, 'wsKlines':{enabled:false},
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
    let baseHttpUri = config.exchanges[exchangeId].baseHttpUri;
    let baseWsUri = config.exchanges[exchangeId].baseWsUri
    this._client = new HttpClient(baseHttpUri);
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
}

/**
 * Returns all active pairs
 *
 * @return {Promise}
 */
async _getPairs()
{
    let data;
    try
    {
        data = await this._client.pairs('dummy');
    }
    catch (e)
    {
        console.log(e);
        throw new Errors.ExchangeError.NetworkError.UnknownError(this.getId(), e);
    }
    let list = {};
    // same limits for all pairs
    let limits = this._getDefaultLimits();
    _.forEach(data, function (entry) {
        list[entry.pair] = {
            pair:entry.pair,
            baseCurrency: entry.baseCurrency,
            currency: entry.currency,
            limits:limits
        }
    });
    return list;
}

/**
 * Retrieve tickers for all pairs
 *
 * @return {Promise}
 */
async _getTickers()
{
    let data;
    try
    {
        data = await this._client.tickers('dummy');
    }
    catch (e)
    {
        throw new Errors.ExchangeError.NetworkError.UnknownError(this.getId(), e);
    }
    return data;
}

/**
 * Returns order book
 *
 * Result will be as below
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
 * @param {string} opt.pair pair to retrieve order book for (X-Y)
 * @return {Promise}
 */
orderBook(opt) {
    return this._client.orderBook('dummy', opt.pair);
}

/**
 * Returns last trades
 *
 * Result will be as below
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
 * @param {integer} opt.afterTradeId only retrieve trade with an ID > opt.afterTradeId (optional)
 * @param {string} opt.pair pair to retrieve trades for (X-Y)
 * @return {Promise}
 */
trades(opt) {
    return this._client.trades('dummy', opt.pair, opt.afterTradeId);
}

/**
 * Returns open orders
 *
 * Result will be as below
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
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned)
 * @param {string} opt.pairs used to restrict results to only a list of pairs
 * @return {Promise}
 */
openOrders(opt) {
    if (undefined !== opt.orderNumber)
    {
        return this._client.openOrder('dummy', opt.orderNumber);
    }
    return this._client.openOrders('dummy', opt.pairs);
}

/**
 * Returns closed orders
 *
 * Result will be as below
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
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned)
 * @param {string} opt.pairs used to restrict results to only a list of pairs
 * @return {Promise}
 */
closedOrders(opt)
{
    if (undefined !== opt.orderNumber)
    {
        return this._client.closedOrder('dummy', opt.orderNumber);
    }
    return this._client.closedOrders('dummy', opt.pairs);
}

/**
 * Creates a new order
 *
 * Result will be as below
 *
 * {
 *     "orderNumber": "103b190f-0ff8-4418-9377-7b8bcbcdf1ec"
 * }
 *
 * @param {string} opt.pair pair to create order for
 * @param {string} opt.orderType (buy|sell) order type
 * @param {float} opt.quantity quantity to buy/sell
 * @param {float} opt.targetRate price per unit
 * @return {Promise}
 */
addOrder(opt) {
    return this._client.newOrder('dummy', opt.pair, opt.orderType, opt.quantity, opt.targetRate);
}

/**
 * Cancels an order
 *
 * Result will be an empty object
 *
 * {
 * }
 *
 * @param {string} opt.orderNumber unique identifier of the order to cancel
 * @return {Promise}
 */
cancelOrder(opt) {
    return this._client.cancelOrder('dummy', opt.orderNumber);
}

/**
 * Return balances
 *
 * Result will be as below (currencies with a 0 balance will be filtered out)
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
 * @param {string} opt.currencies used to retrieve balances for a list of currencies (optional)
 * @return {Promise}
 */
balances(opt)
{
    if (undefined !== opt.currencies)
    {
        return this._client.balance('dummy', opt.currencies[0]);
    }
    return this._client.balances('dummy');
}

}

module.exports = Exchange;
