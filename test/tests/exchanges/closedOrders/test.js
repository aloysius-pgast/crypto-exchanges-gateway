"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for a single closed order entry
const closedOrderSchema = joi.object({
    pair:joi.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/).required(),
    orderType:joi.string().valid(['buy','sell']).required(),
    orderNumber:joi.string().required(),
    quantity:joi.number().required(),
    // can be null if quantity = 0
    actualRate:joi.number().positive().allow(null).required(),
    // must be 0 if quantity = 0
    actualPrice:joi.required().when('quantity', {is:0, then:joi.number().valid(0), otherwise:joi.number().positive()}),
    openTimestamp:joi.number().positive().allow(null).required(),
    closedTimestamp:joi.number().positive().allow(null).required(),
    fees:joi.object({
        amount:joi.number(),
        currency:joi.string()
    }).allow(null).required(),
    // both values should be null if fees are null
    finalRate:joi.required().when('fees', {is:null, then:joi.any().valid(null), otherwise:joi.number().positive()}),
    finalPrice:joi.required().when('fees', {is:null, then:joi.any().valid(null), otherwise:joi.number().positive()})
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/closedOrders`, (services, pairs) => {

        // we are supposed to have closed orders
        let closedOrdersPairs = MochaHelper.getClosedOrdersPairs(exchangeId);
        if (0 != closedOrdersPairs.length && !services.exchanges[exchangeId].demo)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
                it(`it should retrieve at least one order for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, closedOrderSchema);
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
            },{pairs:closedOrdersPairs,completeHistory:true});

            // try to retrieve a single order
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/closedOrders/xxxx`,params:'{"pair":"yyyy","completeHistory:true"}'}, function(method, path, params){
                it(`it should retrieve only one order`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, closedOrderSchema);
                    // first retrieve complete history
                    restClient.makeRequest(method, `/exchanges/${exchangeId}/closedOrders`, {pairs:closedOrdersPairs,completeHistory:true}).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should not be empty (check tests config)`, result.body);
                        }
                        // retrieve the first order
                        let orderNumber = Object.keys(result.body)[0];
                        let order = result.body[orderNumber];
                        restClient.makeRequest(method, `/exchanges/${exchangeId}/closedOrders/${orderNumber}`, {pair:order.pair}).then((result) => {
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
            if (services.exchanges[exchangeId].features['closedOrders'].withoutPair)
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders/${unknownOrder}`, function(method, path, params){
                    it(`it should return an empty result when requesting a single closed order which does not exist`, (done) => {
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
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders/${unknownOrder}`, function(method, path, params){
                    it(`it should return an empty result when requesting a single closed order which does not exist`, (done) => {
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
                if (services.exchanges[exchangeId].features['closedOrders'].requirePair)
                {
                    MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders/${unknownOrder}`, function(method, path, params){
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

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:2});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:3, include:staticSymbols});
        if (0 !== symbols.length)
        {
            // multiple pairs
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
                it(`it should retrieve closed orders for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, closedOrderSchema);
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
        if (services.exchanges[exchangeId].features['closedOrders'].withoutPair)
        {
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
                it(`it should retrieve closed orders for all pairs`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, closedOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }
        // we should get an error if we try to retrieve all closed orders without 'pairs'
        else
        {
            if (services.exchanges[exchangeId].features['closedOrders'].requirePair)
            {
                MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
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
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
            it(`it should return an empty result when requesting closed orders for an unknown pair`, (done) => {
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
        return MochaHelper.checkExchange(exchangeId, ['closedOrders']);
    }, true);
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
