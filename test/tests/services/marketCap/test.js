"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

// ensure we put allow(null) wherever we can have null values
const tickerSchema = joi.object({
    name:joi.string().required(),
    symbol:joi.string().required(),
    rank:joi.number().positive().required(),
    last_updated:joi.number().positive().required(),
    price_usd:joi.number().positive().required(),
    market_cap_usd:joi.number().positive().required(),
    volume_24h_usd:joi.number().positive().allow(0).required(),
    price_btc:joi.number().positive().required(),
    circulating_supply:joi.number().positive().required(),
    percent_change_1h:joi.number().allow(null).required(),
    percent_change_1d:joi.number().allow(null).required(),
    percent_change_7d:joi.number().allow(null).required()
});

const coinSchema = joi.object({
    symbol:joi.string().required(),
    name:joi.string().required()
});

MochaHelper.prepare(() => {

    MochaHelper.createSuite('/marketCap', (services) => {

        MochaHelper.describe('GET', '/marketCap/symbols', function(method, path, params){
            it("it should return the list of symbols", (done) => {
                const schema = joi.array().items(joi.string()).min(1);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/marketCap/coins', function(method, path, params){
            it("it should return the list of coins", (done) => {
                const schema = joi.object().pattern(/^[A-Za-z0-9$\-+]+$/, coinSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/marketCap/coins', function(method, path, params){
            it("it should return a list of coins containing only BTC & ETH", (done) => {
                const schema = joi.object().pattern(/^[A-Za-z0-9$]+$/, coinSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    let symbols = _.map(result.body, (e) => e.symbol);
                    if (-1 == symbols.indexOf('BTC'))
                    {
                        Assert.fail("Result should contain an entry for 'BTC'", result.body);
                    }
                    if (-1 == symbols.indexOf('ETH'))
                    {
                        Assert.fail("Result should contain an entry for 'ETH'", result.body);
                    }
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        }, {symbols:['BTC','ETH']});

        MochaHelper.describe('GET', '/marketCap/tickers', function(method, path, params){
            it('it should return first 100 tickers', (done) => {
                const schema = joi.array().items(tickerSchema).max(100);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/marketCap/tickers', function(method, path, params){
            it(`it should return first 5 tickers`, (done) => {
                const schema = joi.array().items(tickerSchema).max(5);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        },{limit:5});

        MochaHelper.describe('GET', '/marketCap/tickers/BTC', function(method, path, params){
            it(`it should return a single ticker for BTC`, (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, tickerSchema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/marketCap/tickers/INVALID', function(method, path, params){
            it("it should fail with a 404 error (GatewayError.InvalidRequest.ObjectNotFound) when requesting a single ticker for an invalid symbol", (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:404,errorType:'GatewayError.InvalidRequest.ObjectNotFound'});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/marketCap/tickers', function(method, path, params){
            it("it should return tickers for BTC & ETH", (done) => {
                const schema = joi.array().items(tickerSchema).length(2);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    let symbols = _.map(result.body, (e) => e.symbol);
                    if (-1 == symbols.indexOf('BTC'))
                    {
                        Assert.fail("Result should contain an entry for 'BTC'", result.body);
                    }
                    if (-1 == symbols.indexOf('ETH'))
                    {
                        Assert.fail("Result should contain an entry for 'ETH'", result.body);
                    }
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        },{symbols:["BTC","ETH"]});

    }, (services) => {
        return MochaHelper.checkService('marketCap');
    });

});
