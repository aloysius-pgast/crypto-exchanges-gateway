"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:OKEx');
const logger = require('winston');
const Big = require('big.js');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

const WS_URI = 'wss://real.okex.com:10441/websocket';

class StreamClient extends AbstractExchangeStreamClientClass
{

/**
 * Constructor
 *
 */
constructor(exchangeId)
{
    super(exchangeId, WS_URI);
}

/**
 * @return {baseCurrency:string, currency:string}
 */
_toExchangePair(pair)
{
    let [ baseCurrency, currency ] = pair.split('-');
    return {
        baseCurrency:baseCurrency.toLowerCase(),
        currency:currency.toLowerCase()
    }
}

_toCustomPair(baseCurrency, currency)
{
    return `${baseCurrency}-${currency}`.toUpperCase();
}

/**
 * Map custom subscription type to exchange subscription type
 * @return {string}
 */
_getExchangeChannelType(customType)
{
    switch (customType)
    {
        case 'ticker':
            return customType;
        case 'orderBook':
            return 'depth';
        case 'trades':
            return 'deal';
    }
    logger.warn(`Unknown channel customType '${customType}' for exchange '${this.getExchangeId()}'`);
    return null;
}

/**
 * Map exchange subscription type to custom subscription type
 * @return {string}
 */
_getCustomChannelType(exchangeType)
{
    switch (exchangeType)
    {
        case 'ticker':
            return exchangeType;
        case 'depth':
            return 'orderBook';
        case 'deal':
            return 'trades';
    }
    logger.warn(`Unknown channel exchangeType '${exchangeType}' for exchange '${this.getExchangeId()}'`);
    return null;
}

/**
 * @param {string} type custom channel type (ticker,orderBook,trades)
 * @param {string} pair custom pair (X-Y)
 * @return {object}
 */
_getChannelParameters(type, pair)
{
    let exchangeType = this._getExchangeChannelType(type);
    if (null === exchangeType)
    {
        return null;
    }
    let p = this._toExchangePair(pair);
    return {binary:0, product:'spot', type:exchangeType, base:p.currency, quote:p.baseCurrency};
}

/**
 * Generates a subscribe message
 *
 * Type can be one of (ticker,orderBook,trades)
 *
 * @param {object} channel {type:string,pair:string}
 */
getSubscribeMessage(channel)
{
    let parameters = this._getChannelParameters(channel.type, channel.pair);
    if (null === parameters)
    {
        return null;
    }
    return {event:'addChannel',parameters:parameters};
}

/**
 * Generates an unsubscribe message
 *
 * Type can be one of (ticker,orderBook,trades)
 *
 * @param {object} channel {type:string,pair:string}
 */
getUnsubscribeMessage(channel)
{
    let parameters = this._getChannelParameters(channel.type, channel.pair);
    if (null === parameters)
    {
        return null;
    }
    return {event:'removeChannel',parameters:parameters};
}

/*
 * Here we might emit appropriate event such as orderBook, orderBookUpdate if possible
 */
_processMessage(message)
{
    let data;
    try
    {
        data = JSON.parse(message);
    }
    // ignore invalid JSON
    catch (e)
    {
        return;
    }
    try
    {
        _.forEach(data, (e) => {
            // ignore since we won't be able to do anything with this
            if (undefined === e.type || undefined === e.data)
            {
                return;
            }
            if (undefined !== e.data.result)
            {
                return this._processResult(e);
            }
            let customType = this._getCustomChannelType(e.type);
            if (null === customType)
            {
                return;
            }
            switch (customType)
            {
                case 'ticker':
                    return this._processTickerData(e);
                case 'orderBook':
                    return this._processOrderBookData(e);
                case 'trades':
                    return this._processTradesData(e);
            }
        });
    }
    catch (e)
    {
        this._logError(e);
    }
}

/*
Process result after adding/removing a channel

Example data (success)

[
    {
        "base":"btc",
        "binary":0,
        "channel":"addChannel",
        "data":{
            "result":true
        },
        "product":"spot",
        "quote":"usdt",
        "type":"ticker"
    }
]

Example data (error)

[
    {
        "binary":0,
        "channel":"addChannel",
        "data":{
            "result":false,
            "error_msg":"The require parameters cannot be empty.",
            "error_code":10000
        },
        "product":"spot",
        "quote":"usdt",
        "type":"ticker"
    }
]

*/
_processResult(data)
{
    if (data.data.result)
    {
        return;
    }
    logger.warn(`Subscribe/unsubscribe error (${this.getExchangeId()}) : ${JSON.stringify(data)}`);
}

/*
Process tickers data and emit a 'ticker' event

Example data

[
    {
        "base":"btc",
        "binary":0,
        "data":{
            "symbol":"btc_usdt",
            "last":"6749.4851",
            "productId":20,
            "buy":"6745.2065",
            "change":"-2.2201",
            "sell":"6748.8549",
            "outflows":"69471168.36789888",
            "dayLow":"6558.0000",
            "volume":"21055.0872",
            "high":"6774.4826",
            "createdDate":1529509433300,
            "inflows":"70899426.01477612",
            "low":"6558.0000",
            "marketFrom":118,
            "changePercentage":"-0.03%",
            "currencyId":20,
            "close":"6749.4851",
            "dayHigh":"6774.4826",
            "open":"6751.7052"
        },
        "product":"spot",
        "quote":"usdt",
        "type":"ticker"
    }
]

*/
_processTickerData(data)
{
    let pair = this._toCustomPair(data.quote, data.base);
    if (debug.enabled)
    {
        debug(`Got ticker for pair '${pair}'`);
    }
    let priceChangePercent = parseFloat(data.data.changePercentage);
    if (isNaN(priceChangePercent))
    {
        priceChangePercent = null;
    }
    let ticker = {
        pair:pair,
        last: parseFloat(data.data.last),
        sell: parseFloat(data.data.sell),
        buy: parseFloat(data.data.buy),
        priceChangePercent: priceChangePercent,
        volume: parseFloat(data.data.volume),
        high: parseFloat(data.data.high),
        low: parseFloat(data.data.low),
        timestamp:data.data.createdDate / 1000.0
    }
    if (isNaN)
    this.emit('ticker', {
        pair:pair,
        data:ticker
    });
}

/*
Process order books and emit 'orderBook'/'orderBookUpdate'

Data example for full order book

[
    {
        "base":"btc",
        "binary":0,
        "data":{
            "init":true,
            "asks":[
                {
                    "totalSize":"8.477",
                    "price":"6745.65"
                },
                {
                    "totalSize":"1",
                    "price":"6747.0824"
                },
                {
                    "totalSize":"1",
                    "price":"6747.87"
                }
            ],
            "bids":[
                {
                    "totalSize":"0.02",
                    "price":"6743.8001"
                },
                {
                    "totalSize":"0.15",
                    "price":"6743.5845"
                },
                {
                    "totalSize":"1",
                    "price":"6742.6083"
                },
                {
                    "totalSize":"1",
                    "price":"6742.5099"
                }
            ]
        },
        "product":"spot",
        "quote":"usdt",
        "type":"depth"
    }
]

Data example for order book update (totalSize == 0 => removed from order book)

[
    {
        "base":"btc",
        "binary":0,
        "data":{
            "asks":[
                {
                    "totalSize":"0",
                    "price":"7243.7302"
                },
                {
                    "totalSize":"0",
                    "price":"6793.27"
                },
                {
                    "totalSize":"0",
                    "price":"6791.14"
                },
                {
                    "totalSize":"0.11",
                    "price":"6762.154"
                }
            ],
            "bids":[
                {
                    "totalSize":"0",
                    "price":"6743.8001"
                },
                {
                    "totalSize":"0",
                    "price":"6741.4351"
                },
                {
                    "totalSize":"0.27652928",
                    "price":"6740.849"
                }
            ]
        },
        "product":"spot",
        "quote":"usdt",
        "type":"depth"
    }
]

*/
_processOrderBookData(data)
{
    if (true === data.data.init)
    {
        return this._processFullOrderBook(data);
    }
    return this._processOrderBookUpdates(data);
}

/*
 * Process data for a full order book (ie: after subscription)
 *
 * Emit 'orderBook' event
 */
_processFullOrderBook(data)
{
    let pair = this._toCustomPair(data.quote, data.base);
    if (debug.enabled)
    {
        debug(`Got full order book for pair '${pair}': ${data.data.asks.length} asks, ${data.data.bids.length} bids`);
    }
    // cseq will be computed by subscription manager
    let evt = {
        pair:pair,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(data.data.asks, (e) => {
        evt.data.sell.push({quantity:parseFloat(e.totalSize),rate:parseFloat(e.price)});
    });
    _.forEach(data.data.bids, (e) => {
        evt.data.buy.push({quantity:parseFloat(e.totalSize),rate:parseFloat(e.price)});
    });
    this.emit('orderBook', evt);
    return true;
}

/*
 * Process data for a an order book update
 *
 * Emit 'orderBookUpdate' event
 */
_processOrderBookUpdates(data)
{
    let pair = this._toCustomPair(data.quote, data.base);
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${pair}': ${data.data.asks.length + data.data.bids.length} changes`);
    }
    // cseq will be computed by subscription manager
    let evt = {
        pair:pair,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(data.data.asks, (e) => {
        let obj = {
            action: 'update',
            quantity:parseFloat(e.totalSize),
            rate:parseFloat(e.price)
        }
        // this is a removal
        if (0 == obj.quantity)
        {
            obj.action = 'remove';
        }
        evt.data.sell.push(obj);
    });
    _.forEach(data.data.bids, (e) => {
        let obj = {
            action: 'update',
            quantity:parseFloat(e.totalSize),
            rate:parseFloat(e.price)
        }
        // this is a removal
        if (0 == obj.quantity)
        {
            obj.action = 'remove';
        }
        evt.data.buy.push(obj);
    });
    this.emit('orderBookUpdate', evt);
    return true;
}

/*
Process trades data and emit a 'trades' event

Example data (side == 1 => buy, side == 2 => sell)

[
    {
        "base":"btc",
        "binary":0,
        "data":[
            {
                "amount":"0.00100707",
                "side":1,
                "createdDate":1529509927173,
                "price":"6742.92",
                "id":407168620
            },
            {
                "amount":"0.00408789",
                "side":1,
                "createdDate":1529509927247,
                "price":"6742.92",
                "id":407168625
            }
        ],
        "product":"spot",
        "quote":"usdt",
        "type":"deal"
    }
]
*/
_processTradesData(data)
{
    let pair = this._toCustomPair(data.quote, data.base);
    if (debug.enabled)
    {
        debug(`Got trades update for pair '${pair}': ${data.data.length} trades`);
    }
    let evt = {
        pair:pair,
        data:[]
    };
    _.forEach(data.data, (trade) => {
        let obj = {
            id: trade.id,
            quantity:parseFloat(trade.amount),
            rate:parseFloat(trade.price),
            timestamp:trade.createdDate / 1000.0
        }
        obj.price = parseFloat(new Big(obj.quantity).times(obj.rate));
        evt.data.unshift(obj);
    });
    this.emit('trades', evt);
    return true;
}

}

module.exports = StreamClient;
