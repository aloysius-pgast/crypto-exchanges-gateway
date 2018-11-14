"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

//-- schema for a single rate
const rateSchema = joi.object({
    pair:joi.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/).required(),
    baseCurrency:joi.string().regex(/^[A-Za-z0-9]+$/).required(),
    currency:joi.string().regex(/^[A-Za-z0-9]+$/).required(),
    rate:joi.number().positive().required()
});

MochaHelper.prepare(() => {

    MochaHelper.createSuite('/fxConverter', (services) => {

        MochaHelper.describe('GET', '/fxConverter/currencies', function(method, path, params){
            it("it should return the list of supported currencies", (done) => {
                const schema = joi.array().items(joi.string()).min(1);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/fxConverter/rates', function(method, path, params){
            it('it should display the rate of each currency in USD', (done) => {
                const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, rateSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/fxConverter/rates', function(method, path, params){
            it(`it should return rates for 3 pairs`, (done) => {
                const schema = joi.object().pattern(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, rateSchema);
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    _.forEach(params.pairs, (pair) => {
                        if (undefined === result.body[pair])
                        {
                            Assert.fail(`Result should contain an entry for pair '${pair}'`, result.body);
                        }
                    });
                    let size = Object.keys(result.body).length;
                    if (params.pairs.length != size)
                    {
                        Assert.fail(`Result should contain ${params.pairs.length} entries, not ${size}`, result.body);
                    }
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        },{pairs:['EUR-USD', 'USD-EUR', 'EUR-GBP']});

    }, (services) => {
        return MochaHelper.checkService('fxConverter');
    });

});
