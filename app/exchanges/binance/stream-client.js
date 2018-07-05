"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Binance');
const logger = require('winston');
const Big = require('big.js');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

class StreamClient extends AbstractExchangeStreamClientClass
{

/**
 * Constructor
 *
 */
constructor(exchangeId, uri)
{
    super(exchangeId, uri);
}

/**
 * Convert pair from exchange format YX to custom format X-Y
 *
 * @param {string} pair pair in exchange format (YX)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let baseCurrency = pair.substr(-3);
    let currency;
    if ('SDT' == baseCurrency)
    {
        baseCurrency = 'USDT';
        currency = pair.substr(0, pair.length - 4);
    }
    else
    {
        currency = pair.substr(0, pair.length - 3);
    }
    return baseCurrency + '-' + currency;
}

/**
 * Convert pair from custom format X-Y to exchange format YX
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (YX)
 */
_toExchangePair(pair)
{
    let arr = pair.split('-');
    return arr[1] + arr[0];
}

/*
 * Here we should emit appropriate event such as orderBook, orderBookUpdate ...
 */
_processMessage(message)
{
    try
    {
        let data = JSON.parse(message);
        if (undefined === data.e)
        {
            return;
        }
        switch (data.e)
        {
            case 'depthUpdate':
                this._processOrderBookUpdate(data);
                return;
            case 'aggTrade':
                this._processTrades(data);
                return;
            case '24hrTicker':
                this._processTicker(data);
                return;
            case 'kline':
                this._processKline(data);
                return;
        }
    }
    catch (e)
    {
        logger.error(e.stack);
        return;
    }
}

/*
  Process 'depthUpdate' data and emit 'orderBookUpdate' event

  Example data

  {
      "e": "depthUpdate",        // event type
  	  "E": 1499404630606, 		 // event time
  	  "s": "ETHBTC", 			 // symbol
  	  "u": 7913455, 			 // updateId to sync up with updateid in /api/v1/depth
  	  "b": [					 // bid depth delta
  	      [
  		      "0.10376590", 	 // price (need to upate the quantity on this price)
  			  "59.15767010", 	 // quantity
  			  []				 // can be ignored
  		  ],
  	  ],
  	  "a": [					 // ask depth delta
  	      [
  		      "0.10376586", 	 // price (need to upate the quantity on this price)
  			  "159.15767010", 	 // quantity
  			  []				 // can be ignored
  		  ],
  		  [
  		      "0.10383109",
  			  "345.86845230",
  			  []
  		  ],
  		  [
  		      "0.10490700",
  			  "0.00000000", 	 // quantitiy=0 means remove this level
  			  []
  		  ]
  	  ]
  }

*/
_processOrderBookUpdate(data)
{
    let pair = this._toCustomPair(data.s);
    let evt = {
        pair:pair,
        cseq:data.u,
        data:{
            buy:_.map(data.b, arr => {
                let obj = {
                    action:'update',
                    rate:parseFloat(arr[0]),
                    quantity:parseFloat(arr[1])
                }
                if (0 == obj.quantity)
                {
                    obj.action = 'remove';
                }
                return obj;
            }),
            sell:_.map(data.a, arr => {
                let obj = {
                    action:'update',
                    rate:parseFloat(arr[0]),
                    quantity:parseFloat(arr[1])
                }
                if (0 == obj.quantity)
                {
                    obj.action = 'remove';
                }
                return obj;
            })
        }
    }
    this.emit('orderBookUpdate', evt);
}

/*
  Process 'aggTrade' data and emit 'trades' event

  Example data

  {
      "e": "aggTrade",		    // event type
  	  "E": 1499405254326,		// event time
  	  "s": "ETHBTC",			// symbol
  	  "a": 70232,				// aggregated tradeid
  	  "p": "0.10281118",		// price
  	  "q": "8.15632997",		// quantity
  	  "f": 77489,				// first breakdown trade id
  	  "l": 77489,				// last breakdown trade id
  	  "T": 1499405254324,		// trade time
  	  "m": false,				// whether buyer is a maker (seems to be reversed and when 'm' is true, entry is displayed in RED on Binance website)
  	  "M": true				   // can be ignore
  }
 */
_processTrades(data)
{
    let pair = this._toCustomPair(data.s);
    let quantity = parseFloat(data.q);
    let rate = parseFloat(data.p);
    let price = parseFloat(new Big(quantity).times(rate));
    let orderType = 'sell';
    // seems to be reversed and when 'm' is true, entry is displayed in RED on Binance website
    if (false === data.m)
    {
        orderType = 'buy';
    }
    let evt = {
        pair:pair,
        data:[{
            id:data.a,
            quantity:quantity,
            rate:rate,
            price:price,
            orderType:orderType,
            timestamp:parseFloat(data.T / 1000.0)
        }]
    }
    this.emit('trades', evt);
}

/*
  Process 'aggTrade' data and emit 'trades' event

  Example data

  {
    "e": "24hrTicker",  // Event type
    "E": 123456789,     // Event time
    "s": "BNBBTC",      // Symbol
    "p": "0.0015",      // Price change
    "P": "250.00",      // Price change percent
    "w": "0.0018",      // Weighted average price
    "x": "0.0009",      // Previous day's close price
    "c": "0.0025",      // Current day's close price
    "Q": "10",          // Close trade's quantity
    "b": "0.0024",      // Best bid price
    "B": "10",          // Bid bid quantity
    "a": "0.0026",      // Best ask price
    "A": "100",         // Best ask quantity
    "o": "0.0010",      // Open price
    "h": "0.0025",      // High price
    "l": "0.0010",      // Low price
    "v": "10000",       // Total traded base asset volume
    "q": "18",          // Total traded quote asset volume
    "O": 0,             // Statistics open time
    "C": 86400000,      // Statistics close time
    "F": 0,             // First trade ID
    "L": 18150,         // Last trade Id
    "n": 18151          // Total number of trades
  }
*/
_processTicker(data)
{
    let pair = this._toCustomPair(data.s);
    let evt = {
        pair:pair,
        data:{
            pair:pair,
            last:parseFloat(data.c),
            priceChangePercent:parseFloat(data.P),
            sell:parseFloat(data.a),
            buy:parseFloat(data.b),
            high:parseFloat(data.h),
            low:parseFloat(data.l),
            volume:parseFloat(data.v),
            timestamp:parseFloat(data.E / 1000.0)
        }
    }
    this.emit('ticker', evt);
}

/*
  Process 'kline' data and emit 'kline' event

  Example data

  {
    "e": "kline",     // Event type
    "E": 123456789,   // Event time
    "s": "BNBBTC",    // Symbol
    "k": {
      "t": 123400000, // Kline start time
      "T": 123460000, // Kline close time
      "s": "BNBBTC",  // Symbol
      "i": "1m",      // Interval
      "f": 100,       // First trade ID
      "L": 200,       // Last trade ID
      "o": "0.0010",  // Open price
      "c": "0.0020",  // Close price
      "h": "0.0025",  // High price
      "l": "0.0015",  // Low price
      "v": "1000",    // Base asset volume
      "n": 100,       // Number of trades
      "x": false,     // Is this kline closed?
      "q": "1.0000",  // Quote asset volume
      "V": "500",     // Taker buy base asset volume
      "Q": "0.500",   // Taker buy quote asset volume
      "B": "123456"   // Ignore
    }
  }

 */
_processKline(data)
{
    let pair = this._toCustomPair(data.s);
    let now = Math.floor(Date.now() / 1000.0);
    let evt = {
        pair:pair,
        interval:data.k.i,
        data:{
            timestamp:Math.floor(data.k.t / 1000.0),
            open:parseFloat(data.k.o),
            close:parseFloat(data.k.c),
            high:parseFloat(data.k.h),
            low:parseFloat(data.k.l),
            volume:parseFloat(data.k.v),
            remainingTime:Math.ceil(data.k.T / 1000.0) - now,
            closed:data.k.x
        }
    }
    if (evt.data.remainingTime < 0)
    {
        evt.data.remainingTime = 0;
    }
    this.emit('kline', evt);
}

}

module.exports = StreamClient;
