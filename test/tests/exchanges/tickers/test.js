"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for a single ticker entry
const tickerSchema = joi.object({
    pair:joi.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/).required(),
    last:joi.number().required(),
    priceChangePercent:joi.number().allow(null).required(),
    sell:joi.number().required(),
    buy:joi.number().required(),
    high:joi.number().required(),
    low:joi.number().required(),
    volume:joi.number().required(),
    timestamp:joi.number().positive().required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/tickers`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:2});
        if (0 !== staticSymbols.length)
        {
            // multiple pairs
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/tickers`, function(method, path, params){
                it(`it should retrieve tickers for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^[A-Z0-9]+-[A-Z0-9]+$/, tickerSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        _.forEach(staticSymbols, (pair) => {
                            if (undefined === result.body[pair])
                            {
                                Assert.fail(`Result should contain an entry for pair '${pair}'`, result.body);
                            }
                        });
                        let size = Object.keys(result.body).length;
                        if (staticSymbols.length != size)
                        {
                            Assert.fail(`Result should contain ${staticSymbols.length} entries, not ${size}`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pairs:staticSymbols});

        }

        // single pair for a random symbol
        let randomSymbols = MochaHelper.getRandomPairsSymbols(pairs, {count:1, exclude:staticSymbols});
        if (0 != randomSymbols.length)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/tickers/${randomSymbols[0]}`, function(method, path, params){
                it(`it should retrieve tickers for pair '${randomSymbols[0]}`, (done) => {
                    const schema = joi.object().pattern(/^[A-Z0-9]+-[A-Z0-9]+$/, tickerSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        let size = Object.keys(result.body).length;
                        if (undefined === result.body[randomSymbols[0]] || 1 != size)
                        {
                            Assert.fail(`Result should contain a single entry for pair '${randomSymbols[0]}'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }

        // all pairs if possible
        if (services.exchanges[exchangeId].features['tickers'].withoutPair)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/tickers`, function(method, path, params){
                it(`it should retrieve tickers for all pairs`, (done) => {
                    const schema = joi.object().pattern(/^[A-Z0-9]+-[A-Z0-9]+$/, tickerSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }
        // we should get an error if we try to retrieve all tickers and pair is required
        else
        {
            if (services.exchanges[exchangeId].features['tickers'].requirePair)
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/tickers`, function(method, path, params){
                    it("it should fail with a 400 error (GatewayError.InvalidRequest.MissingParameters) when 'pairs' parameter is missing", (done) => {
                        restClient.makeRequest(method, path, params).then((result) => {
                            Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.MissingParameters'});
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    });
                });
            }
        }

        // unknown pair
        let unknownPair = 'UNKNOWN-PAIR';
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/tickers/${unknownPair}`, function(method, path, params){
            it(`it should return an empty result when requesting an unknown pair`, (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    if (!_.isEmpty(result.body))
                    {
                        Assert.fail(`Result should be empty`, result.body);
                    }
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId, ['tickers']);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
