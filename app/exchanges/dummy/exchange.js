"use strict";
const logger = require('winston');
const _ = require('lodash');
const Big = require('big.js');
const Errors = require('../../errors');
const HttpClient = require('./http-client');
const AbstractExchangeClass = require('../../abstract-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

const exchangeType = 'dummy';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    'pairs':{enabled:true},
    'tickers':{enabled:true, withoutPair:true}, 'wsTickers':{enabled:true,emulated:false},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true,emulated:false},
    'trades':{enabled:true}, 'wsTrades':{enabled:true,emulated:false},
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
    this._client = new HttpClient(exchangeId, baseHttpUri);
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
        data = await this._client.makeRequest('GET', 'pairs');
    }
    catch (e)
    {
        throw e;
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
_getTickers()
{
    return this._client.makeRequest('GET', 'tickers');
}

/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise}
 */
_getOrderBook(pair, opt)
{
    return this._client.makeRequest('GET', `orderBooks/${pair}`);
}

/**
 * Returns last trades
 *
 * @param {string} pair pair to retrieve trades for
 * @param {integer} opt.limit maximum number of entries (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise}
 */
_getTrades(pair, opt)
{
    return this._client.makeRequest('GET', `trades/${pair}`);
}

/**
 * Retrieve open orders for all pairs
 *
 * @return {Promise}
 */
_getOpenOrders()
{
    return this._client.makeRequest('GET', `openOrders`);
}

/**
 * Retrieve closed orders for all pairs
 *
 * @param {boolean} opt.completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise}
 */
_getClosedOrders(opt)
{
    return this._client.makeRequest('GET', `closedOrders`);
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

    try
    {
        let data = await this._client.makeRequest('POST', `openOrders`, {orderType:orderType, pair:pair, targetRate:targetRate, quantity:quantity});
        return data.orderNumber;
    }
    catch (e)
    {
        throw e;
    }
 }

 /**
  * Cancels an existing order
  *
  * @param {string} orderNumber number of the order to cancel
  * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
  * @return {Promise} Promise which will resolve to true in case of success
  */
_cancelOrder(orderNumber, pair)
{
    return this._client.makeRequest('DELETE', `openOrders/${orderNumber}`);
}

/**
 * Return balances for all currencies (currencies with balance = 0 should be filtered out)
 *
 * @return {Promise}
 */
_getBalances()
{
    return this._client.makeRequest('GET', `balances`);
}

}

module.exports = Exchange;
