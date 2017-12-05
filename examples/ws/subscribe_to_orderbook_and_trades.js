"use strict";
const WebSocket = require('ws');

/**
 * This example assumes that your gateway WS endpoint is available on ws://127.0.0.1:8001
 */
const BASE_URI = 'ws://127.0.0.1:8001';

// open a socket for USDT-BTC order book on Bittrex
{
    let exchange = 'bittrex'
    let pair = 'USDT-BTC';
    let uri = `${BASE_URI}/exchanges/${exchange}/orderBooks/${pair}`;
    let ws = new WebSocket(uri);
    ws.on('message', function(m){
        let message;
        try
        {
            message = JSON.parse(m);
        }
        catch (e)
        {
            return;
        }
        // not a valid notification
        if (undefined === message.n || undefined === message.d)
        {
            return;
        }
        // just display order book size
        let obj = {
            cseq:message.d.cseq,
            buySize:message.d.data.buy.length,
            sellSize:message.d.data.sell.length
        }
        // full order book
        if ('orderBook' == message.n)
        {
            console.log(`\n=== Got ${pair} full order book ${exchange} ===`);
        }
        // order book update
        else
        {
            console.log(`\n=== Got ${pair} order book update from ${exchange} ===`);
        }
        console.log(obj)
    });
}

// open another socket for USDT-BTC trades on Bittrex
{
    let exchange = 'bittrex';
    let pair = 'USDT-BTC';
    let uri = `${BASE_URI}/exchanges/${exchange}/trades/${pair}`;
    let ws = new WebSocket(uri);
    ws.on('message', function(m){
        let message;
        try
        {
            message = JSON.parse(m);
        }
        catch (e)
        {
            return;
        }
        // not a valid notification
        if (undefined === message.n || undefined === message.d)
        {
            return;
        }
        // just display trades size
        let obj = {
            size:message.d.data.length
        }
        console.log(`\n=== Got ${pair} trades from ${exchange} ===`);
        console.log(obj);
    });
}
