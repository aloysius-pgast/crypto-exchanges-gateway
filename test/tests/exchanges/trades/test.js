"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

// schema for a single trade
const tradeSchema = joi.object({
    id:joi.string().allow(null).required(),
    quantity:joi.number().positive().required(),
    rate:joi.number().positive().required(),
    // seems like it's possible to have a price = 0 (see below example for Poloniex)
    /*
    {
      "id": 264985,
      "quantity": 1e-8,
      "rate": 0.16750907,
      "orderType": "buy",
      "timestamp": 1525197482,
      "price": 0
    }
    */
    price:joi.number().required(),
    orderType:joi.string().valid(['buy','sell']).required(),
    timestamp:joi.number().positive().required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/trades`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:1});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:2, include:staticSymbols});

        if (0 !== symbols.length)
        {
            _.forEach(symbols, (pair) => {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/trades/${pair}`, function(method, path, params){
                    it(`it should retrieve last trades for pair '${pair}'`, (done) => {
                        const schema = joi.array().items(tradeSchema);
                        restClient.makeRequest(method, path, params).then((result) => {
                            Assert.validateResult(result, schema);
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    });
                });
            });

            // try first pair with limited result
            let limit = 5;
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/trades/${symbols[0]}`, function(method, path, params){
                it(`it should retrieve last ${limit} newest trades for pair '${symbols[0]}'`, (done) => {
                    const schema = joi.array().items(tradeSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        if (result.body.length > limit)
                        {
                            Assert.fail(`Result should contain less than ${limit} entries`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {limit:limit});

            // retrieve trades with an id > afterTradeId
            MochaHelper.describe('GET', {path:`/exchanges/${exchangeId}/trades/${symbols[0]}`,params:'{"afterTradeId":xxxx}}'}, function(method, path, params){
                it(`it should retrieve last trades with an id > xxxx for pair '${symbols[0]}'`, function(done){
                    const schema = joi.array().items(tradeSchema);
                    restClient.makeRequest(method, path, {}).then((result) => {
                        Assert.validateResult(result, schema);
                        if (result.body.length >= 1)
                        {
                            // if we search all trades with an id > (id(last) - 1) we should have an entry with id = id(last)
                            let lastTrade = result.body[0];
                            if (null === lastTrade.id)
                            {
                                this.skip();
                            }
                            // if lastTrade.id is a string, previous id is too complicated to compute as it is exchange dependant
                            if (isNaN(lastTrade.id))
                            {
                                this.skip();
                            }
                            let afterTradeId = lastTrade.id - 1;
                            restClient.makeRequest(method, path, {afterTradeId:afterTradeId}).then((result) => {
                                Assert.validateResult(result, schema);
                                let found = false;
                                _.forEach(result.body, (e) => {
                                    if (e.id == lastTrade.id)
                                    {
                                        found = true;
                                        return false;
                                    }
                                });
                                if (!found)
                                {
                                    Assert.fail(`Result should contain an entry with id = ${lastTrade.id} (id > ${afterTradeId})`, result.body);
                                }
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

            // retrieve trades with a timestamp > afterTimestamp
            MochaHelper.describe('GET', {path:`/exchanges/${exchangeId}/trades/${symbols[0]}`,params:'{"afterTimestamp":xxxx}}'}, function(method, path, params){
                it(`it should retrieve last trades with a timestamp > xxxx for pair '${symbols[0]}'`, (done) => {
                    const schema = joi.array().items(tradeSchema);
                    restClient.makeRequest(method, path, {}).then((result) => {
                        Assert.validateResult(result, schema);
                        if (result.body.length >= 2)
                        {
                            // if we search all trades with a timestamp > (timestamp(last) - 1) we should have an entry with id = id(last)
                            let lastTrade = result.body[0];
                            let afterTimestamp = lastTrade.timestamp - 1;
                            restClient.makeRequest(method, path, {afterTimestamp:afterTimestamp}).then((result) => {
                                Assert.validateResult(result, schema);
                                let found = false;
                                _.forEach(result.body, (e) => {
                                    if (e.id == lastTrade.id)
                                    {
                                        found = true;
                                        return false;
                                    }
                                });
                                if (!found)
                                {
                                    Assert.fail(`Result should contain an entry with id = ${lastTrade.id} (timestamp > ${afterTimestamp})`, result.body);
                                }
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
        return MochaHelper.checkExchange(exchangeId, ['trades']);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
