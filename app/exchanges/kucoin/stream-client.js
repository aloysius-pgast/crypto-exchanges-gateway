"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Kucoin');
const logger = require('winston');
const Big = require('big.js');
const zlib = require('zlib');
const request = require('request');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');
const LOGIN_URI = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
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
        options.method = 'POST';
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
            if (undefined === body.data.token)
            {
                logger.warn("Could not retrieve WS endpoint information for '%s' exchange : 'token' is missing", this.getExchangeId());
                return resolve(null);
            }
            if (undefined === body.data || undefined === body.data.instanceServers || 0 == body.data.instanceServers.length)
            {
                logger.warn("Could not retrieve WS endpoint information for '%s' exchange : 'data.instanceServers' is missing or empty", this.getExchangeId());
                return resolve(null);
            }
            const data = {
                queryParams:{
                    token:body.data.token
                }
            };
            // use first server
            data.uri = body.data.instanceServers[0].endpoint;
            // NB : keepalive using Ping API is not needed since native WS ping will ensure connection stays open
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
            return {type:'subscribe',topic:`/market/snapshot:${exchangePair}`,response:true,privateChannel:false};
        case 'orderBook':
            return {type:'subscribe',topic:`/market/level2:${exchangePair}`,response:true,privateChannel:false};
        case 'trades':
            return {type:'subscribe',topic:`/market/match:${exchangePair}`,response:true,privateChannel:false};
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
            return {type:'unsubscribe',topic:`/market/snapshot:${exchangePair}`,response:true,privateChannel:false};
        case 'orderBook':
            return {type:'unsubscribe',topic:`/market/level2:${exchangePair}`,response:true,privateChannel:false};
        case 'trades':
            return {type:'unsubscribe',topic:`/market/match:${exchangePair}`,response:true,privateChannel:false};
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
        "sequence":"1550467113084",
        "symbol":"BTC-USDT",
        "side":"sell",
        "size":"0.025200670000000000000000000000000",
        "price":"3928.46558801000000000000",
        "takerOrderId":"5c6d1d515137b91f19490eae",
        "time":"1550654801948521495",
        "type":"match",
        "makerOrderId":"5c6d1cf9c788c6111ba7b263",
        "tradeId":"5c6d1d51ab93db711c206b69"
    },
    "subject":"trade.l3match",
    "topic":"/market/match:BTC-USDT",
    "id":"5c6d1d51ab93db711c206b69",
    "sn":1550467113084,
    "type":"message"
}

2) Order book update

{
    "data":{
        "sequenceStart":1550467110959,
        "symbol":"BTC-USDT",
        "changes":{
            "asks":[

            ],
            "bids":[
                [
                    "0", // price
                    "0", // size
                    "1550467110959" // sequence
                ]
            ]
        },
        "sequenceEnd":1550467110959
    },
    "subject":"trade.l2update",
    "topic":"/market/level2:BTC-USDT",
    "type":"message"
}

3) Ticker

