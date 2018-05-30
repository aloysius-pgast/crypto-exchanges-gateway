"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

// schema for a single balance entry
const balanceSchema = joi.object({
    currency:joi.string().regex(/^[A-Z0-9]+$/).required(),
    total:joi.number().positive().required(),
    available:joi.number().required(),
    onOrders:joi.number().required()
});

const defineForExchange = (exchangeId) => {

    MochaHelper.createExchangeSuite(exchangeId, `/exchanges/${exchangeId}/balances`, (services, pairs) => {

        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/balances`, function(method, path, params){
            it(`it should retrieve all balances with a total > 0`, (done) => {
                const schema = joi.object().pattern(/^[A-Z0-9]+$/, balanceSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema, {isList:true});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        // unknown currency
        let unknownCurrency = 'UNKNOWN';
        MochaHelper.describe('GET' ,`/exchanges/${exchangeId}/balances/${unknownCurrency}`, function(method, path, params){
            it(`it should return an empty result when requesting an unknown currency or a currency with a total <= 0`, (done) => {
                const schema = joi.object().pattern(/^[A-Z0-9]+$/, balanceSchema);
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
        return MochaHelper.checkExchange(exchangeId, ['balances']);
    }, true);
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});

module.exports = defineForExchange;
