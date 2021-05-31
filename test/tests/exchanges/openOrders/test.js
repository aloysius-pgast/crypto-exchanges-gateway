"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for a single open order entry
const openOrderSchema = joi.object({
    pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
    orderType:joi.string().valid(['buy','sell']).required(),
    orderNumber:joi.string().required(),
    targetRate:joi.number().positive().required(),
    quantity:joi.number().positive().required(),
    targetPrice:joi.number().positive().required(),
    remainingQuantity:joi.number().positive().required(),
    openTimestamp:joi.number().positive().required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/openOrders`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:2});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:3, include:staticSymbols});

        // we are supposed to have open orders
        let openOrdersPairs = MochaHelper.getOpenOrdersPairs(exchangeId);
        if (0 != openOrdersPairs.length && !services.exchanges[exchangeId].demo)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
                it(`it should retrieve at least one order for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, openOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should not be empty (check tests config)`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pairs:openOrdersPairs});

            // try to retrieve a single order
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/openOrders/xxxx`,params:'{"pair":"yyyy"}'}, function(method, path, params){
                it(`it should retrieve only one order`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, openOrderSchema);
                    restClient.makeRequest(method, `/exchanges/${exchangeId}/openOrders`, {pairs:openOrdersPairs}).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should not be empty (check tests config)`, result.body);
                        }
                        // retrieve the first order
                        let orderNumber = Object.keys(result.body)[0];
                        let order = result.body[orderNumber];
                        restClient.makeRequest(method, `/exchanges/${exchangeId}/openOrders/${orderNumber}`, {pair:order.pair}).then((result) => {
                            Assert.validateResult(result, schema);
                            let size = Object.keys(result.body).length;
                            if (undefined === result.body[orderNumber] || 1 != size)
                            {
                                Assert.fail(`Result should contain a single entry for order '${orderNumber}'`, result.body);
                            }
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            // single unknown order
            let unknownOrder = '00000000';
            if (services.exchanges[exchangeId].features['openOrders'].withoutPair)
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders/${unknownOrder}`, function(method, path, params){
                    it(`it should return an empty result when requesting a single open order which does not exist`, (done) => {
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
            }
            // we need to define 'pair' parameter for the order we want to retrieve
            else
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders/${unknownOrder}`, function(method, path, params){
                    it(`it should return an empty result when requesting a single open order which does not exist`, (done) => {
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
                }, {pair:[symbols[0]]});

                // we should get an error if 'pair' is not defined
                if (services.exchanges[exchangeId].features['openOrders'].requirePair)
                {
                    MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders/${unknownOrder}`, function(method, path, params){
                        it("it should fail with a 400 error (GatewayError.InvalidRequest.MissingParameters) when 'pair' parameter is missing", (done) => {
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
        }

        if (0 !== symbols.length)
        {
            // multiple pairs
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
                it(`it should retrieve open orders for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, openOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pairs:symbols});
        }

        // all pairs if possible
        if (services.exchanges[exchangeId].features['openOrders'].withoutPair)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
                it(`it should retrieve open orders for all pairs`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, openOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }
        // we should get an error if we try to retrieve all open orders without 'pairs'
        else
        {
            if (services.exchanges[exchangeId].features['openOrders'].requirePair)
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
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
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
            it(`it should return an empty result when requesting open orders for an unknown pair`, (done) => {
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
        }, {pairs:[unknownPair]});

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId, ['openOrders']);
    }, true);
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