{
    "data":{
        "sequence":"1550467108699",
        "data":{
            "trading":true,
            "symbol":"BTC-USDT",
            "buy":3907.96473101,
            "sell":3910.59642466,
            "sort":100,
            "volValue":625464.43726646701675060000,
            "baseCurrency":"BTC",
            "market":"SC",
            "quoteCurrency":"USDT",
            "symbolCode":"BTC-USDT",
            "datetime":1550649830150,
            "high":3992.14813500000000000000,
            "vol":159.44743710000000000000,
            "low":3855.00000100000000000000,
            "changePrice":10.59642467000000000000,
            "changeRate":0.0027,
            "close":3910.59642467,
            "lastTradedPrice":3910.59642467,
            "board":1,
            "mark":0,
            "open":3900.00000000000000000000
        }
    },
    "subject":"trade.snapshot",
    "topic":"/market/snapshot:BTC-USDT",
    "type":"message"
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
        let [topic, exchangePair] = data.topic.split(':');
        const customPair = this._toCustomPair(exchangePair);
        switch (topic)
        {
            case '/market/snapshot':
                return this._processTickerData(data, customPair);
            case '/market/level2':
                return this._processOrderBookData(data, customPair);
            case '/market/match':
                return this._processTradesData(data, customPair);
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
        "sequence":"1550467108699",
        "data":{
            "trading":true,
            "symbol":"BTC-USDT",
            "buy":3907.96473101,
            "sell":3910.59642466,
            "sort":100,
            "volValue":625464.43726646701675060000,
            "baseCurrency":"BTC",
            "market":"SC",
            "quoteCurrency":"USDT",
            "symbolCode":"BTC-USDT",
            "datetime":1550649830150,
            "high":3992.14813500000000000000,
            "vol":159.44743710000000000000,
            "low":3855.00000100000000000000,
            "changePrice":10.59642467000000000000,
            "changeRate":0.0027,
            "close":3910.59642467,
            "lastTradedPrice":3910.59642467,
            "board":1,
            "mark":0,
            "open":3900.00000000000000000000
        }
    },
    "subject":"trade.snapshot",
    "topic":"/market/snapshot:BTC-USDT",
    "type":"message"
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
            last:data.data.data.lastTradedPrice,
            priceChangePercent:parseFloat((100 * data.data.data.changeRate).toFixed(4)),
            sell:parseFloat(data.data.data.sell),
            buy:parseFloat(data.data.data.buy),
            high:parseFloat(data.data.data.high),
            low:parseFloat(data.data.data.low),
            volume:parseFloat(data.data.data.vol),
            timestamp:parseFloat(data.data.data.datetime / 1000.0)
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
        "sequenceStart":1550467110959,
        "symbol":"BTC-USDT",
        "changes":{
            "asks":[

            ],
            "bids":[
                [
                    "0", // price
                    "0", // size
                    "1550467110959" // sequence
                ]
            ]
        },
        "sequenceEnd":1550467110959
    },
    "subject":"trade.l2update",
    "topic":"/market/level2:BTC-USDT",
    "type":"message"
}

*/
_processOrderBookData(data, customPair)
{
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${customPair}': ${data.data.changes.asks.length + data.data.changes.bids.length} changes`);
    }

    //-- build a list of all changes using sequence as key
    const changes = {};
    // process asks
    _.forEach(data.data.changes.asks, (arr) => {
        let action = 'update';
        if ('0' == arr[1])
        {
            action = 'remove';
        }
        changes[arr[2]] = {
            type:'sell',
            data:{
                action:action,
                rate:parseFloat(arr[0]),
                quantity:parseFloat(arr[1])
            }
        };
    });
    // process bids
    _.forEach(data.data.changes.bids, (arr) => {
        let action = 'update';
        if ('0' == arr[1])
        {
            action = 'remove';
        }
        changes[arr[2]] = {
            type:'buy',
            data:{
                action:action,
                rate:parseFloat(arr[0]),
                quantity:parseFloat(arr[1])
            }
        };
    });

    //-- emit events
    const keys = Object.keys(changes).sort();
    _.forEach(keys, (sequence) => {
        const evt = {
            pair:customPair,
            cseq:sequence,
        };
        if ('buy' == changes[sequence].type)
        {
            evt.data = {
                buy:[changes[sequence].data],
                sell:[]
            };
        }
        else
        {
            evt.data = {
                buy:[],
                sell:[changes[sequence].data]
            };
        }
        this.emit('orderBookUpdate', evt);
    });
}

/*
Process trades data and emit a 'trades' event

{
    "data":{
        "sequence":"1550467113084",
        "symbol":"BTC-USDT",
        "side":"sell",
        "size":"0.025200670000000000000000000000000",
        "price":"3928.46558801000000000000",
        "takerOrderId":"5c6d1d515137b91f19490eae",
        "time":"1550654801948521495",
        "type":"match",
        "makerOrderId":"5c6d1cf9c788c6111ba7b263",
        "tradeId":"5c6d1d51ab93db711c206b69"
    },
    "subject":"trade.l3match",
    "topic":"/market/match:BTC-USDT",
    "id":"5c6d1d51ab93db711c206b69",
    "sn":1550467113084,
    "type":"message"
}

*/
_processTradesData(data, customPair)
{
    if (debug.enabled)
    {
        debug(`Got trades update for pair '${customPair}': 1 trade`);
    }
    let price = parseFloat(new Big(data.data.size).times(data.data.price));
    const evt = {
        pair:customPair,
        data:[{
            // use sequence as tradeId like we do in REST API
            id:data.data.sequence,
            quantity:parseFloat(data.data.size),
            rate:parseFloat(data.data.price),
            price:price,
            orderType:data.data.side,
            timestamp:parseFloat(data.data.time / 1000.0)
        }]
    };
    this.emit('trades', evt);
}

}

module.exports = StreamClient;
