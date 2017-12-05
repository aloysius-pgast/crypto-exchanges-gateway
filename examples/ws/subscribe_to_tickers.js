"use strict";
const WebSocket = require('ws');

/**
 * This example assumes that your gateway WS endpoint is available on ws://127.0.0.1:8001
 */
const BASE_URI = 'ws://127.0.0.1:8001';

// open a socket for USDT-BTC ticker on Bittrex
{
    let exchange = 'bittrex'
    let pair = 'USDT-BTC';
    let uri = `${BASE_URI}/exchanges/${exchange}/tickers/${pair}`;
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
        console.log(`\n=== Got ${pair} ticker from ${exchange} ===`);
        console.log(message.d)
    });
}

// open another socket for USDT-ETH ticker on Poloniex
{
    let exchange = 'poloniex';
    let pair = 'USDT-ETH';
    let uri = `${BASE_URI}/exchanges/${exchange}/tickers/${pair}`;
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
        console.log(`\n=== Got ${pair} ticker from ${exchange} ===`);
        console.log(message.d)
    });
}
