"use strict";
const logger = require('winston');
const _ = require('lodash');
const Errors = require('../../errors');
const CcxtErrors = require('../../ccxt-errors');
const CcxtClient = require('./ccxt-client');
const AbstractCcxtExchangeClass = require('../../abstract-ccxt-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

const exchangeType = 'okex';

// default limit when retrieving trades (this is the maximum for OKEx)
const TRADES_DEFAULT_LIMIT = 600;

// default limit when retrieving order book (this is the maximum for OKEx)
const ORDER_BOOK_DEFAULT_LIMIT = 200;

// maximum number of closed orders we can request at once
const CLOSED_ORDERS_LIMIT_PER_ITER = 200;


// list of possible interval for klines
/*
8h & 3d have been removed since they don't seem to be supported

https://www.okex.com/api/v1/kline.do?symbol=neo_btc&type=8hour => {"error_code":1025} (No chart type)
https://www.okex.com/api/v1/kline.do?symbol=neo_btc&type=3day => {"error_code":1025} (No chart type)

*/
const supportedKlinesIntervals = [
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '12h',
  '1d',
  '1w'
]
const defaultKlinesInterval = '5m';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    'pairs':{enabled:true},
    'tickers':{enabled:true, withoutPair:false}, 'wsTickers':{enabled:true, emulated:false},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true, emulated:false},
    'trades':{enabled:true}, 'wsTrades':{enabled:true, emulated:false},
    'klines':{enabled:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval}, 'wsKlines':{enabled:true,emulated:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval},
    'orders':{enabled:true, withoutPair:false},
    'openOrders':{enabled:true, withoutPair:false},
    'closedOrders':{enabled:true, withoutPair:false, completeHistory:true},
    'balances':{enabled:true, withoutCurrency:true}
};

class Exchange extends AbstractCcxtExchangeClass
{

/**
 * Constructor
 *
 * @param {string} exchangeId exchange identifier (ex: okex)
 * @param {string} exchangeName exchange name (ex: OKEx)
 * @param {object} config full config object
 */
constructor(exchangeId, exchangeName, config)
{
    let opt = AbstractCcxtExchangeClass.getCcxtOpt(exchangeId, config, {
        options:{warnOnFetchOHLCVLimitArgument:false},
        fetchOrderBookWarning:false
    });
    let client = new CcxtClient('okex', opt);
    super(exchangeId, exchangeType, exchangeName, supportedFeatures, config, client);
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
}

async _getPairs()
{
    let list = {};
    // ignore futures (ie: baseCurrency == USD)
    _.forEach(await super._getPairs(), (e, pair) => {
        if ('USD' == e.baseCurrency)
        {
            return;
        }
        list[pair] = e;
    });
    return list;
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
 * Returns the default value for trades limit
 * @return {integer}
 */
getDefaultTradesLimit()
{
    return TRADES_DEFAULT_LIMIT;
}

/**
 * Retrieve open orders for a single pair

 * @param {string} pair pair to retrieve open orders for
 * @return {Promise}
 */
async _getOpenOrdersForPair(pair)
{
    let data;
    try
    {
        data = await super._getOpenOrdersForPair(pair);
    }
    catch (e)
    {
        throw e;
    }
    // update cached orders
    _.forEach(data, (order, orderNumber) => {
        this._cacheOrder(orderNumber, order.orderType, order.pair, 'open');
    });
    return data;
}

/**
 * Retrieve closed orders for a single pair

 * @param {string} pair pair to retrieve closed orders for
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to an object such as below
 */
async _getClosedOrdersForPair(pair, completeHistory)
{
    let data;
    try
    {
        data = await super._getClosedOrdersForPair(pair);
    }
    catch (e)
    {
        throw e;
    }
    // update cached orders
    _.forEach(data, (order, orderNumber) => {
        this._cacheOrder(orderNumber, order.orderType, order.pair, 'closed');
    });
    return data;
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
    let data;
    try
    {
        data = await super._getOrder(orderNumber, pair);
    }
    catch (e)
    {
        throw e;
    }
    // update cached orders
    let orderState = 'closed';
    if (data.hasOwnProperty('remaining'))
    {
        orderState = 'open';
    }
    // update cached orders
    this._cacheOrder(orderNumber, data.orderType, pair, orderState);
    return data;
}

/**
 * Creates a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to buy/sell
 * @param {float} targetRate expected buy/sell price
 * @param {float} quantity quantity to buy/sell
 * @return {Promise}
 */
async _createOrder(orderType, pair, targetRate, quantity)
{
    let orderNumber;
    try
    {
        orderNumber = await super._createOrder(orderType, pair, targetRate, quantity);
    }
    catch (e)
    {
        if (!(e instanceof CcxtErrors.BaseError))
        {
            throw e;
        }
        if ('InvalidOrder' != e.ccxtErrorType)
        {
            throw e;
        }
        // we don't have enough information to map error
        throw e;
    }
    // update cached orders
    this._cacheOrder(orderNumber, orderType, pair, 'open');
    return orderNumber;
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (if exchange supports retrieving an order without the pair, value will be undefined)
 * @return {Promise}
 */
async _cancelOrder(orderNumber, pair)
{
    try
    {
        await super._cancelOrder(orderNumber, pair);
    }
    catch (e)
    {
        throw e;
    }
    return true;
}

}
module.exports = Exchange;
