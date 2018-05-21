"use strict";
const uuidGenerator = require('uuid/v4');
const _ = require('lodash');
const Big = require('big.js');
const logger = require('winston');
const Errors = require('./errors');

/*

This class is used to generate fake data :

- orders
- balances

*/

//-- fake data configuration
const fakeData = {
    openOrders:{
        minCount:0,
        maxCount:15
    },
    closedOrders:{
        minCount:1,
        maxCount:15
    },
    balances:{
        minCount:0,
        maxCount:5,
        min:0.1,
        max:1000,
        "BTC":{
            min:0.001,
            max:0.25
        },
        "ETH":{
            min:0.01,
            max:2
        },
        "LTC":{
            min:0.1,
            max:20
        }
    },
    rate:{
        min:0.0001,
        max:0.95
    },
    quantity:{
        min:0.1,
        max:1000
    },
    timestamp:{
        min:(parseInt(Date.now() / 1000) - (3600 * 24 * 30))
    }
}

class Exchange
{

/**
 * @param {object} real exchange instance
 */
constructor(realExchange)
{
    this._realExchange = realExchange;
}

getId()
{
    return 'fake';
}

/**
 * Retrieve open orders for a list of pairs
 *
 * @param {string[]} pairs array of pairs to retrieve open orders for. If undefined or empty, open orders for all pairs will be retrieved
 * @param {string} opt.orderNumber used to return only one order (optional)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */

/*
Output example

{
    "Xfs4XfHeXqHYycNB4s2PoT":{
        "pair":"ETH-BNB",
        "orderType":"sell",
        "orderNumber":"Xfs4XfHeXqHYycNB4s2PoT",
        "targetRate":0.0095,
        "quantity":250,
        "openTimestamp":1503564675,
        "targetPrice":2.375,
        "remainingQuantity":250
    },...
}
*/
 async getOpenOrders(pairs, opt) {
     if (undefined === opt)
     {
         opt = {};
     }
     let _pairs;
     try
     {
         _pairs = await this._realExchange.getPairsSymbols(true, {pairs:pairs});
     }
     catch (e)
     {
        throw e;
     }
     return this._generateOpenOrders(_pairs, opt);
}

/**
 * Retrieve closed orders for a list of pairs
 *
 * @param {string[]} pairs array of pairs to retrieve closed orders for. If undefined or empty, closed orders for all pairs will be retrieved
 * @param {string} opt.orderNumber used to return only one order (optional)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */

/*
Output example

actualPrice is (quantity * actualRate)
finalPrice is (actualPrice +/- fees.amount)
finalRate is (finalPrice / quantity)

{
    "181217792":{
        "pair":"USDT-BCH",
        "orderNumber":"181217792",
        "orderType":"sell",
        "quantity":0.00001557,
        "actualPrice":0.00463986,
        "finalPrice":"0.00462826",
        "openTimestamp":null,
        "closedTimestamp":1502980611,
        "fees":{
            "amount":0.0000116,
            "currency":"BCH"
        },
        "actualRate":298,
        "finalRate":297.25497752
    },
    "2030423730":{
        "pair":"ETH-GNT",
        "orderNumber":"2030423730",
        "orderType":"buy",
        "quantity":1017.943,
        "actualPrice":2.46182388,
        "finalPrice":"2.46551661",
        "openTimestamp":null,
        "closedTimestamp":1495788784,
        "fees":{
            "amount":0.00369273,
            "currency":"ETH"
        },
        "actualRate":0.00241843,
        "finalRate":0.00242206
    }
}
*/
async getClosedOrders(pairs, opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    let _pairs;
    try
    {
        _pairs = await this._realExchange.getPairsSymbols(true, {pairs:pairs});
    }
    catch (e)
    {
       throw e;
    }
    return this._generateClosedOrders(_pairs, opt);
}

/**
 * Retrieves a single order (open or closed)
 *
 * @param {string} orderNumber
 * @param {string} pair pair (ex: USDT-NEO) (optional)
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*

Output example for open order

{
    "pair":"USDT-NEO",
    "orderType":"sell",
    "orderNumber":"8Odh1Rq4N88wW3Xp8gPChq",
    "targetRate":147.5,
    "quantity":2.06,
    "openTimestamp":1517502581.466,
    "targetPrice":303.85,
    "remainingQuantity":2.06
}

Output example for open closed order

{
    "pair":"USDT-NEO",
    "orderType":"buy",
    "orderNumber":"1WrlBQXcvHioYQp4ij0wLm",
    "openTimestamp":1516224191.853,
    "quantity":5.82,
    "actualRate":144,
    "actualPrice":838.08
    "closedTimestamp":1516224650.836,
    "fees":{
        "amount":0.02954382,
        "currency":"BNB"
    }
}

*/
async getOrder(orderNumber, pair)
{
    let value = Math.random();
    // 10% of times, generate an error indicating order does not exist
    if (value >= 0.9)
    {
        let message = `Order '${orderNumber}' does not exist (fake random error)`;
        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.getId(), orderNumber, message);
    }
    let pairs = [];
    if (undefined !== pair)
    {
        pairs = [pair];
    }
    let _pairs;
    try
    {
        _pairs = await this._realExchange.getPairsSymbols(true, {pairs:pairs});
    }
    catch (e)
    {
       throw e;
    }
    if (0 == _pairs.length)
    {
        let message = `Order '${orderNumber}' does not exist (pair not supported)`;
        throw new Errors.ExchangeError.InvalidRequest.OrderError.OrderNotFound(this.getId(), orderNumber, message);
    }
    value = Math.random();
    let list;
    // return an open order 50% of times
    if (value < 0.5)
    {
        list = this._generateOpenOrders(_pairs, {orderNumber:orderNumber});
    }
    else
    {
        list = this._generateClosedOrders(_pairs, {orderNumber:orderNumber});
    }
    return list[orderNumber];
}

