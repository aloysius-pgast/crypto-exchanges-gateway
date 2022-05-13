"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:OKEx');
const logger = require('winston');
const Big = require('big.js');
const zlib = require('zlib');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

const WS_URI = 'wss://ws.okx.com:8443/ws/v5/public';

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
 * @return {string}
 */
_toExchangePair(customPair)
{
    let [ baseCurrency, currency ] = customPair.split('-');
    return `${currency}-${baseCurrency}`;
}

/**
 * @return {string}
 */
_toCustomPair(exchangePair)
{
    let [ currency, baseCurrency ] = exchangePair.split('-');
    return `${baseCurrency}-${currency}`;
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
            return `tickers`;
        case 'orderBook':
            return 'books';
        case 'trades':
            return 'trades';
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
        case 'tickers':
            return 'ticker';
        case 'books':
            return 'orderBook';
        case 'trades':
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
    return [{
        channel: exchangeType,
        instId: `${p}`,
        instType: "SPOT"
    }];
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
    return {op:'subscribe',args:parameters};
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
    return {op:'unsubscribe',args:parameters};
}

/*
 * Here we might emit appropriate event such as orderBook, orderBookUpdate if possible
 */
_processMessage(message)
{
    /*
        Data is sent using Deflate compression (see https://www.okx.com/docs/en/#websocket-api)
     */
    this._decodeData(message, (jsonData) => {
        let data;
        try
        {
            data = JSON.parse(jsonData);
        }
        // ignore invalid JSON
        catch (e)
        {
            return;
        }
        try
        {
            // ignore since we won't be able to do anything with this
            if (undefined === data.arg && undefined === data.event)
            {
                return;
            }
            // process suscribe/unsubscribe result
            if (undefined !== data.event) {
                return this._processResult(data);
            }
            const customType = this._getCustomChannelType(data.arg.channel);
            _.forEach(data.data, (e) => {
                switch (customType)
                {
                    case 'ticker':
                        return this._processTickerData(e);
                    case 'orderBook':
                        return this._processOrderBookData(e, data.arg.instId, 'snapshot' === data.action);
                    case 'trades':
                        return this._processTradesData(e);
                }
            });
        }
        catch (e)
        {
            this._logError(e, '_processMessage');
        }
    });
}

/**
 * Decode data received from endpoint :
 * 2022-05-13 : data is not compressed anymore
 */
_decodeData(d, cb)
{
    cb.call(this, d.toString('utf-8'));
}

/*
Process result after subscribe/unsubscribe

Example data (success)

{
   "event":"subscribe",
   "channel":"spot/ticker:NEO-USDT"
}

Example data (error)

{
   "event":"error",
   "message":"Channel spot/tickerinvalid:NEO-USDT doesn't exist",
   "errorCode":30040
}

*/
_processResult(data)
{
    if ('error' !== data.event)
    {
        return;
    }
    logger.warn(`Subscribe/unsubscribe error (${this.getExchangeId()}) : ${JSON.stringify(data)}`);
}

/*
Process tickers data and emit a 'ticker' event

Example data

{
    "instType": "SPOT",
    "instId": "BTC-USDT",
    "last": "30012.9",
    "lastSz": "0.00811145",
    "askPx": "30017.3",
    "askSz": "0.00000058",
    "bidPx": "30017.2",
    "bidSz": "0.10919929",
    "open24h": "28842.3",
    "high24h": "31073",
    "low24h": "28020.3",
    "sodUtc0": "29028.8",
    "sodUtc8": "30337.7",
    "volCcy24h": "475881664.82894433",
    "vol24h": "15802.25746788",
    "ts": "1652474478780"
}

*/
_processTickerData(data)
{
    const pair = this._toCustomPair(data.instId);
    if (debug.enabled)
    {
        debug(`Got ticker for pair '${pair}'`);
    }
    let priceChangePercent = parseFloat(new Big(data.last).minus(data.open24h).div(data.open24h).times(100).toFixed(4));
    if (isNaN(priceChangePercent))
    {
        priceChangePercent = null;
    }
    let ticker = {
        pair:pair,
        last: parseFloat(data.last),
        priceChangePercent:priceChangePercent,
        sell: parseFloat(data.askPx),
        buy: parseFloat(data.bidPx),
        volume: parseFloat(data.vol24h),
        high: parseFloat(data.high24h),
        low: parseFloat(data.low24h),
        timestamp:parseFloat(data.ts / 1000.0)
    }
    this.emit('ticker', {
        pair:pair,
        data:ticker
    });
}

