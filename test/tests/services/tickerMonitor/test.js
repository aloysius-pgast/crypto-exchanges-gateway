"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

// the alert we want to create
const ALERT_NAME = 'mocha-2af54305f183778d87de0c70c591fae4';

const SUPPORTED_SERVICES = ['coinmarketcap'];

const EXCHANGE_FIELDS = ['last', 'buy', 'sell', 'high', 'low', 'volume', 'priceChangePercent'];

const SERVICES_FIELDS = {
    'coinmarketcap':['price_usd', 'price_btc', 'volume_24_usd', 'volume_24_btc', 'total_supply', 'circulating_supply', 'market_cap_usd', 'market_cap_btc', 'percent_change_1h', 'percent_change_24h', 'percent_change_7d']
}

let allSupportedFields = [];
_.forEach(EXCHANGE_FIELDS, (f) => {
    allSupportedFields.push(f);
});
_.forEach(SERVICES_FIELDS, (list, id) => {
    _.forEach(list, (f) => {
        allSupportedFields.push(f);
    });
});

/**
 * List of supported operators and whether or not they require array parameter
 */
const OPERATORS = {
    'eq':false,
    'neq':false,
    'lt':false,
    'lte':false,
    'gt':false,
    'gte':false,
    // require array
    'in':true,
    'out':true
};

const tickerMonitorConditionSchema = joi.object({
    origin:joi.object({
        type:joi.string().required().valid('exchange','service'),
        id:joi.string()
    }).required(),
    condition:joi.object({
        field:joi.string().required().valid(allSupportedFields),
        operator:joi.string().required().valid(Object.keys(OPERATORS)),
        value:joi.alternatives([joi.number().required(), joi.array().items(joi.number()).length(2)]),
        pair:joi.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/),
        symbol:joi.string()
    }).required(),
    status:joi.object({
        value:joi.string().required().valid(['active','inactive','unknown','invalid']),
        timestamp:joi.number()
    }).required(),
    value:joi.number().allow(null).required()
});

const tickerMonitorEntrySchema = joi.object({
    id:joi.number().integer().required(),
    name:joi.string().required(),
    enabled:joi.boolean().required(),
    any:joi.boolean().required(),
    status:joi.object({
        value:joi.string().required().valid(['active','inactive','unknown','invalid']),
        timestamp:joi.number()
    }).required(),
    conditions:joi.array().items(tickerMonitorConditionSchema).required(),
    pushover:joi.object({
        enabled:joi.boolean().required(),
        priority:joi.when('enabled', {is:true, then:joi.string().valid(['lowest','low','normal','high','emergency']).required(), otherwise:joi.forbidden()}),
        minDelay:joi.when('enabled', {is:true, then:joi.number().integer().positive().required(), otherwise:joi.forbidden()})
    })
});

const validateCondition = (services, entry, condition, conditionIndex, entryIndex) => {
    // check origin & field
    if ('exchange' == condition.origin.type)
    {
        // if exchange is not supported, status should be invalid
        if (!MochaHelper.checkExchange(condition.origin.id, ['wsTickers']))
        {
            if ('invalid' != condition.status.value)
            {
                Assert.fail(`'body[${entryIndex}][conditions][${conditionIndex}][status][value]' should be 'invalid' (exchange '${condition.origin.id}' is not supported anymore)`, entry);
            }
        }
        if (-1 == EXCHANGE_FIELDS.indexOf(condition.condition.field))
        {
            Assert.fail(`Value '${condition.condition.field}' for 'body[${entryIndex}][conditions][${conditionIndex}][condition][field]' is not valid`, entry);
        }
    }
    else
    {
        // if service is not supported, status should be invalid
        if (!MochaHelper.checkService(condition.origin.id))
        {
            if ('invalid' != condition.status.value)
            {
                Assert.fail(`'body[${entryIndex}][conditions][${conditionIndex}][status][value]' should be 'invalid' (service '${condition.origin.id}' is not supported anymore)`, entry);
            }
        }
        if (-1 == SERVICES_FIELDS[condition.origin.id].indexOf(condition.condition.field))
        {
            Assert.fail(`Value '${condition.condition.field}' for 'body[${entryIndex}][conditions][${conditionIndex}][condition][field]' is not valid`, entry);
        }
    }
    // check operator & value
    if (undefined === OPERATORS[condition.condition.operator])
    {
        Assert.fail(`Value '${condition.condition.operator}' for 'body[${entryIndex}][conditions][${conditionIndex}][condition][operator]' is not valid`, entry);
    }
    // value must be an array
    if (OPERATORS[condition.condition.operator])
    {
        if (!Array.isArray(condition.condition.value))
        {
            Assert.fail(`'body[${entryIndex}][conditions][${conditionIndex}][condition][value]' should be an array (operator = '${condition.condition.operator}')`, entry);
        }
    }
    // value must be a float
    else
    {
        if ('number' != typeof condition.condition.value)
        {
            Assert.fail(`'body[${entryIndex}][conditions][${conditionIndex}][condition][value]' should be a float (operator = '${condition.condition.operator}')`, entry);
        }
    }
}

