"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeStreamClient:Dummy');
const AbstractExchangeStreamClientClass = require('../../abstract-exchange-stream-client');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

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

/*
 * Here we might emit appropriate event such as orderBook, orderBookUpdate if possible
 */
_processMessage(message)
{
    try
    {
        let data = JSON.parse(message);
        // only handle notifications
        if (undefined === data.n)
        {
            return;
        }
        switch (data.n)
        {
            case 'ticker':
                this._processTicker(data);
                break;
            case 'orderBook':
                this._processFullOrderBook(data);
                break;
            case 'orderBookUpdate':
                this._processOrderBookUpdate(data);
                break;
            case 'trades':
                this._processTrades(data);
                break;
        }
    }
    // ignore invalid JSON
    catch (e)
    {
        return;
    }
}

/*
 Process ticker data and emit a 'ticker' event

 Example data

 {
     n: 'ticker',
     d: {
         pair: 'USDT-NEO',
         data: {
             pair: 'USDT-NEO',
             timestamp: 1509620882.315,
             priceChangePercent: 0.82,
             high: 29.15889845,
             low: 28.54242232,
             last: 28.79078884,
             buy: 28.78700991,
             sell: 28.81314854,
             volume: 22174.98240658
         }
     }
 }

 */
_processTicker(data)
{
    this.emit('ticker', data.d);
}

/*
 Process order book data and emit an 'orderBook' event

 Example data

 {
     "n":"orderBook",
     "d":{
         "pair":"USDT-BTC",
         "cseq":1509617706,
         "data":{
             "buy":[
                 {
                     "quantity":0.14121339,
                     "rate":5767.25698583
                 },
                 {
                     "quantity":0.13877531,
                     "rate":5730.56604344
                 }
             ],
             "sell":[
                 {
                     "quantity":0.1474318,
                     "rate":5771.00272063
                 },
                 {
                     "quantity":0.14408248,
                     "rate":5771.0281298
                 },
             ]
         }
     }
 }

 */
_processFullOrderBook(data)
{
    this.emit('orderBook', data.d);
}

/*
 Process order book update data and emit an 'orderBookUpdate' event

 Example data

 {
     "n":"orderBookUpdate",
     "d":{
         "pair":"USDT-BTC",
         "cseq":1509617725,
         "data":{
             "buy":[
                 {
                     "quantity":0.14121339,
                     "rate":5765.23868905,
                     "action":"update"
                 },
                 {
                     "rate":5766.06827889,
                     "action":"remove"
                 }
             ],
             "sell":[
                 {
                     "quantity":0.1474318,
                     "rate":5766.7277427,
                     "action":"update"
                 },
                 {
                     "rate":5767.55730021,
                     "action":"remove"
                 }
             ]
         }
     }
 }

 */
_processOrderBookUpdate(data)
{
    this.emit('orderBookUpdate', data.d);
}

/*
 Process order book update data and emit an 'orderBookUpdate' event

 Example data

 {
    "n":"trades",
    "d":{
        "pair":"USDT-BTC",
        "data":[
            {
                "rate":5769.22608136,
                "quantity":0.4349711,
                "orderType":"sell",
                "timestamp":1509632725.981,
                "id":1509619902,
                "price":2509.44661476
            },
            {
                "rate":5769.22608136,
                "quantity":0.22294252,
                "orderType":"sell",
                "timestamp":1509632725.981,
                "id":1509619903,
                "price":1286.20580103
            }
        ]
    }
}

*/
_processTrades(data)
{
    this.emit('trades', data.d);
}

}

module.exports = StreamClient;
