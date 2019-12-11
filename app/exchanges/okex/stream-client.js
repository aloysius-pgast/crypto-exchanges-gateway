"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:OKEx');
const logger = require('winston');
const Big = require('big.js');
const zlib = require('zlib');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

const WS_URI = 'wss://real.okex.com:8443/ws/v3';

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
            return `spot/ticker`;
        case 'orderBook':
            return 'spot/depth';
        case 'trades':
            return 'spot/trade';
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
        case 'spot/ticker':
            return 'ticker';
        case 'spot/depth':
            return 'orderBook';
        case 'spot/trade':
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
    return [`${exchangeType}:${p}`];
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
        Data is sent using Deflate compression (see https://www.okex.com/docs/en/#WebSocketAPI)
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
            if (undefined === data.table && undefined === data.event)
            {
                return;
            }
            // process suscribe/unsubscribe result
            if (undefined !== data.event) {
                return this._processResult(data);
            }
            const customType = this._getCustomChannelType(data.table);
            _.forEach(data.data, (e) => {
                switch (customType)
                {
                    case 'ticker':
                        return this._processTickerData(e);
                    case 'orderBook':
                        return this._processOrderBookData(e, 'partial' === data.action);
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
 * 1) gzip inflate
 */
_decodeData(d, cb)
{
    // we need to use inflateRaw to avoid zlib error 'incorrect header check' (Z_DATA_ERROR)
    zlib.inflateRaw(d, (err, str) => {
        if (null !== err)
        {
            logger.warn("Could not decompress Okex gzip data : %s", err);
            cb.call(this, undefined);
            return;
        }
        cb.call(this, str);
    });
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
   "instrument_id":"BTC-USDT",
   "last":"7174.4",
   "last_qty":"0.0016916",
   "best_bid":"7174.4",
   "best_bid_size":"0.06094569",
   "best_ask":"7174.5",
   "best_ask_size":"4.65278962",
   "open_24h":"7237.2",
   "high_24h":"7271",
   "low_24h":"7132.3",
   "base_volume_24h":"16545.6",
   "quote_volume_24h":"119408171.4",
   "timestamp":"2019-12-11T15:59:52.771Z"
}

*/
_processTickerData(data)
{
    let pair = this._toCustomPair(data.instrument_id);
    if (debug.enabled)
    {
        debug(`Got ticker for pair '${pair}'`);
    }
    let priceChangePercent = parseFloat(new Big(data.last).minus(data.open_24h).div(data.open_24h).times(100).toFixed(4));
    if (isNaN(priceChangePercent))
    {
        priceChangePercent = null;
    }
    let ticker = {
        pair:pair,
        last: parseFloat(data.last),
        priceChangePercent:priceChangePercent,
        sell: parseFloat(data.best_ask),
        buy: parseFloat(data.best_bid),
        volume: parseFloat(data.base_volume_24h),
        high: parseFloat(data.high_24h),
        low: parseFloat(data.low_24h),
        timestamp:parseFloat(new Date(data.timestamp).getTime() / 1000.0)
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
   "instrument_id":"BTC-USDT",
   "asks":[
      [
         "7185.2",
         "0.06",
         "2"
      ],
      [
         "7185.7",
         "0.001",
         "1"
      ],
      [
         "7186.1",
         "0.01",
         "1"
      ]
   ],
   "bids":[
      [
         "7185.1",
         "3.90247387",
         "19"
      ],
      [
         "7185",
         "0.56557922",
         "5"
      ],
      [
         "7184.9",
         "2.12499199",
         "4"
      ]
   ],
   "timestamp":"2019-12-11T16:22:51.107Z",
   "checksum":768871585
}

Data example for order book update (totalSize == 0 => removed from order book)

{
   "instrument_id":"BTC-USDT",
   "asks":[
      [
         "7207.1",
         "0.3",
         "1"
      ]
   ],
   "bids":[
      [
         "7184",
         "1.271",
         "3"
      ],
      [
         "7183.8",
         "0",
         "0"
      ],
      [
         "7176",
         "0.05924333",
         "1"
      ],
      [
         "7171.1",
         "0",
         "0"
      ],
      [
         "7108.1",
         "0.00101",
         "1"
      ]
   ],
   "timestamp":"2019-12-11T16:22:51.251Z",
   "checksum":1303704781
}

bids and asks value example: In ["411.8","10","8"], 411.8 is price depth, 10 is the amount at the price, 8 is the number of orders at the price.

*/
_processOrderBookData(data, isFull)
{
    if (isFull)
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
    let pair = this._toCustomPair(data.instrument_id);
    if (debug.enabled)
    {
        debug(`Got full order book for pair '${pair}': ${data.asks.length} asks, ${data.bids.length} bids`);
    }
    // cseq will be computed by subscription manager
    let evt = {
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
_processOrderBookUpdates(data)
{
    let pair = this._toCustomPair(data.instrument_id);
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${pair}': ${data.asks.length + data.bids.length} changes`);
    }
    // cseq will be computed by subscription manager
    let evt = {
        pair:pair,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(data.asks, (e) => {
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
   "instrument_id":"BTC-USDT",
   "price":"7200.7",
   "side":"sell",
   "size":"0.00127736",
   "timestamp":"2019-12-11T16:44:56.768Z",
   "trade_id":"2750455009"
}

*/
_processTradesData(data)
{
    let pair = this._toCustomPair(data.instrument_id);
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
        id: data.trade_id,
        quantity:parseFloat(data.size),
        rate:parseFloat(data.price),
        orderType:orderType,
        timestamp:parseFloat(new Date(data.timestamp).getTime() / 1000.0)
    }
    obj.price = parseFloat(new Big(obj.quantity).times(obj.rate));
    evt.data.unshift(obj);
    this.emit('trades', evt);
    return true;
}

}

module.exports = StreamClient;