const validateEntry = (services, entry, entryIndex) => {
    let hasInvalidCondition = false;
    _.forEach(entry.conditions, (c, index) => {
        validateCondition(services, entry, c, index, entryIndex);
        if ('invalid' == c.status.value)
        {
            hasInvalidCondition = true;
        }
    });
    // ensure entry state is also invalid if one condition is invalid
    if (hasInvalidCondition)
    {
        if ('invalid' != entry.status.value)
        {
            Assert.fail(`'body[${entryIndex}][status][value]' should be 'invalid' because at least one condition is invalid`, entry);
        }
    }
}

const validateEntries = (services, entries) => {
    _.forEach(entries, (entry, index) => {
        validateEntry(services, entry, index);
    });
}

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

MochaHelper.prepare(() => {

    MochaHelper.createSuite('/tickerMonitor', (services) => {

        // first we remove any existing alert
        before((done) => {
            restClient.makeRequest('GET', `/tickerMonitor`, {name:ALERT_NAME}).then((result) => {
                if (0 == result.body.length)
                {
                    done();
                    return;
                }
                let list = [];
                _.forEach(result.body, (e) => {
                    list.push(e.id);
                });
                restClient.makeRequest('DELETE', `/tickerMonitor`, {list:list}, true).then((result) => {
                    done();
                }).catch((e) => {
                    done(e);
                });
            }).catch((e) => {
                done(e);
            });
        });

        //-- list existing sessions
        MochaHelper.describe('GET', '/tickerMonitor', function(method, path, params){
            it(`it should list existing entries and entry '${ALERT_NAME}' should not be in the list`, (done) => {
                const schema = joi.array().items(tickerMonitorEntrySchema);
                restClient.makeRequest(method, path, params, true).then((result) => {
                    Assert.validateResult(result, schema);
                    validateEntries(services, result.body);
                    if (undefined !== result.body[ALERT_NAME])
                    {
                        Assert.fail(`Entry '${ALERT_NAME}' should not be in the list`, result.body);
                    }
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        });

        let exchange;

        //-- creates invalid entries

        // alert without condition
        MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
            it("it should fail with a 400 error (GatewayError.InvalidRequest.MissingParameters) when 'conditions' parameter is missing", (done) => {
                restClient.makeRequest(method, path, params, true).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.MissingParameters'});
                    done();
                }).catch((e) => {
                    done(e);
                });

            });
        }, {name:ALERT_NAME, enabled:true, any:true});

        // alert with empty conditions
        MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
            it("it should fail with a 400 error (GatewayError.InvalidRequest.InvalidParameter) when 'conditions' parameter is an empty array", (done) => {
                restClient.makeRequest(method, path, params, true).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.InvalidParameter'});
                    done();
                }).catch((e) => {
                    done(e);
                });

            });
        }, {name:ALERT_NAME, enabled:true, any:true, conditions:[]});

        // condition with coinmarketcap while coinmarketcap is disabled
        if (undefined === services.others['coinmarketcap'])
        {
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedService) when using CoinMarketCap while it's disabled", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedService'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });

                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'service', id:'coinmarketcap'},
                        condition:{symbol:'BTC',field:'price_usd',operator:'gt',value:50000}
                    }
                ]
            });
        }

        // condition for an exchange which does not exist
        MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
            it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchange) when using an exchange which does not exist", (done) => {
                restClient.makeRequest(method, path, params, true).then((result) => {
                    Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchange'});
                    done();
                }).catch((e) => {
                    done(e);
                });

            });
        }, {
            name:ALERT_NAME,
            enabled:true,
            any:true,
            conditions:[
                {
                    origin:{type:'exchange', id:'invalidExchange'},
                    condition:{pair:'USDT-BTC',field:'buy',operator:'gt',value:50000}
                }
            ]
        });

        // exchange which does not support wsTickers
        exchange = MochaHelper.getExchangeWithoutFeatures(['wsTickers']);
        if (null !== exchange)
        {
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature) when using an exchange which does not support 'wsTickers'", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });

                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'exchange', id:exchange},
                        condition:{pair:'USDT-BTC',field:'buy',operator:'gt',value:50000}
                    }
                ]
            });
        }

        exchange = MochaHelper.getExchangeWithFeatures(['wsTickers']);

        if (null !== exchange)
        {
            // unsupported pair
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair) when using an invalid pair", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });

                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'exchange', id:exchange},
                        condition:{pair:'INVALID-PAIR',field:'buy',operator:'gt',value:50000}
                    }
                ]
            });

            // unsupported pair
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair) when using an invalid pair", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });

                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'exchange', id:exchange},
                        condition:{pair:'INVALID-PAIR',field:'buy',operator:'gt',value:50000}
                    }
                ]
            });

            const supportedPair = getSupportedPairSymbolForExchange(exchange);

            // use float value instead of float[] with 'in' operator
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.InvalidParameter) when using an invalid type for condition value", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.InvalidParameter'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'exchange', id:exchange},
                        condition:{pair:supportedPair,field:'buy',operator:'in',value:50000}
                    }
                ]
            });

            // use float[] value instead of float with 'gt' operator
            MochaHelper.describe('POST', '/tickerMonitor', function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.InvalidParameter) when using an invalid type for condition value", (done) => {
                    restClient.makeRequest(method, path, params, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.InvalidParameter'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            }, {
                name:ALERT_NAME,
                enabled:true,
                any:true,
                conditions:[
                    {
                        origin:{type:'exchange', id:exchange},
                        condition:{pair:supportedPair,field:'buy',operator:'gt',value:[50000]}
                    }
                ]
            });

            // valid conditions
            let conditions = [
                {
                    origin:{type:'exchange', id:exchange},
                    condition:{pair:supportedPair,field:'buy',operator:'gt',value:'xxxx'}
                },
                {
                    origin:{type:'exchange', id:exchange},
                    condition:{pair:supportedPair,field:'sell',operator:'lt',value:'yyyy'}
                },
            ];
            let entryId;
            MochaHelper.describe('POST', {
                path:'/tickerMonitor',
                params:JSON.stringify({
                    name:ALERT_NAME,
                    enabled:true,
                    any:false,
                    conditions:conditions
                })
            }, function(method, path, params){
                it(`it should create a new entry '${ALERT_NAME}'`, (done) => {
                    // retrieve tickers
                    restClient.makeRequest('GET', `/exchanges/${exchange}/tickers/${supportedPair}`).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:200});
                        // update conditions based on ticker value
                        conditions[0].condition.value = result.body[supportedPair].buy / 1.10;
                        conditions[1].condition.value = result.body[supportedPair].sell * 1.10;
                        restClient.makeRequest(method, path, {name:ALERT_NAME, enabled:true, any:false, conditions:conditions}, true).then((result) => {
                            entryId = result.body.id;
                            done();
                        });
                    }).catch((e) => {
                        done(e);
                    });
                });
                let entry;
                it(`it should be possible to retrieve entry using its id`, (done) => {
                    const schema = tickerMonitorEntrySchema;
                    // retrieve tickers
                    restClient.makeRequest('GET', `/tickerMonitor/${entryId}`).then((result) => {
                        Assert.validateResult(result, schema);
                        entry = result.body;
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });

                // entry should contain correct conditions
                it(`entry should have expected conditions`, (done) => {
                    if (entry.conditions.length != conditions.length)
                    {
                        Assert.fail(`it should have exactly ${conditions.length} conditions`, result.body);
                    }
                    _.forEach(entry.conditions, (c, index) => {
                        if (c.origin.id != conditions[index].origin.id)
                        {
                            Assert.fail(`conditions[${index}][origin][id] should be '${conditions[index].origin.id}'`, result.body);
                        }
                        if (c.condition.operator != conditions[index].condition.operator)
                        {
                            Assert.fail(`conditions[${index}][condition][operator] should be '${conditions[index].condition.operator}'`, result.body);
                        }
                        if (c.condition.value != conditions[index].condition.value)
                        {
                            Assert.fail(`conditions[${index}][condition][value] should be ${conditions[index].condition.value}`, result.body);
                        }
                    });
                    done();
                });
            });

            // retrieve entry and wait until it becomes active
            let maxDelayBeforeActive = 3 * services.others['tickerMonitor'].cfg.delay;
            describe(`GET /tickerMonitor/xxxx and wait for entry to become active (please be patient, shouldn't be longer than ${maxDelayBeforeActive}s)`, function(){
                it(`entry should become active`, (done) => {
                    let timeoutTimestamp = Date.now() + maxDelayBeforeActive * 1000;
                    const sendRequest = () => {
                        restClient.makeRequest('GET', `/tickerMonitor/${entryId}`).then((result) => {
                            Assert.validateResult(result, undefined, {httpCode:200});
                            // condition is active
                            if ('active' == result.body.status.value)
                            {
                                done();
                                return;
                            }
                            let timestamp = Date.now();
                            if (timestamp > timeoutTimestamp)
                            {
                                Assert.fail(`entry did not become active before ${maxDelayBeforeActive}s`, result.body);
                            }
                            // try again
                            else
                            {
                                setTimeout(function(){
                                    sendRequest();
                                }, (services.others['tickerMonitor'].cfg.delay / 2) * 1000);
                            }
                        }).catch((e) => {
                            done(e);
                        });
                    }
                    sendRequest();
                });
            });

            // update conditions : using empty conditions should trigger an error
            MochaHelper.describe('PATCH', {
                path:'/tickerMonitor/xxxx',
                params:JSON.stringify({
                    conditions:[]
                })
            }, function(method, path, params){
                it("it should fail with a 400 error (GatewayError.InvalidRequest.InvalidParameter) when updating entry with empty conditions", (done) => {
                    restClient.makeRequest('PATCH', `/tickerMonitor/${entryId}`, {conditions:[]}, true).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:400,errorType:'GatewayError.InvalidRequest.InvalidParameter'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            // update conditions (only keep first one) & disable
            MochaHelper.describe('PATCH', {
                path:'/tickerMonitor/xxxx',
                params:JSON.stringify({
                    enabled:false,
                    conditions:[conditions[0]]
                })
            }, function(method, path, params){
                it("it should return an empty result", (done) => {
                    restClient.makeRequest('PATCH', `/tickerMonitor/${entryId}`, {enabled:false, conditions:[conditions[0]]}, true).then((result) => {
                        if (!_.isEmpty(result.body))
                        {
                            Assert.fail('result should be empty');
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
                it("entry should now be disabled, have a single condition & have 'unknown' status", (done) => {
                    restClient.makeRequest('GET', `/tickerMonitor/${entryId}`).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:200});
                        if (result.body.enabled)
                        {
                            Assert.fail('entry should be disabled', result.body);
                        }
                        if (1 != result.body.conditions.length)
                        {
                            Assert.fail(`it should have exactly 1 condition`, result.body);
                        }
                        if (result.body.conditions[0].origin.id != conditions[0].origin.id)
                        {
                            Assert.fail(`conditions[0][origin][id] should be '${conditions[0].origin.id}'`, result.body);
                        }
                        if (result.body.conditions[0].condition.operator != conditions[0].condition.operator)
                        {
                            Assert.fail(`conditions[0][condition][operator] should be '${conditions[0].condition.operator}'`, result.body);
                        }
                        if (result.body.conditions[0].condition.value != conditions[0].condition.value)
                        {
                            Assert.fail(`conditions[0][condition][value] should be ${conditions[0].condition.value}`, result.body);
                        }
                        if ('unknown' != result.body.status.value)
                        {
                            Assert.fail(`entry status should be 'unknown'`, result.body);
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });

            // remove entry
            MochaHelper.describe('DELETE', {
                path:'/tickerMonitor',
                params:JSON.stringify({
                    list:['xxxx']
                })
            }, function(method, path, params){
                it("it should return an empty result", (done) => {
                    restClient.makeRequest('DELETE', `/tickerMonitor`, {list:[entryId]}, true).then((result) => {
                        if (!_.isEmpty(result.body))
                        {
                            Assert.fail('result should be empty');
                        }
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
                it("it should fail with a 404 error (GatewayError.InvalidRequest.ObjectNotFound) when trying to retrieve the deleted entry", (done) => {
                    restClient.makeRequest('GET', `/tickerMonitor/${entryId}`).then((result) => {
                        Assert.validateResult(result, undefined, {httpCode:404, errorType:'GatewayError.InvalidRequest.ObjectNotFound'});
                        done();
                    }).catch((e) => {
                        done(e);
                    });
                });
            });
        }

    }, (services) => {
        // tickerMonitor must be enabled and we must have one of the following services/exchanges enabled :
        // - coinmarketcap
        // - at least one exchange
        return MochaHelper.checkService('tickerMonitor') &&
            (MochaHelper.checkService('coinmarketcap') || Object.keys(services.exchanges).length > 0);
    });

});