/**
 * Creates a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to buy/sell
 * @param {float} targetRate expected buy/sell price
 * @param {float} quantity quantity to buy/sell
 * @return {Promise} Promise which will resolve to true in case of the number of the new order
 */
async createOrder(orderType, pair, targetRate, quantity)
{
    return this._generateOrderNumbers(1)[0];
}

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber number of the order to cancel
 * @param {string} pair pair (ex: USDT-NEO) (optional)
 * @return {Promise} Promise which will resolve to true in case of success
 */
async cancelOrder(orderNumber, pair)
{
    return true;
}

/**
 * Return balances for a list of currencies
 *
 * @param {string[]} currencies array of currencies to retrieve balances for. If undefined or empty, balances for all currencies will be retrieved
 * @return {Promise} Promise which will resolve to a dictionary such as below
 */
/*
Output example

{
    "BTC":{
        "currency":"BTC",
        "total":0.07394381,
        "available":0.07394381,
        "onOrders":0
    },
    "NEO":{
        "currency":"NEO",
        "total":5.70415443,
        "available":5.70415443,
        "onOrders":0
    },...
}

*/
async getBalances(currencies)
{
    let addDefaultCurrencies = false;
    if (undefined === currencies)
    {
        addDefaultCurrencies = true;
        currencies = [];
    }
    let _pairs;
    try
    {
        _pairs = await this._realExchange.getPairsSymbols(true, {currencies:currencies});
    }
    catch (e)
    {
       throw e;
    }
    return this._generateBalances(_pairs, addDefaultCurrencies);
}

_generateOpenOrders(pairs, opt)
{
    let list = {};
    let orderNumbers;
    if (undefined === opt.orderNumber)
    {
        orderNumbers = this._generateOrderNumbers([fakeData.openOrders.minCount, fakeData.openOrders.maxCount]);
    }
    else
    {
        orderNumbers = [opt.orderNumber];
    }
    _.forEach(orderNumbers, (n) => {
        let pair = this._generatePair(pairs);
        if (null === pair)
        {
            return;
        }
        let orderType = this._generateOrderType();
        let quantity = this._generateQuantity();
        let rate = this._generateRate();
        let price = new Big(quantity).times(rate);
        list[n] = {
            pair:pair,
            orderType:orderType,
            orderNumber:n,
            quantity:quantity,
            remainingQuantity:this._generateRemainingQuantity(quantity),
            targetRate:rate,
            targetPrice:parseFloat(price.toFixed(8)),
            openTimestamp:this._generateTimestamp()
        }
    });
    return list;
}

