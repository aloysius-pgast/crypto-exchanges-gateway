"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

const orderBookEntrySchema = joi.object({
    rate:joi.number().positive().allow(0).required(),
    quantity:joi.number().positive().required()
});
const orderBookSchema = joi.object({
    buy:joi.array().items(orderBookEntrySchema).required(),
    sell:joi.array().items(orderBookEntrySchema).required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/orderBooks`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:1});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:2, include:staticSymbols});

        if (0 !== symbols.length)
        {
            _.forEach(symbols, (pair) => {

                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/orderBooks/${pair}`, function(method, path, params){
                    it(`it should retrieve order book for pair '${pair}'`, (done) => {
                        restClient.makeRequest(method, path, params).then((result) => {
                            Assert.validateResult(result, orderBookSchema);
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    });
                });
            });

            // try first pair with limited result
            let limit = 5;
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/orderBooks/${symbols[0]}`, function(method, path, params){
                it(`it should retrieve newest ${limit} order book entries for pair '${symbols[0]}'`, (done) => {
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, orderBookSchema);
                        if (result.body.buy.length > limit || result.body.sell.length > limit)
                        {
                            Assert.fail(`Result should contain less than ${limit} entries for both 'buy' and 'sell'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {limit:limit});
        }

        // unknown pair
        let unknownPair = 'UNKNOWN-PAIR';
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/orderBooks/${unknownPair}`, function(method, path, params){
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
        return MochaHelper.checkExchange(exchangeId, ['orderBooks']);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
