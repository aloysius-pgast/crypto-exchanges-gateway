"use strict";
const logger = require('winston');
const _ = require('lodash');
const Errors = require('./errors');
const CcxtErrors = require('./ccxt-errors');
const AbstractExchangeClass = require('./abstract-exchange');

/**
 * Adapter for CCXT exchanges
 */

class AbstractCcxtExchange extends AbstractExchangeClass
{

/**
 * @param {string} id exchange unique identifier (ex: binance2)
 * @param {string} type exchange type (ex: binance)
 * @param {string} name exchange name (ex: 'Binance #2')
 * @param {object} supportedFeatures dictionary of all supportedFeatures
 * @param {object} config loaded from JSON
 * @param {object} ccxtClient ccxt client
 */
constructor(id, type, name, supportedFeatures, config, ccxtClient)
{
    super(id, type, name, supportedFeatures, config);
    this._client = ccxtClient;
}

/**
 * Indicates whether or not we're using a ccxt exchange
 */
isCcxt()
{
    return true;
}

/**
 * Whether or not an error is a network error
 *
 * @param {object} e CcxtErrors.BaseError
 * @return {boolean}
 */
_isNetworkError(e)
{
    if (undefined === e.ccxtError)
    {
        return false;
    }
    switch (e.ccxtErrorType)
    {
        case 'ExchangeNotAvailable':
        case 'DDoSProtection':
        case 'InvalidNonce':
        case 'RequestTimeout':
            return true;
    }
    return false;
}

/**
 * Whether or not it's a timeout error
 *
 * @param {object} e CcxtErrors.BaseError
 * @return {boolean}
 */
_isTimeoutError(e)
{
    return 'RequestTimeout' == e.ccxtErrorType;
}

/**
 * Whether or not it's a ddos protection error
 *
 * @param {object} e error
 * @return {boolean}
 */
_isDDosProtectionError(e)
{
    return 'DDoSProtection' == e.ccxtErrorType;
}

__logNetworkError(e, method)
{
    logger.error(`NetworkError (${this.__id}|${method})`);
    logger.error(e.inspect());
    // only log part status code, reason & part of the body
    if (undefined !== e.response)
    {
        let err = {statusCode:e.response.statusCode,statusMessage:e.response.statusMessage}
        logger.error(JSON.stringify(err));
    }
}

/**
 * Returns all active pairs
 *
 * @return {Promise}
 */
async _getPairs()
{
    let data = await this._client.getPairs();
    let pairs = data.custom;
    // update limits
    if (this._client.ccxt.has.fetchCurrencies)
    {
        let baseCurrencies = {};
        let precision;
        _.forEach(pairs, (pair, symbol) => {
            // update quantity limits
            precision = this._getCurrencyPrecision(pair.currency);
            if (null !== precision && precision.precision < pair.limits.quantity.precision)
            {
                pair.limits.quantity.precision = precision.precision;
                pair.limits.quantity.step = precision.step;
                if (pair.limits.quantity.step > pair.limits.quantity.min)
                {
                    pair.limits.quantity.min = pair.limits.quantity.step;
                }
            }
            // initialize base currency information
            if (undefined === baseCurrencies[pair.baseCurrency])
            {
                baseCurrencies[pair.baseCurrency] = this._getCurrencyPrecision(pair.baseCurrency);
            }
            // update price & rate limits
            if (null !== baseCurrencies[pair.baseCurrency])
            {
                // update rate limits
                if (baseCurrencies[pair.baseCurrency].precision < pair.limits.rate.precision)
                {
                    pair.limits.rate.precision = baseCurrencies[pair.baseCurrency].precision;
                    pair.limits.rate.step = baseCurrencies[pair.baseCurrency].step;
                    if (pair.limits.rate.step > pair.limits.rate.min)
                    {
                        pair.limits.rate.min = pair.limits.rate.step;
                    }
                }
                // update price limits
                if (baseCurrencies[pair.baseCurrency].step > pair.limits.price.min)
                {
                    pair.limits.price.min = baseCurrencies[pair.baseCurrency].step;
                }
            }
        });
    }
    return pairs;
}

/**
 * Returns precision & step for a given currency
 *
 * @param {string} currency to retrieve information for
 * @return {object} {precision:integer,step:float} or null if no information was found
 */
_getCurrencyPrecision(currency)
{
    if (undefined === this._client.ccxt.currencies[currency])
    {
        return null;
    }
    return {
        precision:this._client.ccxt.currencies[currency].precision,
        step:this._precisionToStep(this._client.ccxt.currencies[currency].precision)
    }
}

/**
 * Retrieve tickers for all pairs
 *
 * @return {Promise}
 */
async _getTickers()
{
    let data = await this._client.getTickers();
    return data.custom;
}

/**
 * Returns ticker for a single pair
 *
 * @param {string} pair pair to retrieve ticker for
 * @return {Promise}
 */
async _getTicker(pair)
{
    let data = await this._client.getTicker(pair);
    return data.custom;
}

/**
 * Retrieve order book for a single pair

 * @param {string} pair pair to retrieve order book for
 * @param {integer} opt.limit maximum number of entries (for both ask & bids) (optional)
 * @param {object} opt.custom exchange specific options (will always be defined)
 * @return {Promise} Promise which will resolve to an object such as below
 */
async _getOrderBook(pair, opt)
{
    let data = await this._client.getOrderBook(pair, opt.limit, opt.custom);
    return data.custom;
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
    let data = await this._client.getTrades(pair, opt.limit, opt.custom);
    return data.custom;
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
async _getKlines(pair, interval, fromTimestamp, toTimestamp)
{
    let data = await this._client.getKlines(pair, interval, fromTimestamp, toTimestamp);
    return data.custom;
}

/**
 * Retrieve open orders for a single pair

 * @param {string} pair pair to retrieve open orders for
 * @return {Promise}
 */
async _getOpenOrdersForPair(pair)
{
    let data = await this._client.getOpenOrdersForPair(pair);
    return data.custom;
}

/**
 * Retrieve closed orders for a single pair

 * @param {string} pair pair to retrieve closed orders for
 * @param {boolean} completeHistory whether or not all orders should be retrieved (might not be supported on all exchanges)
 * @return {Promise}
 */
async _getClosedOrdersForPair(pair, completeHistory)
{
    let data = await this._client.getClosedOrdersForPair(pair);
    return data.custom;
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
    let data = await this._client.getOrder(orderNumber, pair);
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
    let data = await this._client.createOrder(orderType, pair, targetRate, quantity);
    return data.custom.orderNumber;
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
    let data = await this._client.cancelOrder(orderNumber, pair);
    return data.custom;
}

/**
 * Return balances for all currencies (currencies with balance = 0 should be filtered out)
 *
 * @return {Promise}
 */
async _getBalances()
{
    let data = await this._client.getBalances();
    return data.custom;
}

}

module.exports = AbstractCcxtExchange;
