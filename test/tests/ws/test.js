"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../lib/assert');
const WebSocket = require('ws');
const MochaHelper = require('../../lib/mocha-helper');
const restClient = require('../../lib/rest-client').getInstance();

// the session we want to create
const SID = 'mocha-2af54305f183778d87de0c70c591fae4';

// how long to wait (in seconds) for tickers data
const TICKERS_DATA_DELAY = 90;

// how long to wait (in seconds) for orderBooks data
const ORDER_BOOKS_DATA_DELAY = 90;

// how long should we wait (in seconds) for hello message
const HELLO_MESSAGE_DELAY = 5;

// how long should we wait before getting an error when using an invalid exchange or pair
const ERROR_DELAY = 10;

/**
 * Return a supported symbol for a given exchange
 *
 * @param {string} exchangeId exchange identifier
 * @return {string} pair symbol
 */
const getSupportedPairSymbolForExchange = (exchangeId) => {
    let supportedPairs = MochaHelper.getCachedPairs(exchangeId);
    let staticSymbols = MochaHelper.getSupportedPairSymbols(supportedPairs, {count:1});
    let symbols = MochaHelper.getRandomPairsSymbols(supportedPairs, {count:1, include:staticSymbols});
    return symbols[0];
}

/**
 * Return a list of supported symbols for a given exchange
 *
 * @param {string} exchangeId exchange identifier
 * @param {integer} count number of symbols to return (optional, if not set all default symbols will be returned)
 * @return {string} pair symbol
 */
const getSupportedPairsSymbolsForExchange = (exchangeId, count) => {
    let supportedPairs = MochaHelper.getCachedPairs(exchangeId);
    let opt = {};
    if (undefined !== count)
    {
        opt.count = count;
    }
    let staticSymbols = MochaHelper.getSupportedPairSymbols(supportedPairs, {count:count});
    let symbols = MochaHelper.getRandomPairsSymbols(supportedPairs, {count:count, include:staticSymbols});
    return symbols;
}

