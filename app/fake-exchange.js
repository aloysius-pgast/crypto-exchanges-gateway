"use strict";
const uuidGenerator = require('uuid/v4');
const _ = require('lodash');
const Big = require('big.js');
const logger = require('winston');

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
        min:(parseInt(new Date().getTime() / 1000) - (3600 * 24 * 30))
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

/**
 * Returns open orders (fake random data)
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
 *         "openTimestamp":1498945578,
 *         "targetPrice":0.2747976936176
 *     },
 *     "d3af561a-c3ac-4452-bf0e-a32854b558e5":{
 *         "pair":"USDT-NEO",
 *         "orderType":"buy",
 *         "orderNumber":"d3af561a-c3ac-4452-bf0e-a32854b558e5",
 *         "targetRate":12,
 *         "quantity":2.33488048,
 *         "remainingQuantity":2.33488048,
 *         "openTimestamp":1502095438,
 *         "targetPrice":28.01856576
 *     },...
 * }
 *
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned) (will be ignored if opt.outputFormat is exchange)
 * @param {string} opt.pairs used to restrict results to only a list of pairs
 * @return {Promise}
 */
 openOrders(opt) {
     opt.outputFormat = 'custom';
     let self = this;
     return new Promise((resolve, reject) => {
         let p = self._realExchange.pairs(opt).then(function(data) {
             let list;
             try
             {
                 list = self._generateOpenOrders(data, opt);
             }
             catch (e)
             {
                 logger.error(e.stack);
                 list = {};
             }
             resolve(list);
          })
          .catch(function(err)
         {
             if (undefined !== err.stack)
             {
                 logger.error(err.stack);
             }
             else
             {
                 logger.error(err);
             }
             resolve({});
         });
    });
}

/**
 * Returns open orders (fake random data)
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
 * @param {string} opt.orderNumber used to query a single order (optional, if not set all orders will be returned) (will be ignored if opt.outputFormat is exchange)
 * @param {string} opt.pairs used to restrict results to only a list of pairs (will be ignored if opt.outputFormat is exchange)
 * @return {Promise}
 */
closedOrders(opt)
{
    opt.outputFormat = 'custom';
    let self = this;
    return new Promise((resolve, reject) => {
        let p = self._realExchange.pairs(opt).then(function(data) {
            let list;
            try
            {
                list = self._generateClosedOrders(data, opt);
            }
            catch (e)
            {
                logger.error(e.stack);
                list = {};
            }
            resolve(list);
         })
         .catch(function(err)
        {
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
            else
            {
                logger.error(err);
            }
            resolve({});
        });
   });
}

/**
 * Creates a new order
 *
 * Result will be as below (fake random data)
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
    opt.outputFormat = 'custom';
    let self = this;
    return new Promise((resolve, reject) => {
        let result = {orderNumber:self._generateOrderNumbers(1)[0]};
        resolve(result);
   });
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
    return new Promise((resolve, reject) => {
        resolve({});
    });
}

/**
 * Returns balances (fake random data)
 *
 *  Result will be as below
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
    opt.outputFormat = 'custom';
    let self = this;
    return new Promise((resolve, reject) => {
        let p = self._realExchange.pairs(opt).then(function(data) {
            let list;
            try
            {
                list = self._generateBalances(data, opt);
            }
            catch (e)
            {
                logger.error(e.stack);
                list = {};
            }
            resolve(list);
         })
         .catch(function(err)
        {
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
            else
            {
                logger.error(err);
            }
            resolve({});
        });
   });
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
        let pair = this._generatePair(pairs, opt.pairs);
        if (null === pair)
        {
            return;
        }
        let quantity = this._generateQuantity();
        let rate = this._generateRate();
        let price = parseFloat(new Big(quantity).times(rate).toFixed(8));
        list[n] = {
            pair:pair,
            orderType:this._generateOrderType(),
            orderNumber:n,
            quantity:quantity,
            remainingQuantity:this._generateRemainingQuantity(quantity),
            targetRate:rate,
            targetPrice:price,
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
        orderNumbers = this._generateOrderNumbers([fakeData.openOrders.minCount, fakeData.openOrders.maxCount]);
    }
    else
    {
        orderNumbers = [opt.orderNumber];
    }
    _.forEach(orderNumbers, (n) => {
        let pair = this._generatePair(pairs, opt.pairs);
        if (null === pair)
        {
            return;
        }
        let quantity = this._generateQuantity();
        let rate = this._generateRate();
        let price = parseFloat(new Big(quantity).times(rate).toFixed(8));
        list[n] = {
            pair:pair,
            orderType:this._generateOrderType(),
            orderNumber:n,
            quantity:quantity,
            actualRate:rate,
            actualPrice:price,
            closedTimestamp:this._generateTimestamp()
        }
    });
    return list;
}

_generateBalances(pairs, opt)
{
    let list = {};
    let currencies;
    if (undefined === opt.currencies)
    {
        currencies = this._generateCurrencies(pairs, [fakeData.balances.minCount, fakeData.balances.maxCount]);
        currencies.push('BTC');
        currencies.push('USDT');
        currencies = _.uniq(currencies);
    }
    else
    {
        currencies = opt.currencies;
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
    _.forEach(_.values(pairs), (item) => {
        if (undefined !== list[item.currency])
        {
            return;
        }
        list[item.currency] = true;
    });
    return _.slice(_.shuffle(Object.keys(list)), 0, c);
}

_generatePair(pairs, fromPairs)
{
    let pair = null;
    if (undefined !== fromPairs && 0 != fromPairs.length)
    {
        let index = this._generateInteger(0, fromPairs.length - 1);
        pair = fromPairs[index];
        // pair does not exist on exchange
        if (undefined === pairs[pair])
        {
            return null;
        }
    }
    if (null === pair)
    {
        let list = Object.keys(pairs);
        let index = this._generateInteger(0, list.length - 1);
        pair = list[index];
    }
    return pair;
}

_generateTimestamp()
{
    let now = parseInt(new Date().getTime() / 1000);
    return this._generateInteger(fakeData.timestamp.min, now);
}

_generateQuantity()
{
    return parseFloat(this._generateFloat(fakeData.quantity.min, fakeData.quantity.max).toFixed(8));
}

_generateRemainingQuantity(quantity)
{
    let value = Math.random();
    // 100% remaining quantity 95% of times
    if (value <= 0.95)
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
    let n = this._generateFloat(min, max);
    return parseInt(n);
}

}

module.exports = Exchange;