/*
Process order books and emit 'orderBook'/'orderBookUpdate'

Data example for full order book

{
    "asks": [
        [
            "29940.6", // depth price
            "0.06814205", // number of token at the price
            "0", // deprecated (always 0)
            "2" // number of orders at the price
        ],
        [
            "29946.8",
            "0.06389098",
            "0",
            "1"
        ]
    ],
    "bids": [
        [
            "29940.5",
            "0.79407178",
            "0",
            "5"
        ],
        [
            "29924.2",
            "0.05",
            "0",
            "1"
        ]
    ],
    "ts": "1652474743129",
    "checksum": 33278385
}

Data example for order book update (totalSize == 0 => removed from order book)

{
    "asks": [
        [
            "29790.1",
            "0.29494738",
            "0",
            "3"
        ],
        [
            "29793.4",
            "0.025",
            "0",
            "1"
        ]
    ],
    "bids": [
        [
            "29825.3",
            "0",
            "0",
            "0"
        ],
        [
            "29824.4",
            "0",
            "0",
            "0"
        ]
    ],
    "ts": "1652475536404",
    "checksum": 787147469
}

bids and asks value example: In  ["411.8", "10", "0", "4"] "411.8" is the depth price, "10" is the number of token at the price,
"0" is the number of liquidated orders at the price and deprecated, it is always "0", and "4" is the number of orders at the price.

*/
_processOrderBookData(data, exchangePair, isFull)
{
    const pair = this._toCustomPair(exchangePair);
    if (isFull)
    {
        return this._processFullOrderBook(data, pair);
    }
    return this._processOrderBookUpdates(data, pair);
}

/*
 * Process data for a full order book (ie: after subscription)
 *
 * Emit 'orderBook' event
 */
_processFullOrderBook(data, pair)
{
    if (debug.enabled)
    {
        debug(`Got full order book for pair '${pair}': ${data.asks.length} asks, ${data.bids.length} bids`);
    }
    // cseq will be computed by subscription manager
    const evt = {
        pair:pair,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(data.asks, (e) => {
        evt.data.sell.push({quantity:parseFloat(e[1]),rate:parseFloat(e[0])});
    });
    _.forEach(data.bids, (e) => {
        evt.data.buy.push({quantity:parseFloat(e[1]),rate:parseFloat(e[0])});
    });
    this.emit('orderBook', evt);
    return true;
}

/*
 * Process data for a an order book update
 *
 * Emit 'orderBookUpdate' event
 */
_processOrderBookUpdates(data, pair)
{
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${pair}': ${data.asks.length + data.bids.length} changes`);
    }
    // cseq will be computed by subscription manager
    const evt = {
        pair:pair,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(data.asks, (e) => {
        const obj = {
            action: 'update',
            quantity:parseFloat(e[1]),
            rate:parseFloat(e[0])
        }
        // this is a removal
        if (0 == obj.quantity)
        {
            obj.action = 'remove';
        }
        evt.data.sell.push(obj);
    });
    _.forEach(data.bids, (e) => {
        let obj = {
            action: 'update',
            quantity:parseFloat(e[1]),
            rate:parseFloat(e[0])
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

{
    "instId": "BTC-USDT",
    "tradeId": "338559763",
    "px": "29808",
    "sz": "0.00129485",
    "side": "buy",
    "ts": "1652475893267"
}

*/
_processTradesData(data)
{
    let pair = this._toCustomPair(data.instId);
    if (debug.enabled)
    {
        debug(`Got trade update for pair '${pair}'`);
    }
    let evt = {
        pair:pair,
        data:[]
    };
    let orderType = 'sell';
    // seems to be reversed and when 'm' is true, entry is displayed in RED on Binance website
    if ('buy' === data.side)
    {
        orderType = 'buy';
    }
    let obj = {
        id: data.tradeId,
        quantity:parseFloat(data.sz),
        rate:parseFloat(data.px),
        orderType:orderType,
        timestamp:parseFloat(data.ts / 1000.0)
    }
    obj.price = parseFloat(new Big(obj.quantity).times(obj.rate));
    evt.data.unshift(obj);
    this.emit('trades', evt);
    return true;
}

}

module.exports = StreamClient;
