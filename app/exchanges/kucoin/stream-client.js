"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Kucoin');
const logger = require('winston');
const Big = require('big.js');
const zlib = require('zlib');
const request = require('request');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');
const LOGIN_URI = 'https://kitchen.kucoin.com/v1/bullet/usercenter/loginUser?protocol=websocket&encrypt=true';
const DEFAULT_SOCKETTIMEOUT = 60 * 1000;

/*
    Documentation is available at https://kucoinapidocs.docs.apiary.io/#introduction/websocket
    NB: be prepared for connection problems as Kucoin is likely to return 2-3 502 (Bad Gateway) before a successful connection is made

    Kucoin supports a Ping API :

    "As the timeout setting in the sever is 60000ms, you are recommended to set the ping interval into 40000ms."

    There is no need to use it as native WS ping will ensure connection stays open
 */

class StreamClient extends AbstractExchangeStreamClientClass
{

/**
 * Constructor
 *
 */
constructor(exchangeId)
{
    const uri = `wss://${exchangeId}.dynamic`;
    super(exchangeId, uri, {
        onPrepareRequest:() => {
            return this._prepareRequest();
        }
    });
}

/**
 * Retrieve ws endpoint informations (ie: bulletToken & uri)
 *
 * @return {Promise} Promise which will resolve to {uri:string, headers:{},queryParams:{}} on success and null on error
 */
async _prepareRequest()
{
    return new Promise((resolve, reject) => {
        let options = {};
        options.json = true;
        options.timeout = DEFAULT_SOCKETTIMEOUT;
        options.method = 'GET';
        options.url = LOGIN_URI;
        request(options, (error, response, body) => {
            if (null !== error)
            {
                this._logNetworkError(error, '_prepareRequest');
                return resolve(null);
            }
            if (200 != response.statusCode)
            {
                this._logNetworkError(response, '_prepareRequest');
                return resolve(null);
            }
            if (undefined === body.success || false === body.success)
            {
                this._logNetworkError(JSON.stringify(body), '_prepareRequest');
                return resolve(null);
            }
            if (undefined === body.data.bulletToken)
            {
                logger.warn("Could not retrieve WS endpoint information for '%s' exchange : 'bulletToken' is missing", this.getExchangeId());
                return resolve(null);
            }
            if (undefined === body.data || undefined === body.data.instanceServers)
            {
                logger.warn("Could not retrieve WS endpoint information for '%s' exchange : 'data.instanceServers' is missing", this.getExchangeId());
                return resolve(null);
            }
            const data = {
                queryParams:{
                    format:'json',
                    resource:'api',
                    bulletToken:body.data.bulletToken
                }
            };
            for (let i = 0; i < body.data.instanceServers.length; ++i)
            {
                // find instance server with type = 'normal'
                if ('normal' == body.data.instanceServers[i].userType)
                {
                    data.uri = `${body.data.instanceServers[i].endpoint}`;
                    // NB : keepalive using Ping API is not needed since native WS ping will ensure connection stays open
                    break;
                }
            }
            if (undefined === data.uri)
            {
                logger.warn("Could not retrieve WS endpoint information for '%s' exchange : no 'normal' endpoint defined", this.getExchangeId());
                return resolve(null);
            }
            return resolve(data);
        });
    });
}

/**
 * Convert pair from exchange format Y-X to custom format X-Y
 *
 * @param {string} pair pair in exchange format (Y-X)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let arr = pair.split('-');
    return arr[1] + '-' + arr[0];
}

/**
 * Convert pair from custom format X-Y to exchange format Y-X
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (Y-X)
 */
_toExchangePair(pair)
{
    let arr = pair.split('-');
    return arr[1] + '-' + arr[0];
}

/**
 * Generates a subscribe message
 *
 * Type can be one of (ticker,orderBook,trades)
 *
 * @param {object} obj {type:string,pair:string}
 */
getSubscribeMessage(obj)
{
    const exchangePair = this._toExchangePair(obj.pair);
    switch (obj.type)
    {
        case 'ticker':
            return {type:'subscribe',topic:`/market/${exchangePair}_TICK`};
        case 'orderBook':
            return {type:'subscribe',topic:`/trade/${exchangePair}_TRADE`};
        case 'trades':
            return {type:'subscribe',topic:`/trade/${exchangePair}_HISTORY`};
    }
    logger.warn(`Unknown subscription type '${obj.type}' for exchange '${this.getExchangeId()}'`);
    return null;
}

/**
 * Generates an unsubscribe message
 *
 * Type can be one of (ticker,orderBook,trades)
 *
 * @param {object} obj {type:string,pair:string}
 */
getUnsubscribeMessage(obj)
{
    const exchangePair = this._toExchangePair(obj.pair);
    switch (obj.type)
    {
        case 'ticker':
            return {type:'unsubscribe',topic:`/market/${exchangePair}_TICK`};
        case 'orderBook':
            return {type:'unsubscribe',topic:`/trade/${exchangePair}_TRADE`};
        case 'trades':
            return {type:'unsubscribe',topic:`/trade/${exchangePair}_HISTORY`};
    }
    logger.warn(`Unknown subscription type '${obj.type}' for exchange '${this.getExchangeId()}'`);
    return null;
}

/*
 * Here we might emit appropriate event such as orderBook, orderBookUpdate if possible
 */
/*
Example data

1) Trade

{
    "data":{
        "price":0.02866,
        "count":0.0865062,
        "oid":"5bfbb04b9dda1573e89a38c1",
        "time":1543221323000,
        "volValue":0.00247927,
        "direction":"SELL"
    },
    "topic":"/trade/ETH-BTC_HISTORY",
    "type":"message",
    "seq":32751262911320
}

2) Order book update

{
    "data":{
        "volume":0.23614824,
        "price":0.02951853,
        "count":8.0,
        "action":"CANCEL",
        "time":1542877609922,
        "type":"BUY"
    },
    "topic":"/trade/ETH-BTC_TRADE",
    "type":"message",
    "seq":32751078211243
}

3) Ticker

{
    "data":{
        "coinType":"ETH",
        "trading":true,
        "symbol":"ETH-BTC",
        "lastDealPrice":0.02871161,
        "buy":0.02868336,
        "sell":0.02872164,
        "change":0.00042203,
        "coinTypePair":"BTC",
        "sort":100,
        "feeRate":0.001,
        "volValue":283.35185445,
        "high":0.029413,
        "datetime":1543221464000,
        "vol":9867.4494819,
        "low":0.02787778,
        "changeRate":0.0149
    },
    "topic":"/market/ETH-BTC_TICK",
    "type":"message",
    "seq":32751262988174
}

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
    if (undefined === data.type)
    {
        logger.warn("Received WS message from '%s' without 'type' : %s", this.getExchangeId(), message);
        return;
    }
    if ('error' == data.type)
    {
        logger.warn("Received WS error message from '%s' : %s", this.getExchangeId(), message);
        return;
    }
    // ignore ack
    if ('ack' == data.type)
    {
        return;
    }
    // we're only intereset in type = message
    if ('message' !== data.type)
    {
        return;
    }
    if (undefined === data.topic)
    {
        logger.warn("Received WS message from '%s' without 'topic' : %s", this.getExchangeId(), message);
        return;
    }
    // decide what to do based on 'topic'
    try
    {
        let [exchangePair, topic] = data.topic.split('/').pop().split('_');
        const customPair = this._toCustomPair(exchangePair);
        switch (topic)
        {
            case 'TICK':
                return this._processTickerData(data, customPair);
            case 'HISTORY':
                return this._processTradesData(data, customPair);
            // this is bad naming but topic = TRADE refers to orderbook updates
            case 'TRADE':
                return this._processOrderBookData(data, customPair);
        }
    }
    catch (e)
    {
        this._logError(e, '_processMessage');
    }
}

/*
Process tickers data and emit a 'ticker' event

Example data

{
    "data":{
        "coinType":"ETH",
        "trading":true,
        "symbol":"ETH-BTC",
        "lastDealPrice":0.02871161,
        "buy":0.02868336,
        "sell":0.02872164,
        "change":0.00042203,
        "coinTypePair":"BTC",
        "sort":100,
        "feeRate":0.001,
        "volValue":283.35185445,
        "high":0.029413,
        "datetime":1543221464000,
        "vol":9867.4494819,
        "low":0.02787778,
        "changeRate":0.0149
    },
    "topic":"/market/ETH-BTC_TICK",
    "type":"message",
    "seq":32751262988174
}

*/
_processTickerData(data, customPair)
{
    if (debug.enabled)
    {
        debug(`Got ticker for pair '${customPair}'`);
    }
    const evt = {
        pair:customPair,
        data:{
            pair:customPair,
            last:data.data.lastDealPrice,
            priceChangePercent:data.data.changeRate,
            sell:data.data.sell,
            buy:data.data.buy,
            high:data.data.high,
            low:data.data.low,
            volume:data.data.vol,
            timestamp:parseFloat(data.data.datetime / 1000.0)
        }
    };
    this.emit('ticker', evt);
}

/*
 * Process data for a an order book update
 *
 * Emit 'orderBookUpdate' event
 */
/*
Example data

{
    "data":{
        "volume":0.23614824,
        "price":0.02951853,
        "count":8.0,
        "action":"CANCEL",
        "time":1542877609922,
        "type":"BUY"
    },
    "topic":"/trade/ETH-BTC_TRADE",
    "type":"message",
    "seq":32751078211243
}

NB: date.action can be CANCEL|ADD

*/
_processOrderBookData(data, customPair)
{
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${customPair}': 1 change`);
    }
    let action = 'update';
    if ('CANCEL' == data.data.action)
    {
        action = 'remove';
    }
    const entry = {
        quantity:data.data.count,
        rate:data.data.price,
        action:action
    };
    const evt = {
        pair:customPair,
        cseq:data.seq,
        timestamp:data.data.time,
        data:{
            buy:[],
            sell:[]
        }
    };
    if ('SELL' == data.data.type)
    {
        evt.data.sell.push(entry);
    }
    else
    {
        evt.data.buy.push(entry);
    }
    this.emit('orderBookUpdate', evt);
}

/*
Process trades data and emit a 'trades' event

{
    "data":{
        "price":0.02866,
        "count":0.0865062,
        "oid":"5bfbb04b9dda1573e89a38c1",
        "time":1543221323000,
        "volValue":0.00247927,
        "direction":"SELL"
    },
    "topic":"/trade/ETH-BTC_HISTORY",
    "type":"message",
    "seq":32751262911320
}

*/
_processTradesData(data, customPair)
{
    if (debug.enabled)
    {
        debug(`Got trades update for pair '${customPair}': 1 trade`);
    }
    let price = parseFloat(new Big(data.data.count).times(data.data.price));
    let orderType = 'sell';
    if ('SELL' != data.data.direction)
    {
        orderType = 'buy';
    }
    const evt = {
        pair:customPair,
        data:[{
            id:data.data.oid,
            quantity:data.data.count,
            rate:data.data.price,
            price:price,
            orderType:orderType,
            timestamp:parseFloat(data.data.time / 1000.0)
        }]
    };
    this.emit('trades', evt);
}

}

module.exports = StreamClient;
