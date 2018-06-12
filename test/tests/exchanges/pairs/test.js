"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for a single pair
const pairSchema = joi.object({
    pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
    baseCurrency:joi.string().regex(/^[A-Za-z0-9]+$/).required(),
    currency:joi.string().regex(/^[A-Za-z0-9]+$/).required(),
    limits:joi.object({
        rate:joi.object({
            min:joi.number().positive().required(),
            max:joi.number().positive().allow(null).required(),
            step:joi.number().positive(),
            // it's possible to have precision = 0 (with step 1)
            precision:joi.number().integer().required()
        }).required(),
        quantity:joi.object({
            min:joi.number().positive().required(),
            max:joi.number().positive().allow(null).required(),
            step:joi.number().positive(),
            // it's possible to have precision = 0 (with step 1)
            precision:joi.number().integer().required()
        }).required(),
        price:joi.object({
            min:joi.number().required(),
            max:joi.number().allow(null).required()
        }).required()
    }).required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/pairs`, (services, pairs) => {

        // all pairs
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/pairs`, function(method, path, params){
            it(`it should retrieve all active pairs`, (done) => {
                const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, pairSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema, {isList:true});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        let staticSymbols = MochaHelper.getSupportedPairSymbols(pairs, {count:1});
        if (0 !== staticSymbols.length)
        {
            let splittedPair = staticSymbols[0].split('-');

            //-- single pair
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/pairs`, function(method, path, params){
                it(`it should retrieve a single pair '${params.pair}'`, (done) => {
                    const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, pairSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (undefined === result.body[staticSymbols[0]] || 1 != Object.keys(result.body).length)
                        {
                            Assert.fail(`Result should contain a single pair '${staticSymbols[0]}'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {pair:staticSymbols[0]});

            //-- baseCurrency
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/pairs`, function(method, path, params){
                it(`it should retrieve all pairs with '${splittedPair[1]}' as base currency`, (done) => {
                    const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, pairSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (undefined === result.body[staticSymbols[0]])
                        {
                            Assert.fail(`Result should contain an entry for pair '${staticSymbols[0]}'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{baseCurrency:splittedPair[0]});

            //-- currency
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/pairs`, function(method, path, params){
                it(`it should retrieve all pairs with '${splittedPair[1]}' as currency`, (done) => {
                    const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, pairSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (undefined === result.body[staticSymbols[0]])
                        {
                            Assert.fail(`Result should contain an entry for pair '${staticSymbols[0]}'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{currency:splittedPair[1]});

            //-- unknown pair
            let unknownPair = 'UNKNOWN-PAIR';
            MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/pairs`, function(method, path, params){
                it(`it should return an empty result when requesting an unknown pair`, (done) => {
                    const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, pairSchema);
                    restClient.makeRequest(method, path, params).then((result) => {
                        Assert.validateResult(result, schema, {isList:true});
                        if (!_.isEmpty(result.body))
                        {
                            Assert.fail(`Result should be empty`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            },{pair:unknownPair});

        }

    }, (services) => {
        return MochaHelper.checkExchange(exchangeId);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
