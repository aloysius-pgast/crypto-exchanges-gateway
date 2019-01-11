"use strict";
const joi = require('joi');
const _ = require('lodash');
const Big = require('big.js');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/testOrder`, (services, pairs) => {

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:1});
        let symbols = MochaHelper.getRandomPairsSymbols(pairs, {count:2, include:staticSymbols});
        if (0 == symbols.length)
        {
            return;
        }
        _.forEach(symbols, (pair) => {
            let minRate = pairs[pair].limits.rate.min;
            if (0 == minRate)
            {
                minRate = 0.00000002;
            }
            let invalidRate = parseFloat(minRate / 2);
            let minQuantity = pairs[pair].limits.quantity.min;
            let invalidQuantity = parseFloat(minQuantity / 2);
            let minPrice = pairs[pair].limits.price.min;
            let invalidPrice = parseFloat(minPrice / 2);

            // create an order with rate < minRate & quantity < minQuantity
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/testOrder`, function(method, path, params){
                it(`it should return a result with valid (updated) rate, quantity & targetPrice when using invalid rate = ${params.targetRate} & invalid quantity = ${params.quantity}`, (done) => {
                    const schema = joi.object({
                        pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
                        orderType:joi.string().valid(['buy','sell']).required(),
                        targetRate:joi.number().positive().required().min(minRate),
                        quantity:joi.number().positive().required().min(minQuantity),
                        targetPrice:joi.number().required().min(minPrice),
                        fees:joi.number().required(),
                        finalPrice:joi.number().required()
                    });
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        let quantity = new Big(result.body.quantity);
                        let targetRate = new Big(result.body.targetRate);
                        let finalPrice = new Big(result.body.finalPrice);
                        let targetPrice = new Big(result.body.targetPrice);
                        let fees = new Big(result.body.fees);
                        if (quantity.times(targetRate).toFixed(8) != targetPrice.toFixed(8))
                        {
                            Assert.fail("'targetPrice' should be (quantity * targetRate)", result.body);
                        }
                        if (targetPrice.plus(fees).toFixed(8) != finalPrice.toFixed(8))
                        {
                            Assert.fail("'finalPrice' should be (targetPrice + fees)", result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pair:pair,orderType:'buy',targetRate:invalidRate,quantity:invalidQuantity});

            // create an order with rate < minRate & targetPrice < minPrice
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/testOrder`, function(method, path, params){
                it(`it should return a result with valid (updated) rate, quantity & targetPrice when using invalid rate = ${params.targetRate} & invalid targetPrice = ${params.targetPrice}`, (done) => {
                    const schema = joi.object({
                        pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
                        orderType:joi.string().valid(['buy','sell']).required(),
                        targetRate:joi.number().positive().required().min(minRate),
                        quantity:joi.number().positive().required().min(minQuantity),
                        targetPrice:joi.number().required().min(minPrice),
                        fees:joi.number().required(),
                        finalPrice:joi.number().required()
                    });
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        let quantity = new Big(result.body.quantity);
                        let targetRate = new Big(result.body.targetRate);
                        let finalPrice = new Big(result.body.finalPrice);
                        let targetPrice = new Big(result.body.targetPrice);
                        let fees = new Big(result.body.fees);
                        if (quantity.times(targetRate).toFixed(8) != targetPrice.toFixed(8))
                        {
                            Assert.fail("'targetPrice' should be (quantity * targetRate)", result.body);
                        }
                        if (targetPrice.plus(fees).toFixed(8) != finalPrice.toFixed(8))
                        {
                            Assert.fail("'finalPrice' should be (targetPrice + fees)", result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pair:pair,orderType:'buy',targetRate:invalidRate,targetPrice:invalidPrice});

            // create an order with rate < minRate & finalPrice < minPrice
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/testOrder`, function(method, path, params){
                it(`it should return a result with valid (updated) rate, quantity & targetPrice when using invalid rate = ${params.targetRate} & invalid finalPrice = ${params.finalPrice}`, (done) => {
                    const schema = joi.object({
                        pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
                        orderType:joi.string().valid(['buy','sell']).required(),
                        targetRate:joi.number().positive().required().min(minRate),
                        quantity:joi.number().positive().required().min(minQuantity),
                        targetPrice:joi.number().required().min(minPrice),
                        fees:joi.number().required(),
                        finalPrice:joi.number().required()
                    });
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema);
                        let quantity = new Big(result.body.quantity);
                        let targetRate = new Big(result.body.targetRate);
                        let finalPrice = new Big(result.body.finalPrice);
                        let targetPrice = new Big(result.body.targetPrice);
                        let fees = new Big(result.body.fees);
                        if (quantity.times(targetRate).toFixed(8) != targetPrice.toFixed(8))
                        {
                            Assert.fail("'targetPrice' should be (quantity * targetRate)", result.body);
                        }
                        if (targetPrice.plus(fees).toFixed(8) != finalPrice.toFixed(8))
                        {
                            Assert.fail("'finalPrice' should be (targetPrice + fees)", result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pair:pair,orderType:'buy',targetRate:invalidRate,finalPrice:invalidPrice});

            //-- create an order with valid rate & quantity
            // first we use invalid values in first request
            // then we reuse result to make a second request (we should have same result)
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/testOrder`,params:`{"pair":${pair},"orderType":"buy","targetRate":xxxx,"quantity":yyyy}`}, function(method, path, params){
                it(`it should return a result with same rate = xxxx & quantity = yyyy when using valid rate = xxxx & valid quantity = yyyy`, (done) => {
                    const schema = joi.object({
                        pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
                        orderType:joi.string().valid(['buy','sell']).required(),
                        targetRate:joi.number().positive().required().min(minRate),
                        quantity:joi.number().positive().required().min(minQuantity),
                        targetPrice:joi.number().required().min(minPrice),
                        fees:joi.number().required(),
                        finalPrice:joi.number().required()
                    });
                    restClient.makeRequest(method, path, {pair:pair,orderType:'buy',targetRate:invalidRate,quantity:invalidQuantity}).then((result) => {
                        Assert.validateResult(result, schema);
                        let quantity = new Big(result.body.quantity);
                        let targetRate = new Big(result.body.targetRate);
                        let finalPrice = new Big(result.body.finalPrice);
                        let targetPrice = new Big(result.body.targetPrice);
                        let fees = new Big(result.body.fees);
                        if (quantity.times(targetRate).toFixed(8) != targetPrice.toFixed(8))
                        {
                            Assert.fail("'targetPrice' should be (quantity * targetRate)", result.body);
                        }
                        if (targetPrice.plus(fees).toFixed(8) != finalPrice.toFixed(8))
                        {
                            Assert.fail("'finalPrice' should be (targetPrice + fees)", result.body);
                        }
                        let previousResult = result.body;
                        restClient.makeRequest(method, path, {pair:pair,orderType:'buy',targetRate:previousResult.targetRate,quantity:previousResult.quantity}).then((result) => {
                            Assert.validateResult(result, schema);
                            _.forEach(['targetRate','quantity','targetPrice','finalPrice'], (k) => {
                                let previousValue = new Big(previousResult[k]);
                                if (!previousValue.eq(result.body[k]))
                                {
                                    Assert.fail(`'${k} should be ${previousResult[k]}`);
                                }
                            });
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            //-- create an order with valid rate & targetPrice
            // first we use invalid values in first request
            // then we reuse result to make a second request (we should have same result)
            MochaHelper.describe('GET' ,{path:`/exchanges/${exchangeId}/testOrder`,params:`{"pair":${pair},"orderType":"buy","targetRate":xxxx,"targetPrice":zzzz}`}, function(method, path, params){
                it(`it should return a result with same rate = xxxx & targetPrice = zzzz when using valid rate = xxxx & valid targetPrice = zzzz`, (done) => {
                    const schema = joi.object({
                        pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
                        orderType:joi.string().valid(['buy','sell']).required(),
                        targetRate:joi.number().positive().required().min(minRate),
                        quantity:joi.number().positive().required().min(minQuantity),
                        targetPrice:joi.number().required().min(minPrice),
                        fees:joi.number().required(),
                        finalPrice:joi.number().required()
                    });
                    restClient.makeRequest(method, path, {pair:pair,orderType:'buy',targetRate:invalidRate,finalPrice:invalidPrice}).then((result) => {
                        Assert.validateResult(result, schema);
                        let quantity = new Big(result.body.quantity);
                        let targetRate = new Big(result.body.targetRate);
                        let finalPrice = new Big(result.body.finalPrice);
                        let targetPrice = new Big(result.body.targetPrice);
                        let fees = new Big(result.body.fees);
                        if (quantity.times(targetRate).toFixed(8) != targetPrice.toFixed(8))
                        {
                            Assert.fail("'targetPrice' should be (quantity * targetRate)", result.body);
                        }
                        if (targetPrice.plus(fees).toFixed(8) != finalPrice.toFixed(8))
                        {
                            Assert.fail("'finalPrice' should be (targetPrice + fees)", result.body);
                        }
                        let previousResult = result.body;
                        restClient.makeRequest(method, path, {pair:pair,orderType:'buy',targetRate:previousResult.targetRate,targetPrice:previousResult.targetPrice}).then((result) => {
                            Assert.validateResult(result, schema);
                            _.forEach(['targetRate','quantity','targetPrice','finalPrice'], (k) => {
                                let previousValue = new Big(previousResult[k]);
                                if (!previousValue.eq(result.body[k]))
                                {
                                    Assert.fail(`'${k} should be ${previousResult[k]}`);
                                }
                            });
                            done();
                        }).catch((e) => {
                            done(e);
                        });
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

        });

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId, ['pairs']);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
