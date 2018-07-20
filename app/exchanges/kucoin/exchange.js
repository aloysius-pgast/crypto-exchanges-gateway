"use strict";
const logger = require('winston');
const _ = require('lodash');
const Errors = require('../../errors');
const CcxtErrors = require('../../ccxt-errors');
const CcxtClient = require('../../default-ccxt-client');
const AbstractCcxtExchangeClass = require('../../abstract-ccxt-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

const exchangeType = 'kucoin';

// default limit when retrieving trades (this is the maximum for Kucoin)
const TRADES_DEFAULT_LIMIT = 50;

// default limit when retrieving order book (this is the maximum for Kucoin)
const ORDER_BOOK_DEFAULT_LIMIT = 20;

// maximum number of closed orders we can request at once
const CLOSED_ORDERS_LIMIT_PER_ITER = 20;


// list of possible interval for klines
const supportedKlinesIntervals = [
  '1m', '5m', '15m', '30m',
  '1h', '8h',
  '1d',
  '1w'
]
const defaultKlinesInterval = '5m';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    'pairs':{enabled:true},
    'tickers':{enabled:true, withoutPair:true}, 'wsTickers':{enabled:true,emulated:true},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true,emulated:true},
    'trades':{enabled:true}, 'wsTrades':{enabled:true,emulated:true},
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
 * @param {string} exchangeId exchange identifier (ex: bittrex)
 * @param {string} exchangeName exchange name (ex: Bittrex)
 * @param {object} config full config object
 */
constructor(exchangeId, exchangeName, config)
{
    let opt = AbstractCcxtExchangeClass.getCcxtOpt(exchangeId, config, {
        fetchOrderBookWarning:false
    });
    let client = new CcxtClient('kucoin', opt);
    super(exchangeId, exchangeType, exchangeName, supportedFeatures, config, client);
    let subscriptionManager = new SubscriptionManagerClass(this, config);
    this._setSubscriptionManager(subscriptionManager);
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
 *
 * @param {string} pair pair to retrieve closed orders for
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to an object such as below
 */
async _getClosedOrdersForPair(pair, completeHistory)
{
    // are we sure that it's not possible to have entries returned by fetchClosedOrders when an order is partially filled ?
    let list = {};
    let page = 1;
    while (true)
    {
        let data;
        let params = {page:page,limit:CLOSED_ORDERS_LIMIT_PER_ITER};
        try
        {
            data = await this._client.getClosedOrdersForPair(pair, params, true);
        }
        catch (e)
        {
            throw e;
        }
        _.forEach(data.custom, (order) => {
            if (undefined === list[order.orderNumber])
            {
                list[order.orderNumber] = order;
            }
            else
            {
                this._mergeOrder(order, list[order.orderNumber]);
            }
        });
        // stop if we received less result than requested
        if (data.ccxt.length < params.limit)
        {
            break;
        }
        if (!completeHistory)
        {
            break;
        }
        ++page;
    }
    // finalize orders & update cached orders
    _.forEach(list, (order, orderNumber) => {
        // compute actual rate
        if (!order.quantity.eq(0))
        {
            order.actualRate = parseFloat(order.actualPrice.div(order.quantity).toFixed(8));
            if (null !== order.fees)
            {
                let splittedPair = order.pair.split('-');
                // only compute order.finalPrice & order.finalRate if fees.currency != from baseCurrency (otherwise use order.actualPrice & order.actualRate)
                if (splittedPair[0] != order.fees.currency)
                {
                    order.finalPrice = order.actualPrice;
                    order.finalRate = order.actualRate;
                }
                else
                {
                    if ('buy' == order.orderType)
                    {
                        order.finalPrice =  order.actualPrice.plus(order.fees.amount);
                    }
                    else
                    {
                        order.finalPrice =  order.actualPrice.minus(order.fees.amount);
                    }
                    order.finalRate = order.finalPrice.div(order.quantity);
                }
                order.fees.amount = parseFloat(order.fees.amount.toFixed(8));
                order.finalPrice = parseFloat(order.finalPrice.toFixed(8));
                order.finalRate = parseFloat(order.finalRate.toFixed(8));
            }
            order.quantity = parseFloat(order.quantity.toFixed(8));
            order.actualPrice = parseFloat(order.actualPrice.toFixed(8));
        }
        this._cacheOrder(orderNumber, order.orderType, order.pair, 'closed');
    });
    return list;
}

/**
 * Merges one order into another
 *
 * @param {object} order order to merge
 * @param {object} into destination order
 */
_mergeOrder(order, into)
{
    // update closedTimestamp
    if (order.closedTimestamp > into.closedTimestamp)
    {
        into.closedTimestamp = order.closedTimestamp;
    }
    // update quantity & actualPrice
    into.quantity = into.quantity.plus(order.quantity);
    into.actualPrice = into.actualPrice.plus(order.actualPrice);
    // update fees
    if (null !== order.fees)
    {
        // initialize fees if needed
        if (null === into.fees)
        {
            into.fees = {amount:new Big(0), currency:order.fees.currency};
        }
        into.fees.amount = into.fees.amount.plus(order.fees.amount);
    }
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
    // do we know the type ?
    let orderType;
    let cachedOrder = this._getCachedOrder(orderNumber);
    if (null !== cachedOrder)
    {
        orderType = cachedOrder.orderType.toUpperCase();
    }
    let data;
    if (undefined !== orderType)
    {
        data = await this._client.getOrder(orderNumber, pair, {type:orderType});
    }
    else
    {
        try
        {
            data = await this._client.getOrder(orderNumber, pair, {type:'BUY'});
        }
        catch (e)
        {
            if ('OrderNotFound' != e.ccxtErrorType)
            {
                throw e;
            }
        }
        // try sell
        if (undefined === data)
        {
            try
            {
                data = await this._client.getOrder(orderNumber, pair, {type:'SELL'});
            }
            catch (e)
            {
                if ('OrderNotFound' != e.ccxtErrorType)
                {
                    throw e;
                }
            }
        }
    }
    if (undefined === data)
    {
        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.getId(), orderNumber);
    }
    // cache order
    let orderState = 'closed';
    if (data.custom.hasOwnProperty('remaining'))
    {
        orderState = 'open';
    }
    // update cached orders
    this._cacheOrder(data.custom.orderNumber, data.custom.orderType, pair, orderState);
    return data.custom;
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
        // map error
        let message = e.json.msg;
        // invalid quantity
        if (-1 != message.indexOf('The precision of amount'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidQuantity(this.getId(), pair, quantity, e.json);
        }
        // invalid rate
        if (-1 != message.indexOf('Min price') || -1 != message.indexOf('Max price') || -1 != message.indexOf('The precision of price'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate(this.getId(), pair, targetRate, e.json);
        }
        // invalid price
        if (-1 != message.indexOf('Min amount each order'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidPrice(this.getId(), pair, targetRate, quantity, e.json);
        }
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
    let order;
    try
    {
        order = await this.getOrder(orderNumber, pair);
    }
    catch (e)
    {
        throw e;
    }
    let params = {type:order.orderType.toUpperCase()};
    try
    {
        await this._client.cancelOrder(orderNumber, pair, params);
    }
    catch (e)
    {
        throw e;
    }
    return true;
}

}
module.exports = Exchange;