_generateClosedOrders(pairs, opt)
{
    let list = {};
    let orderNumbers;
    if (undefined === opt.orderNumber)
    {
        orderNumbers = this._generateOrderNumbers([fakeData.closedOrders.minCount, fakeData.closedOrders.maxCount]);
    }
    else
    {
        orderNumbers = [opt.orderNumber];
    }
    _.forEach(orderNumbers, (n) => {
        let pair = this._generatePair(pairs);
        if (null === pair)
        {
            return;
        }
        let splittedPair = pair.split('-');
        let orderType = this._generateOrderType();
        let quantity = this._generateQuantity();
        let rate = this._generateRate();
        let price = new Big(quantity).times(rate);
        let fees = price.times(this._realExchange.getFeesPercent());
        let finalPrice;
        if ('buy' == orderType)
        {
            finalPrice = price.plus(fees);
        }
        else
        {
            finalPrice = price.minus(fees);
        }
        let finalRate = finalPrice.div(quantity);
        let openTimestamp = this._generateTimestamp();
        let closedTimestamp = this._generateTimestamp(openTimestamp);
        list[n] = {
            pair:pair,
            orderType:this._generateOrderType(),
            orderNumber:n,
            quantity:quantity,
            actualRate:rate,
            actualPrice:parseFloat(price.toFixed(8)),
            finalRate:parseFloat(finalRate.toFixed(8)),
            finalPrice:parseFloat(finalPrice.toFixed(8)),
            fees:{
                amount:parseFloat(fees.toFixed(8)),
                currency:splittedPair[0]
            },
            openTimestamp:openTimestamp,
            closedTimestamp:closedTimestamp
        }
    });
    return list;
}

_generateBalances(pairs, addDefaultCurrencies)
{
    let list = {};
    let currencies = this._generateCurrencies(pairs, [fakeData.balances.minCount, fakeData.balances.maxCount]);
    if (addDefaultCurrencies)
    {
        currencies.push('BTC');
        currencies.push('USDT');
    }
    _.forEach(currencies, (c) => {
        let available = this._generateBalance(c);
        let onOrders = this._generateBalance(c);
        let total = available + onOrders;
        list[c] = {
            currency:c,
            available:available,
            onOrders:onOrders,
            total:total
        }
    });
    return list;
}

_generateBalance(currency)
{
    let min = fakeData.balances.min;
    let max = fakeData.balances.max;
    if (undefined !== fakeData.balances[currency])
    {
        min = fakeData.balances[currency].min;
        max = fakeData.balances[currency].max;
    }
    return parseFloat(this._generateFloat(min, max).toFixed(8));
}

_generateOrderNumbers(count)
{
    let c = count;
    if (Array.isArray(c))
    {
        c = this._generateInteger(c[0], c[1]);
    }
    let list = [];
    for (var i = 0; i < c; ++i)
    {
        list.push(uuidGenerator());
    }
    return list;
}

_generateCurrencies(pairs, count)
{
    let c = count;
    if (Array.isArray(c))
    {
        c = this._generateInteger(c[0], c[1]);
    }
    let list = {};
    _.forEach(pairs, (pair) => {
        let arr = pair.split('-');
        let currency = arr[1];
        if (undefined !== list[currency])
        {
            return;
        }
        list[currency] = true;
    });
    return _.slice(_.shuffle(Object.keys(list)), 0, c);
}

_generatePair(pairs)
{
    let pair = null;
    if (0 != pairs.length)
    {
        let index = this._generateInteger(0, pairs.length - 1);
        pair = pairs[index];
    }
    return pair;
}

_generateTimestamp(minTimestamp)
{
    if (undefined === minTimestamp)
    {
        minTimestamp = fakeData.timestamp.min;
    }
    let now = parseInt(Date.now() / 1000);
    return this._generateInteger(minTimestamp, now);
}

_generateQuantity()
{
    return parseFloat(this._generateFloat(fakeData.quantity.min, fakeData.quantity.max).toFixed(8));
}

_generateRemainingQuantity(quantity)
{
    let value = Math.random();
    // 100% remaining quantity 90% of times
    if (value <= 0.90)
    {
        return quantity;
    }
    return parseFloat(this._generateFloat(quantity * 0.85, quantity).toFixed(8));
}

_generateRate()
{
    return parseFloat(this._generateFloat(fakeData.rate.min, fakeData.rate.max).toFixed(8));
}

_generateOrderType()
{
    let n = Math.random();
    if (n < 0.5)
    {
        return 'buy';
    }
    return 'sell';
}

_generateFloat(min, max)
{
    let n = Math.random() * (max - min) + min + 0.0001;
    if (n > max)
    {
        n = max;
    }
    return n;
}

_generateInteger(min, max)
{
    let n = Math.floor(Math.random() * (max - min + 1) + min);
    return n;
}

}

module.exports = Exchange;
