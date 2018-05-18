"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

const convertCurrency = 'GBP';

// ensure we put allow(null) wherever we can have null values
const tickerSchema = joi.object({
    name:joi.string().required(),
    symbol:joi.string().required(),
    rank:joi.number().positive().required(),
    last_updated:joi.number().positive().allow(null).required(),
    converted:joi.object().pattern(/^[A-Z0-9]+$/, joi.object({
        price:joi.number().positive().allow(null).required(),
        market_cap:joi.number().positive().allow(null).required(),
        volume_24h:joi.number().positive().allow(null).required()
    })).required(),
    price_usd:joi.number().positive().allow(null).required(),
    market_cap_usd:joi.number().positive().allow(null).required(),
    volume_24h_usd:joi.number().positive().allow(null).required(),
    price_btc:joi.number().positive().allow(null).required(),
    market_cap_btc:joi.number().positive().allow(null).required(),
    volume_24h_btc:joi.number().positive().allow(null).required(),
    total_supply:joi.number().positive().allow(0).allow(null).required(),
    circulating_supply:joi.number().positive().allow(0).allow(null).required(),
    max_supply:joi.number().positive().allow(0).allow(null).required(),
    percent_change_1h:joi.number().allow(null).required(),
    percent_change_24h:joi.number().allow(null).required(),
    percent_change_7d:joi.number().allow(null).required()
});

const historyEntrySchema = joi.object({
    date:joi.string().regex(/^(19|20)[0-9]{2}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/).required(),
    open:joi.number().positive().allow(null).required(),
    hight:joi.number().positive().allow(null).required(),
    low:joi.number().positive().allow(null).required(),
    close:joi.number().positive().allow(null).required(),
    open:joi.number().positive().allow(null).required(),
    volume:joi.number().positive().allow(null).required(),
    market_cap:joi.number().positive().allow(null).required()
});

MochaHelper.prepare(() => {

    MochaHelper.createSuite('/coinmarketcap', (services) => {

        MochaHelper.describe('GET', '/coinmarketcap/fiatCurrencies', function(method, path, params){
            it("it should return the list of supported 'fiat' currencies which can be used for conversion", (done) => {
                const schema = joi.array().items(joi.string()).min(1);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/coinmarketcap/symbols', function(method, path, params){
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

        MochaHelper.describe('GET', '/coinmarketcap/tickers', function(method, path, params){
            it('it should return first 100 tickers from Coin Market Cap', (done) => {
                const schema = joi.array().items(tickerSchema).max(100);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/coinmarketcap/tickers', function(method, path, params){
            it(`it should return first 5 tickers from Coin Market Cap, converted to '${convertCurrency}'`, (done) => {
                const schema = joi.array().items(tickerSchema).max(5);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    _.forEach(result.body, (ticker, index) => {
                        if (undefined === ticker.converted[convertCurrency])
                        {
                            Assert.fail(`body[${index}][converted] (${ticker.symbol}) should contain an entry for '${convertCurrency}'`, result.body);
                        }
                    });
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        },{limit:5,convertTo:[convertCurrency]});

        MochaHelper.describe('GET', '/coinmarketcap/tickers/BTC', function(method, path, params){
            it(`it should return a single ticker for BTC`, (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, tickerSchema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/coinmarketcap/tickers/INVALID', function(method, path, params){
            it("it should fail with a 404 error (GatewayError.InvalidRequest.ObjectNotFound) when requesting a single ticker for an invalid symbol", (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:404,errorType:'GatewayError.InvalidRequest.ObjectNotFound'});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/coinmarketcap/tickers', function(method, path, params){
            it("it should return tickers for BTC & ETH from Coin Market Cap", (done) => {
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

        if (services.others['coinmarketcap'].features['history'].enabled)
        {

            MochaHelper.describe('GET', '/coinmarketcap/history/NEO', function(method, path, params){
                it("it should return NEO history from 2017-12-25 to 2017-12-31, oldest first", (done) => {
                    const schema = joi.array().items(historyEntrySchema).length(7);
                    restClient.makeRequest(method, path, params).then((result) => {
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{to:'2017-12-31',sort:'asc'});

            MochaHelper.describe('GET', '/coinmarketcap/history/INVALID/2000-01-01', function(method, path, params){
                it("it should fail with a 404 error (GatewayError.InvalidRequest.ObjectNotFound) when requesting history for an invalid symbol or period", (done) => {
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:404,errorType:'GatewayError.InvalidRequest.ObjectNotFound'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }

    }, (services) => {
        return MochaHelper.checkService('coinmarketcap');
    });

});