MochaHelper.prepare(() => {

    MochaHelper.createSuite('WS', (services) => {

        // first we remove the session
        before((done) => {
            restClient.makeRequest('DELETE', `/sessions/${SID}`).then((result) => {
                done();
            }).catch((e) => {
                done(e);
            });
        });

        const invalidExchange = 'invalidExchange';
        const invalidPair = 'invalidPair';

        let wsUri;
        let exchange;

        //-- non rpc sessions

        // unsupported exchange
        wsUri = restClient.getWsUri(`exchanges/${invalidExchange}/tickers/${invalidPair}`);
        describe(`WS ${wsUri}`, function(){
            const uri = wsUri;
            it(`websocket should be closed with {"code":4400, "reason":"UNSUPPORTED_EXCHANGE"} when using an unsupported exchange`, (done) => {
                let ws = new WebSocket(uri);
                let timer = null;
                ws.on('open', function() {
                    timer = setTimeout(function(){
                        ws.close();
                    }, ERROR_DELAY * 1000);
                });
                ws.on('error', function(e) {
                    this.terminate();
                    done(e);
                });
                // likely to be an auth error
                ws.on('unexpected-response', function(request, response){
                    let err = {code:response.statusCode,message:response.statusMessage};
                    done(err);
                });
                ws.on('close', function(code, reason){
                    let result = {code:code, reason:reason};
                    if (4400 != code)
                    {
                        Assert.fail("it should have failed with code 4400", result);
                    }
                    if ('UNSUPPORTED_EXCHANGE' != reason)
                    {
                        Assert.fail("it should have failed with reason 'UNSUPPORTED_EXCHANGE'", result);
                    }
                    done();
                });
            });
        });

        // supported exchange
        exchange = MochaHelper.getExchangeWithFeatures(['wsTickers']);
        if (null !== exchange)
        {
            // unsupported pair
            wsUri = restClient.getWsUri(`exchanges/${exchange}/tickers/${invalidPair}`);
            describe(`WS ${wsUri}`, function(){
                const uri = wsUri;
                it(`websocket should be closed with {"code":4400, "reason":"UNSUPPORTED_PAIR"} when using an unsupported exchange`, (done) => {
                    let ws = new WebSocket(uri);
                    let timer = null;
                    ws.on('open', function() {
                        timer = setTimeout(function(){
                            ws.close();
                        }, ERROR_DELAY * 1000);
                    });
                    ws.on('error', function(e) {
                        this.terminate();
                        done(e);
                    });
                    // likely to be an auth error
                    ws.on('unexpected-response', function(request, response){
                        let err = {code:response.statusCode,message:response.statusMessage};
                        done(err);
                    });
                    ws.on('close', function(code, reason){
                        let result = {code:code, reason:reason};
                        if (4400 != code)
                        {
                            Assert.fail("it should have failed with code 4400", result);
                        }
                        if ('UNSUPPORTED_PAIR' != reason)
                        {
                            Assert.fail("it should have failed with reason 'UNSUPPORTED_PAIR'", result);
                        }
                        done();
                    });
                });
            });

            // supported pair
            let supportedPair = getSupportedPairSymbolForExchange(exchange);
            wsUri = restClient.getWsUri(`exchanges/${exchange}/tickers/${supportedPair}`);
            describe(`WS ${wsUri} (please be patient, shouldn't be longer than ${TICKERS_DATA_DELAY}s)`, function(){
                const uri = wsUri;
                it(`it should connect and receive tickers data`, (done) => {
                    let ws = new WebSocket(uri);
                    let gotData = false;
                    let timer = null;
                    ws.on('open', function() {
                        timer = setTimeout(function(){
                            if (!gotData && WebSocket.OPEN == ws.readyState)
                            {
                                ws.close(4408, 'DATA_TIMEOUT');
                            }
                        }, TICKERS_DATA_DELAY * 1000);
                    });
                    ws.on('message', function(message) {
                        let obj = MochaHelper.safeJSONparse(message);
                        if (null === obj)
                        {
                            Assert.fail(`Received invalid JSON message : ${message}`);
                        }
                        if (undefined !== obj.hello)
                        {
                            return;
                        }
                        if ('ticker' == obj.n)
                        {
                            gotData = true;
                            clearTimeout(timer);
                            this.terminate();
                        }
                    });
                    ws.on('error', function(e) {
                        this.terminate();
                        done(e);
                    });
                    // likely to be an auth error
                    ws.on('unexpected-response', function(request, response){
                        let err = {code:response.statusCode,message:response.statusMessage};
                        done(err);
                    });
                    ws.on('close', function(code, reason){
                        if (!gotData)
                        {
                            Assert.fail(`We should have received tickers data withing ${TICKERS_DATA_DELAY}s (${code},${reason})`);
                        }
                        done();
                    });
                    // reply to ping
                    ws.on('ping', function(data){
                        this.pong('', true, true);
                    });
                });
            });
        }

        //-- rpc sessions
        // ensure session is destroyed upon disconnection by setting timeout to 0
        wsUri = restClient.getWsUri('', {sid:SID,expires:true,timeout:0});
        describe(`WS ${wsUri} (please be patient, shouldn't be longer than ${HELLO_MESSAGE_DELAY}s)`, function(){
            const uri = wsUri;
            let gotHello = false;
            let gotTicker = false;
            let ws;
            it(`it should create session '${SID}' and receive 'hello' message`, (done) => {
                ws = new WebSocket(uri);
                let timer = null;
                ws.on('open', function() {
                    timer = setTimeout(function(){
                        if (WebSocket.OPEN == ws.readyState)
                        {
                            ws.close(4408, 'DATA_TIMEOUT');
                        }
                    }, HELLO_MESSAGE_DELAY * 1000);
                });
                ws.on('message', function(message) {
                    let obj = MochaHelper.safeJSONparse(message);
                    if (null === obj)
                    {
                        Assert.fail(`Received invalid JSON message : ${message}`);
                    }
                    if (undefined !== obj.hello)
                    {
                        gotHello = true;
                        clearTimeout(timer);
                        done();
                        return;
                    }
                    if ('ticker' == obj.n)
                    {
                        gotTicker = true;
                    }
                });
                ws.on('error', function(e) {
                    this.terminate();
                    done(e);
                });
                // likely to be an auth error
                ws.on('unexpected-response', function(request, response){
                    let err = {code:response.statusCode,message:response.statusMessage};
                    done(err);
                });
                ws.on('close', function(code, reason){
                    if (!gotHello)
                    {
                        Assert.fail(`We should have received 'hello' message withing ${HELLO_MESSAGE_DELAY}s (${code},${reason})`);
                    }
                });
                // reply to ping
                ws.on('ping', function(data){
                    this.pong('', true, true);
                });
            });

            // send subscription
            let pairs = getSupportedPairsSymbolsForExchange(exchange);
            let params = {exchange:exchange,pairs:pairs};
            let message = {m:'subscribeToTickers',p:params};
            describe(`WS ${wsUri} ${JSON.stringify(message)} (please be patient, shouldn't be longer than ${TICKERS_DATA_DELAY}s)`, function(){
                it(`it should receive tickers data within ${TICKERS_DATA_DELAY}s`, (done) => {
                    ws.send(JSON.stringify(message));
                    let timeoutTimestamp = Date.now() + TICKERS_DATA_DELAY * 1000;
                    // check every 5s if we received a ticker message
                    let timer = setInterval(function(){
                        let timestamp = Date.now();
                        if (gotTicker)
                        {
                            clearTimeout(timer);
                            ws.terminate();
                            done();
                        }
                        if (timestamp > timeoutTimestamp)
                        {
                            ws.terminate();
                            Assert.fail(`We should have received ticker data within ${TICKERS_DATA_DELAY}s`);
                        }
                    }, 5000);
                });
            });

            // session should not exist anymore
            MochaHelper.describe('GET', `/sessions`, function(method, path, params){
                it(`it should list existing sessions and session '${SID}' should not be in the list`, (done) => {
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:200});
                        if (undefined !== result.body[SID])
                        {
                            Assert.fail(`Session '${SID}' should not be in the list`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        })

    }, (services) => {
        return Object.keys(services.exchanges).length > 0;
    });

});
