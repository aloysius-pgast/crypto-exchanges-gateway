"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

// schema for a single kline entry (if there was not trade, ohlc values will be null and volume will be 0)
const klineSchema = joi.object({
    timestamp:joi.number().positive().required(),
    remainingTime:joi.number().positive().required().allow(0),
    closed:joi.boolean().required(),
    open:joi.number().required().allow(null),
    high:joi.number().required().allow(null),
    low:joi.number().required().allow(null),
    close:joi.number().required().allow(null),
    volume:joi.number().required()
});

// how many klines entries are we supposed to get by default
const defaultKlinesSize = 500;
// maximum number of klines retrieved at once
const maxKlinesSize = 5000;

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/klines`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:1});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:2, include:staticSymbols});

        if (0 !== symbols.length)
        {
            _.forEach(symbols, (pair) => {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/klines/${pair}`, function(method, path, params){
                    it(`it should retrieve klines (default interval = ${services.exchanges[exchangeId].features['klines'].defaultInterval}) for pair '${pair}'`, (done) => {
                        const schema = joi.array().items(klineSchema).max(defaultKlinesSize);
                        restClient.makeRequest(method, path, params).then((result) => {
                            Assert.validateResult(result, schema);
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    });
                });
            });

            // try first pair with fromTimestamp & toTimestamp
            MochaHelper.describe('GET' , {path:`/exchanges/${exchangeId}/klines/${symbols[0]}`,params:'{"fromTimestamp":xxxx,"toTimestamp":yyyy}'}, function(method, path, params){
                it(`it should retrieve only 2 klines entries for pair '${symbols[0]}'`, (done) => {
                    let schema = joi.array().items(klineSchema).max(defaultKlinesSize);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        // try to retrieve the first 2 klines
                        if (result.body.length >= 2)
                        {
                            let firstIndex = parseInt(result.body.length / 2);
                            let lastIndex = firstIndex + 1;
                            let klines = [result.body[firstIndex],result.body[lastIndex]];
                            let _klines = [_.cloneDeep(klines[0]), _.cloneDeep(klines[1])];
                            // remove closed & remainingTime
                            _.forEach(_klines, (e) => {
                                delete e.remainingTime;
                                delete e.closed;
                            });
                            let schema = joi.array().items(klineSchema).max(2);
                            restClient.makeRequest(method, path, {fromTimestamp:klines[0].timestamp,toTimestamp:klines[1].timestamp}).then((result) => {
                                Assert.validateResult(result, schema);
                                _.forEach(result.body, (e, index) => {
                                    // remove closed & remainingTime
                                    delete e.remainingTime;
                                    delete e.closed;
                                    if (!_.isEqual(result.body[index], _klines[index]))
                                    {
                                        Assert.fail(`Result entry #${index} should be ${JSON.stringify(klines[index])}`);
                                    }
                                });
                                done();
                            }).catch((e) => {
                                done(e);
                            });
                        }
                        else
                        {
                            done();
                        }
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            // try first pair with a custom interval
            let index = services.exchanges[exchangeId].features['klines'].intervals.indexOf(services.exchanges[exchangeId].features['klines'].defaultInterval);
            if (-1 !== index)
            {
                ++index;
                if (index < services.exchanges[exchangeId].features['klines'].intervals)
                {
                    MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/klines/${symbols[0]}`, function(method, path, params){
                        let interval = services.exchanges[exchangeId].features['klines'].intervals[index];
                        const schema = joi.array().items(klineSchema).max(defaultKlinesSize);
                        it(`it should retrieve klines (interval = ${interval}) for pair '${symbols[0]}'`, (done) => {
                            restClient.makeRequest(method, path, params).then((result) => {
                                Assert.validateResult(result, schema);
                                done();
                            }).catch((e) => {
                                done(e);
                            });
                        });
                    }, {interval:interval});
                }
            }

            // try first pair with an unsupported kline interval
            let unsupportedKlineInterval = "Xm";
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/klines/${symbols[0]}`, function(method, path, params){
                const schema = joi.array().items(klineSchema);
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval) when using an unsupported kline interval", (done) => {
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {interval:unsupportedKlineInterval});

        }

        // unknown pair
        let unknownPair = 'UNKNOWN-PAIR';
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/trades/${unknownPair}`, function(method, path, params){
            it("it should fail with a 400 error (ExchangeError.InvalidRequest.XXX) when using an unsupported pair", (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:400,errorType:'ExchangeError.InvalidRequest.'});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId, ['klines']);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
