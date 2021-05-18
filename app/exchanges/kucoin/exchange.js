"use strict";
const logger = require('winston');
const _ = require('lodash');
const Errors = require('../../errors');
const CcxtErrors = require('../../ccxt-errors');
const CcxtClient = require('./ccxt-client');
const PromiseHelper = require('../../promise-helper');
const AbstractCcxtExchangeClass = require('../../abstract-ccxt-exchange');
const SubscriptionManagerClass = require('./subscription-manager');

const exchangeType = 'kucoin';

// default limit when retrieving order book (this is the maximum for Kucoin)
const ORDER_BOOK_DEFAULT_LIMIT = 100;
// list of possible limits for order book
const supportedOrderBooksLimits = [20, 50]

// limit when retrieving trades (Kucoin will always return the last 100 trades)
const TRADES_LIMIT = 100;

// maximum number of days to consider for closed orders
const CLOSED_ORDERS_HISTORY = 7;

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
    'tickers':{enabled:true, withoutPair:true}, 'wsTickers':{enabled:true,emulated:false},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true,emulated:false},
    'trades':{enabled:true}, 'wsTrades':{enabled:true,emulated:false},
    'klines':{enabled:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval}, 'wsKlines':{enabled:true,emulated:true,intervals:supportedKlinesIntervals,defaultInterval:defaultKlinesInterval},
    'orders':{enabled:true, withoutPair:true},
    'openOrders':{enabled:true, withoutPair:true},
    'closedOrders':{enabled:true, withoutPair:true, completeHistory:false},
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
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @param {object} opt.custom.includeSequence whether or not 'sequence' field should be present in result (optional, default = false)
 * @return {Promise} Promise which will resolve to an object such as below
 */
async _getOrderBook(pair, opt)
{
    let customOpt = opt.custom;
    // we don't want to pass opt.custom.includeTimestamp to ccxt client
    if (undefined !== opt.custom.includeSequence)
    {
        customOpt = _.clone(opt.custom);
        delete customOpt.includeSequence;
    }
    if (undefined === customOpt.level)
    {
        customOpt.level = '2';
    }
    const data = await this._client.getOrderBook(pair, opt.limit, customOpt);
    // sequence will be requested by subscription manager to sort full orderbook & order book updates
    if (true === opt.custom.includeSequence)
    {
        // use 'nonce' if available
        if (undefined !== data.ccxt.nonce)
        {
            data.custom.sequence = data.ccxt.nonce;
        }
        // otherwise use 'timestamp' as older version of ccxt used to set the timestamp as the 'sequence' number returned by Kucoin
        else
        {
            data.custom.sequence = data.ccxt.sequence;
        }
    }
    return data.custom;
}

/**
 * Used to ensure we use a supported limit
 *
 * @param {integer} limit requested order book limit
 * @return {integer} supported limit (>= requested limit)
 */
_fixOrderBookLimit(limit)
{
    if (-1 != supportedOrderBooksLimits.indexOf(limit))
    {
        return limit;
    }
    for (var i = 0; i < supportedOrderBooksLimits.length; ++i)
    {
        if (supportedOrderBooksLimits[i] >= limit)
        {
            return supportedOrderBooksLimits[i];
        }
    }
}

/**
 * Returns last trades
 *
 * @param {string} pair pair to retrieve trades for
 * @param {integer} opt.limit maximum number of entries (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise}
 */
async _getTrades(pair, opt)
{
    // Kucoin will always return the same number of trades so no need to pass any limit
    let data = await this._client.getTrades(pair, undefined, opt.custom);
    return data.custom;
}

/**
 * Used to ensure we use a supported limit
 *
 * @param {integer} limit requested trades limit
 * @return {integer} supported limit (<= requested limit)
 */
_fixTradesLimit(limit)
{
    return TRADES_LIMIT;
}

/**
 * Retrieve open orders for all pairs
 * @return {Promise}
 */
async _getOpenOrders()
{
    let data;
    try
    {
        data = await super._getOpenOrders();
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
 * Retrieve closed orders for all pairs
 *
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise} Promise which will resolve to an object such as below
 */
async _getClosedOrders(completeHistory)
{
    /*
     * completeHistory is not supported, by default we will retrieve last N days
     */
    // are we sure that it's not possible to have entries returned by fetchClosedOrders when an order is partially filled ?

    let list = {};

    const oneDay = 24 * 3600 * 1000;
    let endAt = Date.now();

    // request can be performed in parallel
    let arr = [];
    for (let i = 0; i < CLOSED_ORDERS_HISTORY; ++i)
    {
        let params = {
            endAt:endAt,
            startAt:(endAt - oneDay)
        };
        endAt = endAt - oneDay - 1;
        let p = this._client.getClosedOrders(params, true);
        arr.push({promise:p, context:{exchange:this.getId(),api:'_getClosedOrders'}});
    }
    let data = await PromiseHelper.all(arr);
    _.forEach(data, (entry) => {
        // could not retrieve orders for a given symbol
        if (!entry.success)
        {
            return;
        }
        _.forEach(entry.value.custom, (order) => {
            if (undefined === list[order.orderNumber])
            {
                list[order.orderNumber] = order;
            }
            else
            {
                this._mergeOrder(order, list[order.orderNumber]);
            }
        });
    });
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
        else
        {
            order.quantity = parseFloat(order.quantity.toFixed(8));
            order.actualPrice = parseFloat(order.actualPrice.toFixed(8));
        }
        this._cacheOrder(orderNumber, order.orderType, order.pair, 'closed');
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
    let data;
    try
    {
        // trades don't need to be merge, so we can use default method
        data = await super._getOrder(orderNumber, pair);
    }
    catch (e)
    {
        throw e;
    }
    // update cached orders
    let orderState = 'closed';
    if (data.hasOwnProperty('remainingQuantity'))
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
        if (undefined === e.json || undefined === e.json.msg)
        {
            throw e;
        }
        // map error
        const message = e.json.msg;
        // invalid quantity
        if (-1 != message.indexOf('Order size below the minimum'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidQuantity(this.getId(), pair, quantity, e.json);
        }
        // invalid rate
        if (-1 != message.indexOf('Price increment invalid'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate(this.getId(), pair, targetRate, e.json);
        }
        // does not seem to be triggered
        /*
        // invalid price
        if (-1 != message.indexOf(''))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidPrice(this.getId(), pair, targetRate, quantity, e.json);
        }
        */
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
        if (!(e instanceof CcxtErrors.BaseError))
        {
            throw e;
        }
        if (undefined === e.json || undefined === e.json.msg)
        {
            throw e;
        }
        const message = e.json.msg;
        if (-1 != message.indexOf('order_not_exist_or_not_allow_to_cancel'))
        {
            throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotOpen(this.getId(), orderNumber, e.json);
        }
        throw e;
    }
    return true;
}


}
module.exports = Exchange;
