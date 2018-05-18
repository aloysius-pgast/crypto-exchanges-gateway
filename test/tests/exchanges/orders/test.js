"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for an open order
const openOrderSchema = joi.object({
    pair:joi.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/).required(),
    orderType:joi.string().valid(['buy','sell']).required(),
    orderNumber:joi.string().required(),
    targetRate:joi.number().positive().required(),
    quantity:joi.number().positive().required(),
    targetPrice:joi.number().positive().required(),
    remainingQuantity:joi.number().positive().required(),
    openTimestamp:joi.number().positive().required()
});

//-- schema for a closed order
const closedOrderSchema = joi.object({
    pair:joi.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/).required(),
    orderType:joi.string().valid(['buy','sell']).required(),
    orderNumber:joi.string().required(),
    quantity:joi.number().required(),
    // must be null if quantity = 0
    actualRate:joi.required().when('quantity', {is:0, then:joi.any().valid(null), otherwise:joi.number().positive()}),
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

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/orders`, (services, pairs) => {

        let openOrdersPairs = MochaHelper.getOpenOrdersPairs(exchangeId);
        // we are supposed to have open orders
        if (0 != openOrdersPairs.length && !services.exchanges[exchangeId].demo)
        {
            let order;
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/openOrders`, function(method, path, params){
                it(`it should retrieve at least one order for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, openOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should not be empty (check tests config)`, result.body);
                        }
                        let orderNumber = Object.keys(result.body)[0];
                        order = result.body[orderNumber];
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pairs:openOrdersPairs});

            // try to retrieve the first order
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/orders/xxxx`,params:'{"pair":"yyyy"}'}, function(method, path, params){
                it(`it should retrieve the requested order`, (done) => {
                    const schema = openOrderSchema;
                    restClient.makeRequest(method, `/exchanges/${exchangeId}/orders/${order.orderNumber}`, {pair:order.pair}).then((result) => {
                        Assert.validateResult(result, schema);
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            // try to retrieve an non existent order
            let pair = getSupportedPairSymbolForExchange(exchangeId);
            let unknownOrder = '00000000-0000-0000-0000-000000000001';
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/orders/${unknownOrder}`, function(method, path, params){
                it("it should fail with a 404 error (ExchangeError.InvalidRequest.OrderError.OrderNotFound) or 400 error (ExchangeError.InvalidRequest.UnknownError) when providing an invalid order number", (done) => {
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:[404,400],errorType:['ExchangeError.InvalidRequest.OrderError.OrderNotFound','ExchangeError.InvalidRequest.UnknownError']});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {pair:pair});
        }

        let closedOrdersPairs = MochaHelper.getClosedOrdersPairs(exchangeId);
        // we are supposed to have closed orders
        if (0 != closedOrdersPairs.length && !services.exchanges[exchangeId].demo)
        {
            let order;
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/closedOrders`, function(method, path, params){
                it(`it should retrieve at least one order for pairs [${params.pairs.join(',')}]`, (done) => {
                    const schema = joi.object().pattern(/^.+$/, closedOrderSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should not be empty (check tests config)`, result.body);
                        }
                        let orderNumber = Object.keys(result.body)[0];
                        order = result.body[orderNumber];
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pairs:closedOrdersPairs,completeHistory:true});

            // try to retrieve the first order
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/orders/xxxx`,params:'{"pair":"yyyy"}'}, function(method, path, params){
                it(`it should retrieve the requested order`, (done) => {
                    const schema = closedOrderSchema;
                    restClient.makeRequest(method, `/exchanges/${exchangeId}/orders/${order.orderNumber}`, {pair:order.pair}).then((result) => {
                        Assert.validateResult(result, schema);
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId, ['openOrders','closedOrders','orders']);
    }, true);
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
