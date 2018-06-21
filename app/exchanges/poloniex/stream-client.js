"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Poloniex');
const logger = require('winston');
const Big = require('big.js');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

const WS_URI = 'wss://api2.poloniex.com';

const CHANNEL_TICKERS = 1002;
const CHANNEL_KEEPALIVE = 1010;

class StreamClient extends AbstractExchangeStreamClientClass
{

/**
 * Constructor
 *
 */
constructor(exchangeId)
{
    super(exchangeId, WS_URI);
    this._marketsById = {};
}

/*
 * Used to update markets periodically
 */
updateMarkets(marketsById)
{
    this._marketsById = marketsById;
}

/*
 * Here we might emit appropriate event such as orderBook, orderBookUpdate if possible
 */
_processMessage(message)
{
    try
    {
        let data = JSON.parse(message);
        if (!Array.isArray(data))
        {
            return;
        }
        if (CHANNEL_KEEPALIVE == data[0])
        {
            return;
        }
        else if (CHANNEL_TICKERS == data[0])
        {
            // this is a confirmation of subscribe/unsubscribe => ignore
            if (null !== data[1])
            {
                return;
            }
            this._processTickersData(data);
            return;
        }
        // probably for a market
        else if (Number.isInteger(data[0]) && data[0] > 0 && data[0] < 1000)
        {
            this._processMarketsData(data);
        }
    }
    // ignore invalid JSON
    catch (e)
    {
        return;
    }
}

/*
  Process tickers data and emit a 'ticker' event

 Example data

 [
     // ticker channel
     1002,
     // will be always null when we have tickers (otherwise it's a confirmation of subscribe/unsubscribe)
     null,
     [
         // pair id
         61,
         // last
         "0.00009886",
         // sell
         "0.00009865",
         // buy
         "0.00009725",
         // price change [0,100]
         "-0.07417119",
         // base volume
         "33.41354730",
         // quote volume
         "315607.59232709",
         // 0 => not frozen, 1 => frozen
         0,
         // high
         "0.00011544",
         // low
         "0.00009673"
    ]
 ]
 */
_processTickersData(data)
{
    if (undefined === data[2])
    {
        return;
    }
    let obj = this._marketsById[data[2][0]];
    // unknown market, wtf
    if (undefined === obj)
    {
        logger.warn(`Unknown Poloniex pair id : id = ${data[2]}`);
        return;
    }
    if (obj.ignore)
    {
        return;
    }
    let ticker = {
        pair:obj.pair,
        last: parseFloat(data[2][1]),
        sell: parseFloat(data[2][2]),
        buy: parseFloat(data[2][3]),
        priceChangePercent: parseFloat(data[2][4]) * 100,
        volume: parseFloat(data[2][6]),
        high: parseFloat(data[2][8]),
        low: parseFloat(data[2][9]),
        timestamp:new Date().getTime() / 1000
    }
    this.emit('ticker', {
        pair:obj.pair,
        data:ticker
    });
}

/*
  Process order books / trades data and emit 'orderBook'/'orderBookUpdate' and/or 'trades' event

  Data example for full order book

  [
      // pair id
      148,
      // sequence number
      420310184,
      [
          [
              // indicates full order book
              "i",
              {"currencyPair":
                  "BTC_ETH",
                  "orderBook":[
                      // sell order book (rate:quantity)
                      {"0.06032164":"15.43728488","0.06032180":"0.00400073",...},
                      // buy order book (rate:quantity)
                      {"0.06032164":"15.43728488","0.06032180":"0.00400073",...}
                  ]
              }
          ]
      ]
  ]

  Data example for order book update

  [
      // pair id
      148,
      // sequence number
      420310196,
      [
          [
              // indicates order book update
              "o",
              // 0 => sell, 1 => buy
              0,
              // rate
              "0.06032180",
              // quantity (0 => should be removed from order book, > 0 should be added/updated in order book)
              "0.00000000"
          ],...
      ]
  ]

 Data example for trades

 [
     // pair id
     148,
     // sequence number
     420310196,
     [
         [
             // indicates trades
             "t",
             // trade id
             "35154213",
             // 0 => sell, 1 => buy,
             1,
             "0.06034687",
             "0.15427693",
             1508140544
         ],...
     ]
 ]

 */
_processMarketsData(data)
{
    let obj = this._marketsById[data[0]];
    // unknown market, wtf
    if (undefined === obj)
    {
        logger.warn(`Unknown Poloniex pair id : id = '${data[0]}'`);
        return;
    }
    let cseq = data[1];
    let book = null;
    let trades = [];
    let updates = [];
    _.forEach(data[2], (arr) => {
        switch (arr[0])
        {
            case 'i':
                book = arr[1];
                break;
            case 'o':
                updates.push(arr);
                break;
            case 't':
                trades.push(arr);
                break;
        }
    });
    if (null != book)
    {
        this._processFullOrderBook(obj.pair, cseq, book);
    }
    if (0 != updates.length)
    {
        this._processOrderBookUpdates(obj.pair, cseq, updates);
    }
    if (0 != trades.length)
    {
        this._processTrades(obj.pair, trades);
    }
}

/*
 * Process data for a full order book (ie: after subscription)
 *
 * Emit 'orderBook' event
 */
_processFullOrderBook(pair, cseq, book)
{
    if (debug.enabled)
    {
        debug(`Got full order book for pair '${pair}': ${Object.keys(book.orderBook[0]).length} asks, ${Object.keys(book.orderBook[1]).length} bids`);
    }
    let evt = {
        pair:pair,
        cseq:cseq,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(book.orderBook[0], (qty, rate) => {
        evt.data.sell.push({quantity:parseFloat(qty),rate:parseFloat(rate)});
    });
    _.forEach(book.orderBook[1], (qty, rate) => {
        evt.data.buy.push({quantity:parseFloat(qty),rate:parseFloat(rate)});
    });
    this.emit('orderBook', evt);
    return true;
}

/*
 * Process data for a an order book update
 *
 * Emit 'orderBookUpdate' event
 */
_processOrderBookUpdates(pair, cseq, updates)
{
    if (debug.enabled)
    {
        debug(`Got order book update for pair '${pair}': ${updates.length} changes`);
    }
    let evt = {
        pair:pair,
        cseq:cseq,
        data:{
            buy:[],
            sell:[]
        }
    };
    _.forEach(updates, (update) => {
        let obj = {
            action: 'update',
            quantity:parseFloat(update[3]),
            rate:parseFloat(update[2])
        }
        // this is a removal
        if (0 == obj.quantity)
        {
            obj.action = 'remove';
        }
        if (1 == update[1])
        {
            evt.data.buy.push(obj);
        }
        else
        {
            evt.data.sell.push(obj);
        }
    });
    this.emit('orderBookUpdate', evt);
    return true;
}

_processTrades(pair, trades)
{
    if (debug.enabled)
    {
        debug(`Got trades update for pair '${pair}': ${trades.length} trades`);
    }
    let evt = {
        pair:pair,
        data:[]
    };
    _.forEach(trades, (trade) => {
        let obj = {
            id: trade[1],
            orderType:'sell',
            quantity:parseFloat(trade[4]),
            rate:parseFloat(trade[3]),
            timestamp:trade[5]
        }
        if (0 !== trade[2])
        {
            obj.orderType = 'buy';
        }
        obj.price = parseFloat(new Big(obj.quantity).times(obj.rate));
        evt.data.push(obj);
    });
    this.emit('trades', evt);
    return true;
}

}

module.exports = StreamClient;
