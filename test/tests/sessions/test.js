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

// how long should we wait (in seconds) for hello message
const HELLO_MESSAGE_DELAY = 5;

const getExchangeSubscriptionSchema = (type) => {
    let obj;
    if ('klines' == type)
    {
        obj = {
            timestamp:joi.number().positive().required(),
            pairs:joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, joi.object().pattern(/^.+$/, joi.object({
                timestamp:joi.number().positive().required()
            }))).required()
        }
    }
    else
    {
        obj = {
            timestamp:joi.number().positive().required(),
            pairs:joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, joi.object({
                timestamp:joi.number().positive().required()
            })).required()
        }
    }
    const schema = joi.object(obj);
    return schema;
}

const getExchangeSchema = () => {
    const schema = joi.object({
        tickers:getExchangeSubscriptionSchema('tickers'),
        orderBooks:getExchangeSubscriptionSchema('orderBooks'),
        trades:getExchangeSubscriptionSchema('trades'),
        klines:getExchangeSubscriptionSchema('klines')
    });
    return schema;
}

const getSessionSchema = (exchanges) => {

    //-- schema for a single connection
    const connectionSchema = joi.object({
        id:joi.string(),
        openTimestamp:joi.number().positive().required(),
        ipaddr:joi.string().ip({version: ['ipv4']}).required()
    });

    //-- schema for a single session
    let sessionObj = {
        sid:joi.string().required(),
        isRpc:joi.boolean(),
        creationTimestamp:joi.number().positive().required(),
        expires:joi.boolean().required(),
        timeout:joi.required().when('expires', {is:false, then:joi.number().valid(0), otherwise:joi.number().positive()}),
        expiryTimestamp:joi.number().positive().allow(null).required(),
        subscriptions:joi.object().length(0).required(),
        connections:joi.array().items(connectionSchema).required()
    }
    if (0 != exchanges.length)
    {
        const reg = new RegExp(`^(${exchanges.join('|')})$`);
        sessionObj.subscriptions = joi.object().pattern(reg, getExchangeSchema()).required();
    }
    const sessionSchema = joi.object(sessionObj);
    return sessionSchema;
}

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

    MochaHelper.createSuite('/sessions', (services) => {

        // first we remove the session
        before((done) => {
            restClient.makeRequest('DELETE', `/sessions/${SID}`).then((result) => {
                done();
            }).catch((e) => {
                done(e);
            });
        });

        // define schema based on enabled exchanges
        let sessionSchema;
        try
        {
            sessionSchema = getSessionSchema(Object.keys(services.exchanges));
        }
        catch (e)
        {
            console.log(e);
            process.exit(1);
        }

        //-- list existing sessions
        MochaHelper.describe('GET', '/sessions', function(method, path, params){
            it(`it should list existing sessions and session '${SID}' should not be in the list`, (done) => {
                let schema = joi.object().pattern(/^.+$/, sessionSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
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

        //-- create session & then retrieve session
        MochaHelper.describe('POST', `/sessions/${SID}`, function(method, path, params){
            it(`it should create session '${SID}'`, (done) => {
                let schema = joi.object().pattern(/^.+$/, sessionSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    restClient.makeRequest('GET', path).then((result) => {
                        if (undefined === result.body[SID] || Object.keys(result.body).length > 1)
                        {
                            Assert.fail(`Result should contain a single session '${SID}'`, result.body);
                        }
                        Assert.validateResult(result, schema);
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                }).catch((e) => {
                    done(e);
                });
            });
        });

        const invalidExchange = 'invalidExchange';
        const invalidPair = 'invalidPair';

        let wsUri;

        //-- create tickers subscription for an invalid exchange
        MochaHelper.describe('POST', `/sessions/${SID}/subscriptions/${invalidExchange}/tickers/${invalidPair}`, function(method, path, params){
            it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchange) when trying to subscribe for an invalid exchange", (done) => {
                let schema = joi.object().pattern(/^.+$/, sessionSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchange'});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        let supportedExchange;

        // find an exchange which does not support wsTickers
        supportedExchange = MochaHelper.getExchangeWithoutFeatures(['wsTickers']);
        if (null !== supportedExchange)
        {
            let supportedPair = getSupportedPairSymbolForExchange(supportedExchange);

            MochaHelper.describe('POST', `/sessions/${SID}/subscriptions/${supportedExchange}/tickers/${supportedPair}`, function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature) when trying to subscribe for an exchange which does not support 'wsTickers'", (done) => {
                    let schema = joi.object().pattern(/^.+$/, sessionSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }

        // find an exchange which supports wsTickers
        supportedExchange = MochaHelper.getExchangeWithFeatures(['wsTickers']);
        if (null !== supportedExchange)
        {
            //-- create subscription for an unsupported pair
            MochaHelper.describe('POST', `/sessions/${SID}/subscriptions/${supportedExchange}/tickers/${invalidPair}`, function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair) when trying to subscribe for an unsupported pair", (done) => {
                    let schema = joi.object().pattern(/^.+$/, sessionSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            //-- create subscription for a valid pair
            let supportedPairs = getSupportedPairsSymbolsForExchange(supportedExchange, 3);
            _.forEach(supportedPairs, (pair) => {
                MochaHelper.describe('POST', `/sessions/${SID}/subscriptions/${supportedExchange}/tickers/${pair}`, function(method, path, params){
                    it("it should succeed an return an empty result", (done) => {
                        restClient.makeRequest(method, path, params).then((result) => {
                            Assert.validateResult(result, undefined, {httpCode:200});
                            if (!_.isEmpty(result.body))
                            {
                                Assert.fail('Result should be empty', result.body);
                            }
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    });
                });
            });

            // now we should have an existing ticker subscription for this session
            MochaHelper.describe('GET', `/sessions/${SID}`, function(method, path, params){
                it(`it should retrieve a session with a single subscription (tickers) for ${supportedPairs.length} pairs (${supportedPairs.join(',')}) on exchange '${supportedExchange}'`, (done) => {
                    let schema = joi.object().pattern(/^.+$/, sessionSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        if (undefined === result.body[SID])
                        {
                            Assert.fail(`Session '${SID}' should exist`, result.body);
                        }
                        if (undefined === result.body[SID].subscriptions[supportedExchange] ||
                            Object.keys(result.body[SID].subscriptions).length > 1 ||
                            Object.keys(result.body[SID].subscriptions[supportedExchange]).length > 1 ||
                                Object.keys(result.body[SID].subscriptions[supportedExchange]['tickers'].pairs).length > supportedPairs.length
                        )
                        {
                            Assert.fail(`Session '${SID}' should only have a single subscription (tickers) for pairs (${supportedPairs.join(',')}) on exchange '${supportedExchange}'`, result.body);
                        }
                        _.forEach(supportedPairs, (pair) => {
                            if (undefined === result.body[SID].subscriptions[supportedExchange]['tickers'].pairs[pair])
                            {
                                Assert.fail(`Session '${SID}' should only have a single subscription (tickers) for pairs (${supportedPairs.join(',')}) on exchange '${supportedExchange}'`, result.body);
                            }
                        });
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            //-- try to subscribe to this session (it should receive data)
            wsUri = restClient.getWsUri('', {sid:SID});
            describe(`WS ${wsUri} (please be patient, shouldn't be longer than ${TICKERS_DATA_DELAY}s)`, function(){
                const uri = wsUri;
                it(`it should connect to session '${SID}' and receive tickers data`, (done) => {
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
                            Assert.fail(`We should have received tickers data within ${TICKERS_DATA_DELAY}s (${code},${reason})`);
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

        //-- update expiry for this session
        const expiry = 600;
        MochaHelper.describe('PATCH', `/sessions/${SID}/expiry`, function(method, path, params){
            it(`it should set expiry to ${expiry}s for session '${SID}' and return an empty result`, (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    if (!_.isEmpty(result.body))
                    {
                        Assert.fail('Result should be empty', result.body);
                    }
                    // check session to be sure that it has expiry != null
                    restClient.makeRequest('GET', `/sessions/${SID}`).then((result) => {
                        if (undefined === result.body[SID])
                        {
                            Assert.fail(`Session '${SID}' should exist`, result.body);
                        }
                        if (!result.body[SID].expires)
                        {
                            Assert.fail(`'expires' should be 'true' for session '${SID}'`, result.body);
                        }
                        if (expiry != result.body[SID].timeout)
                        {
                            Assert.fail(`'expiry' should be ${expiry} for session '${SID}'`, result.body);
                        }
                        if (expiry != result.body[SID].timeout)
                        {
                            Assert.fail(`'timeout' should be '${expiry}' for session '${SID}'`, result.body);
                        }
                        if (null === result.body[SID].expiryTimestamp)
                        {
                            Assert.fail(`'expiryTimestamp' should not be 'null' for session '${SID}'`, result.body);
                        }
                        done();
                    }).catch ((e) => {
                        done(e);
                    })
                }).catch((e) => {
                    done(e);
                });
            });
        }, {expires:true,timeout:600});

        //-- connect to WS
        let ws;
        wsUri = restClient.getWsUri('', {sid:SID});
        describe(`WS ${wsUri} (please be patient, shouldn't be longer than ${HELLO_MESSAGE_DELAY}s)`, function(){
            const uri = wsUri;
            it(`it should connect to session '${SID}' and receive 'hello' message`, (done) => {
                ws = new WebSocket(uri);
                let timer = null;
                let gotData = false;
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
                        gotData = true;
                        clearTimeout(timer);
                        done();
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
                        Assert.fail(`We should have received 'hello' message within ${HELLO_MESSAGE_DELAY}s (${code},${reason})`);
                    }
                });
                // reply to ping
                ws.on('ping', function(data){
                    this.pong('', true, true);
                });
            });
        })

        //-- destroy session (it should disconnect websocket)
        MochaHelper.describe('DELETE', `/sessions/${SID}`, function(method, path, params){
            it(`it should delete session '${SID}' and return an empty result`, (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    if (!_.isEmpty(result.body))
                    {
                        Assert.fail('Result should be empty', result.body);
                    }
                    // check session to be sure that it has expiry != null
                    restClient.makeRequest('GET', `/sessions/${SID}`).then((result) => {
                        if (undefined !== result.body[SID])
                        {
                            Assert.fail(`Session '${SID}' should not exist anymore`, result.body);
                        }
                        done();
                    }).catch ((e) => {
                        done(e);
                    })
                }).catch((e) => {
                    done(e);
                });
            });
            it(`it should disconnect all WS connections`, (done) => {
                if (WebSocket.CLOSED != ws.readyState)
                {
                    Assert.fail('Websocket should be closed');
                }
                done();
            });
        });

    }, (services) => {
        return Object.keys(services.exchanges).length > 0;
    });

});
