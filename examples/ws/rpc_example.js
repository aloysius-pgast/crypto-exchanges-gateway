"use strict";
const WebSocket = require('ws');

/**
 * This example assumes that your gateway WS endpoint is available on ws://127.0.0.1:8001
 */
const BASE_URI = 'ws://127.0.0.1:8001';

let ws = new WebSocket(BASE_URI);

ws.on('open', function(){
    // subscribe to USDT-BTC & USDT-ETH tickers on Poloniex
    ws.send(JSON.stringify({m:'subscribeToTickers',p:{exchange:'poloniex',pairs:['USDT-BTC','USDT-ETH']}}));
    // subscribe to USDT-NEO order books on Bittrex
    ws.send(JSON.stringify({m:'subscribeToOrderBooks',p:{exchange:'bittrex',pairs:['USDT-NEO']}}));
    // subscribe to BTC-NEO trades on Binance
    ws.send(JSON.stringify({m:'subscribeToTrades',p:{exchange:'binance',pairs:['BTC-NEO']}}));
    // after 30s cancel all subscriptions on binance exchange
    setTimeout(function(){
        console.log("--- Unsubscribing from Binance ---");
        ws.send(JSON.stringify({m:'unsubscribe',p:{exchange:'binance'}}));
    }, 30000);
    // after 60s cancel all subscriptions on all exchanges
    setTimeout(function(){
        console.log("--- Unsubscribing from all exchanges ---");
        ws.send(JSON.stringify({m:'unsubscribe',p:{}}));
    }, 60000);
});

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
    // just display notification type, pair & exchange
    console.log(`=== Got ${message.d.pair} ${message.n} notification from ${message.d.exchange} ===`);
});
