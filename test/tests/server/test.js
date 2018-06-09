"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../lib/assert');
const MochaHelper = require('../../lib/mocha-helper');
const restClient = require('../../lib/rest-client').getInstance();

MochaHelper.prepare(() => {
    MochaHelper.createSuite('/server', (services) => {

        MochaHelper.describe('GET', '/server/uptime', function(method, path, params){
            it('it should return gateway uptime & version', (done) => {
                const schema = joi.object({
                    uptime:joi.number().positive().required(),
                    version:joi.string().regex(/^[1-9](\.[0-9]+){2}$/)
                });
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/exchanges', function(method, path, params){
            it('it should list all enabled exchanges', (done) => {
                const schema = joi.array().items(joi.string());
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/server/services', function(method, path, params){
            it('it should list all existing services', (done) => {
                const schema = joi.object({
                    exchanges:joi.object().pattern(/.*/, joi.object({
                        id:joi.string().required(),
                        type:joi.string().required(),
                        name:joi.string().required(),
                        demo:joi.boolean().required(),
                        feesPercent:joi.number().positive().required(),
                        features:joi.object({
                            pairs:joi.object({
                                enabled:joi.boolean().required()
                            }).required(),
                            tickers:joi.object({
                                enabled:joi.boolean().required(),
                                withoutPair:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                requirePair:joi.boolean().when('withoutPair', {is:false, then:joi.required()})
                            }).required(),
                            wsTickers:joi.object({
                                enabled:joi.boolean().required(),
                                emulated:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                period:joi.number().integer().when('emulated', {is:true, then:joi.required()})
                            }).required(),
                            orderBooks:joi.object({
                                enabled:joi.boolean().required()
                            }).required(),
                            wsOrderBooks:joi.object({
                                enabled:joi.boolean().required(),
                                emulated:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                period:joi.number().integer().when('emulated', {is:true, then:joi.required()})
                            }).required(),
                            trades:joi.object({
                                enabled:joi.boolean().required()
                            }).required(),
                            wsTrades:joi.object({
                                enabled:joi.boolean().required(),
                                emulated:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                period:joi.number().integer().when('emulated', {is:true, then:joi.required()})
                            }).required(),
                            klines:joi.object({
                                enabled:joi.boolean().required(),
                                intervals:joi.array().items(joi.string()).when('enabled', {is:true, then:joi.required()}),
                                defaultInterval:joi.string().when('enabled', {is:true, then:joi.required()})
                            }).required(),
                            wsKlines:joi.object({
                                enabled:joi.boolean().required(),
                                emulated:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                period:joi.number().integer().when('emulated', {is:true, then:joi.required()}),
                                intervals:joi.array().items(joi.string()).when('enabled', {is:true, then:joi.required()}),
                                defaultInterval:joi.string().when('enabled', {is:true, then:joi.required()}),
                            }).required(),
                            orders:joi.object({
                                enabled:joi.boolean().required(),
                                withoutPair:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                requirePair:joi.boolean().when('withoutPair', {is:false, then:joi.required()})
                            }).required(),
                            openOrders:joi.object({
                                enabled:joi.boolean().required(),
                                withoutPair:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                requirePair:joi.boolean().when('withoutPair', {is:false, then:joi.required()})
                            }).required(),
                            closedOrders:joi.object({
                                enabled:joi.boolean().required(),
                                withoutPair:joi.boolean().when('enabled', {is:true, then:joi.required()}),
                                requirePair:joi.boolean().when('withoutPair', {is:false, then:joi.required()}),
                                completeHistory:joi.boolean().when('enabled', {is:true, then:joi.required()})
                            }).required(),
                            balances:joi.object({
                                enabled:joi.boolean().required(),
                                withoutCurrency:joi.boolean().when('enabled', {is:true, then:joi.required()})
                            }).required()
                        }).required()
                    })),
                    others:joi.object({
                        coinmarketcap:joi.object({
                            id:joi.string().required(),
                            name:joi.string().required(),
                            demo:joi.boolean().required(),
                            features:joi.object().required(),
                            cfg:joi.object()
                        }),
                        pushover:joi.object({
                            id:joi.string().required(),
                            name:joi.string().required(),
                            demo:joi.boolean().required(),
                            features:joi.object().required(),
                            cfg:joi.object()
                        }),
                        tickerMonitor:joi.object({
                            id:joi.string().required(),
                            name:joi.string().required(),
                            demo:joi.boolean().required(),
                            features:joi.object().required(),
                            cfg:joi.object({
                                delay:joi.number().integer().positive()
                            })
                        }),
                    }).required()
                });
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, schema);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        MochaHelper.describe('GET', '/unknownRoute', function(method, path, params){
            it('it should fail with a 404 error (GatewayError.UnknownRoute) when requesting an invalid route', (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:404,errorType:'GatewayError.UnknownRoute'});
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

    }, (services) => {
        return true;
    });
});
