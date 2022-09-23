"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Poloniex');
const logger = require('winston');
const Big = require('big.js');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

const WS_URI = 'wss://ws.poloniex.com/ws/public';

class StreamClient extends AbstractExchangeStreamClientClass
{

/**
 * Constructor
 *
 */
constructor(exchangeId)
{
    super(exchangeId, WS_URI);
    this._pingLoop = undefined;
}

/**
 * Convert pair from exchange format Y_X to custom format X-Y
 *
 * @param {string} pair pair in exchange format (Y_X)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let arr = pair.split('_');
    return arr[1] + '-' + arr[0];
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

    // replies
    if (data.event) {
        if ('error' == data.event) {
            logger.warn(JSON.stringify(error));
        }
        return;
    }
    if (data.channel) {
        switch (data.channel) {
            case 'ticker':
                return this._processTicker(data.data);
            case 'book_lv2':
                if ('snapshot' == data.action) {
                    return this._processFullOrderBook(data.data);
                }
                return this._processOrderBookUpdates(data.data);
            case 'trades':
                return this._processTrades(data.data);
        }
    }
}

/*
  Process tickers data and emit a 'ticker' event

  Data example (only .data will be passed)

  {
    "channel": "ticker",
    "data": [
        {
            "symbol": "BTC_USDT",
            "dailyChange": "0.0406",
            "high": "19489.67",
            "amount": "9006545.33182141",
            "quantity": "477.272011",
            "tradeCount": 10944,
            "low": "18152.68",
            "closeTime": 1663883645828,
            "startTime": 1663797240000,
            "close": "19192.19",
            "open": "18478.03",
            "ts": 1663883659246
        }
    ]
  }

 */
_processTicker(data)
{
    if (!data.length) {
        return;
    }
    if (debug.enabled)
    {
        debug(`Got tickers for pair '${data[0].symbol}': ${data.length} tickers`);
    }
    for (const obj of data) {
        const pair = this._toCustomPair(obj.symbol);
        const priceChange = parseFloat(obj.close) - parseFloat(obj.open);
        const priceChangePercent = 100 * (priceChange / parseFloat(obj.open));
        const ticker = {
            pair: pair,
            last: null,
            sell: null,
            buy: null,
            priceChangePercent: parseFloat(priceChangePercent.toFixed(3)),
            volume: parseFloat(obj.quantity),
            high: parseFloat(obj.high),
            low: parseFloat(obj.low),
            timestamp: parseFloat(obj.ts / 1000.0)
        }
        this.emit('ticker', {
            pair: pair,
            data: ticker
        });
    }
}

/*
  Process data for a full order book (ie: after subscription)
 
  Emit an 'orderBook' event

  Data example (only .data will be passed)
  
  {
    "channel": "book_lv2",
    "data": [
        {
            "symbol": "BTC_USDT",
            "createTime": 1663883462090,
            "asks": [
                [
                    "19208.61",
                    "1.385975"
                ],
                [
                    "19215.73",
                    "0.7"
                ]
            ],
            "bids": [
                [
                    "19201.4",
                    "0.080"
                ],
                [
                    "19190.8",
                    "0.7"
                ]
            ],
            "lastId": 26664946,
            "id": 26664947,
            "ts": 1663883462157
        }
    ],
    "action": "snapshot"
  }  
  
 */
_processFullOrderBook(data)
{
    if (!data.length) {
        return;
    }
    if (debug.enabled)
    {
        debug(`Got full order book for pair '${data[0].symbol}': ${data[0].asks.length} asks, ${data[0].bids.length} bids`);
    }
    for (const obj of data) {
        const pair = this._toCustomPair(obj.symbol);
        const evt = {
            pair: pair,
            cseq: obj.id,
            data:{
                buy: [],
                sell: []
            }
        };
        for (const item of obj.asks) {
            evt.data.sell.push({quantity:parseFloat(item[1]),rate:parseFloat(item[0])});
        }
        for (const item of obj.bids) {
            evt.data.buy.push({quantity:parseFloat(item[1]),rate:parseFloat(item[0])});
        }
        this.emit('orderBook', evt);
    }
}

/*
   Process data for an order book update
 
   Emit an 'orderBookUpdate' event

   Data example (only .data will be passed)

   {
       "channel": "book_lv2",
       "data": [
           {
               "symbol": "BTC_USDT",
               "createTime": 1663883343056,
               "asks": [
                   [
                       "19232.73",
                       "0"
                   ],
                   [
                       "19380",
                       "0.00009"
                   ]
                ],
                "bids": [],
                "lastId": 26664362,
                "id": 26664364,
                "ts": 1663883343060
           }
        ],
        "action": "update"
  }

 */
_processOrderBookUpdates(data)
{
    if (!data.length) {
        return;
    }
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${data[0].symbol}': ${data[0].asks.length} asks, ${data[0].bids.length} bids`);
    }
    for (const obj of data) {
        const pair = this._toCustomPair(obj.symbol);
        const evt = {
            pair: pair,
            cseq: obj.id,
            data: {
                buy: [],
                sell: []
            }
        };
        for (const item of obj.asks) {
            evt.data.sell.push({quantity:parseFloat(item[1]),rate:parseFloat(item[0])});
        }
        for (const item of obj.bids) {
            evt.data.buy.push({quantity:parseFloat(item[1]),rate:parseFloat(item[0])});
        }
        this.emit('orderBookUpdate', evt);
    }
}

/*
  Process trades data
  
  Emit a 'trades' event

  Data example (only .data will be passed)

  {
      "channel": "trades",
      "data": [
          {
              "symbol": "BTC_USDT",
              "amount": "704.40501448",
              "quantity": "0.036646",
              "takerSide": "sell",
              "createTime": 1663882880046,
              "price": "19221.88",
              "id": "60531640",
              "ts": 1663882880051
          }
      ]
  }

 */
_processTrades(data)
{
    if (!data.length) {
        return;
    }
    if (debug.enabled)
    {
        debug(`Got trades for pair '${data[0].symbol}': ${data.length} trades`);
    }
    let tradesByPair = {};
    _.forEach(data, (obj) => {
        const pair = this._toCustomPair(obj.symbol);
        if (!tradesByPair[pair]) {
            tradesByPair[pair] = [];
        }
        const trade = {
            id: obj.id,
            orderType: obj.takerSide,
            quantity: parseFloat(obj.quantity),
            rate: parseFloat(obj.price),
            timestamp: parseFloat(obj.ts / 1000.0)
        }
        trade.price = parseFloat(new Big(trade.quantity).times(trade.rate));
        tradesByPair[pair].push(trade);
    });
    for (const [pair, trades] of Object.entries(tradesByPair)) {
        const evt = {
            pair: pair,
            data: trades
        };
        this.emit('trades', evt);
    }
    return true;
}

/**
 * Should be overridden in children
 * Method called upon successful connection
 */
 _onConnected()
{
    // keep ws open (see https://docs.poloniex.com/#overview-websockets)
    /*
        The WebSockets server expects a message or a ping every 30 seconds or it will end 
        the client’s session without warning
     */
    if (this._pingLoop) {
        clearInterval(this._pingLoop);
        this._pingLoop = undefined;
    }
    this._pingLoop = setInterval(() => {
        if (!this.isConnected()) {
            clearInterval(this._pingLoop);
            return;
        }
        this._connection.send(JSON.stringify({event:'ping'}));
    }, 15000);
}

}

module.exports = StreamClient;
