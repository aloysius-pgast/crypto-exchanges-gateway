"use strict";
const _ = require('lodash');
const path = require('path');
const util = require('util');
const fs = require('fs');
const restClient = require('./rest-client').getInstance();
const tracer = require('./tracer');

// whether or not prepare step was executed
let prepareState = {onGoing:false,done:false};
// list of callbacks to execute at the end
let cbList = [];

// list of cached services
let cachedServices = null;

// list of cached pairs
let cachedPairs = {};

// by default use the timeout defined in rest client
let timeout = restClient.getTimeout();

// whether or not callForRequestedExchanges was already called (can only be called once)
let callForRequestedExchangesCalled = false;

// list of symbols we want to try
const defaultPairsSymbols = ['USDT-BTC', 'USDT-ETH', 'USDT-NEO','BTC-GAS', ];

// test config
let config = {};
let configPath = '../config/config.json';
let configFile = path.join(__dirname, configPath);
if (fs.existsSync(configFile))
{
    try
    {
        config = require(configFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", configPath);
        process.exit(1);
    }
}


class MochaHelper
{

    static safeJSONparse(str)
    {
        try
        {
            return JSON.parse(str);
        }
        catch (e)
        {
            return null;
        }
    }

    /**
    * Ensure services & pairs have been loaded before first test
    * @param {function} cb callback to call
    */
    static prepare(cb)
    {
        if (prepareState.done)
        {
            try
            {
                cb();
            }
            catch (e)
            {
                console.log(e.stack);
                process.exit(1);
            }
            return;
        }
        // just add callback to the list
        if (prepareState.onGoing)
        {
            cbList.push(cb);
            return;
        }
        // ensure Mocha has been run with --delay flag
        if ('undefined' === typeof run)
        {
            console.log("Mocha should be run with --delay flag");
            process.exit(1);
        }
        // start preparation
        let enableTrace = false;
        let traceHttpCodes = [];
        if (undefined !== process.env['TRACE'] && '' != process.env['TRACE'])
        {
            // enable traces for all http codes
            if ('ALL' == process.env['TRACE'])
            {
                enableTrace = true;
            }
            // comma-separated list of http codes
            else if (/^([1-9][0-9]{2})(,[1-9][0-9]{2})*$/.test(process.env['TRACE']))
            {
                enableTrace = true;
                traceHttpCodes = _.map(process.env['TRACE'].split(','), (c) => { return parseInt(c)});
            }
            if (enableTrace)
            {
                if (undefined !== process.env['TRACE_DIR'] && '' !=  process.env['TRACE_DIR'])
                {
                    tracer.setRootDir(process.env['TRACE_DIR']);
                }
            }
        }
        if (enableTrace)
        {
            console.log(`Traces will be saved in '${tracer.getDir()}'`);
        }
        console.log('Please wait during initialization...');
        prepareState.onGoing = true;
        cbList.push(cb);
        restClient.getServices().then((services) => {
            if (undefined !== services.extError)
            {
                console.log(`Could not retrieve services`);
                console.log(JSON.stringify(services, null, 4));
                process.exit(1);
            }
            cachedServices = services;

            let exchanges = Object.keys(cachedServices.exchanges);
            if (undefined !== process.env['EXCHANGES'])
            {
                exchanges = [];
                if ('NONE' != process.env['EXCHANGES'])
                {
                    _.forEach(process.env['EXCHANGES'].split(','), (e) => {
                        e = e.trim();
                        if ('' == e)
                        {
                            return;
                        }
                        if (undefined !== cachedServices.exchanges[e])
                        {
                            exchanges.push(e);
                        }
                    });
                }
            }

            let arr = [];
            _.forEach(exchanges, (id) => {
                arr.push(restClient.getPairs(id));
            });
            Promise.all(arr).then((results) => {
                _.forEach(results, (r, index) => {
                    if (undefined !== r.extError)
                    {
                        console.log(`Could not retrieve pairs for exchange '${exchanges[index]}'`);
                        console.log(JSON.stringify(r, null, 4));
                        process.exit(1);
                    }
                    cachedPairs[exchanges[index]] = r;
                });
                prepareState.done = true;
                prepareState.onGoing = false;
                tracer.enable(enableTrace, traceHttpCodes);
                setImmediate(run);
                // run all callbacks
                try
                {
                    _.forEach(cbList, (cb) => {
                        cb();
                    });
                }
                catch (e)
                {
                    console.log(e.stack);
                    process.exit(1);
                }
            }).catch ((e) => {
                console.log(`Could not retrieve pairs : ${e.message}`);
                process.exit(1);
            });
        }).catch((e) => {
            console.log(e.stack);
            console.log(`Gateway does not seem to be reachable on '${restClient.getBaseUri()}' : ${e.message}`);
            process.exit(1);
        });
    }

    /**
    * Returns test config for a given exchange (ie: loaded from JSON file)
    *
    * @param {string} exchangeId exchange identifier
    * @return {object} config
    */
    static getExchangeConfig(exchangeId)
    {
        if (undefined === config.exchanges)
        {
            return {};
        }
        if (undefined === config.exchanges[exchangeId])
        {
            return {};
        }
        return _.cloneDeep(config.exchanges[exchangeId]);
    }

    /**
    * Returns the list of pairs we are supposed to have existing open orders for
    */
    static getOpenOrdersPairs(exchangeId)
    {
        let obj = this.getExchangeConfig(exchangeId);
        if (undefined === obj.openOrders)
        {
            return [];
        }
        return obj.openOrders;
    }

    /**
    * Returns the list of pairs we are supposed to have existing closed orders for
    */
    static getClosedOrdersPairs(exchangeId)
    {
        let obj = this.getExchangeConfig(exchangeId);
        if (undefined === obj.closedOrders)
        {
            return [];
        }
        return obj.closedOrders;
    }

    /**
    * @param {string} method http method
    * @param {string|object} path http path or object {path:string,params:string}
    * @param {function} cb callback
    * @param {object} params request parameter (optional)
    */
    static describe(method, path, cb, params)
    {
        let description = `${method} `;
        let _path;
        if ('string' == typeof path)
        {
            _path = path;
            description += path;
        }
        else
        {
            _path = path.path;
            description += `${path.path} ${path.params}`;
        }
        let _params = {};
        if (undefined !== params && !_.isEmpty(params))
        {
            _params = params;
        }
        if (!_.isEmpty(_params) && 'string' == typeof path)
        {
            description += ` ${JSON.stringify(_params)}`;
        }
        describe(description, function(){
            cb.call(this, method, _path, _params)
        });
    }

    /**
    * Creates a new suite for a given exchange
    *
    * @param {string} exchangeId exchange identifier
    * @param {string} description test description
    * @param {function} cb callback to execute to run test
    * @param {function} shouldRunCb function which should return true|false to indicate whether or not test should be run (optional)
    * @param {boolean} checkDemo whether or not we should indicate that we're using demo mode (optional, default = false)
    */
    static createExchangeSuite(exchangeId, description, cb, shouldRunCb, checkDemo)
    {
        if (undefined === checkDemo)
        {
            checkDemo = false;
        }
        // ensure Mocha has been run with --delay flag
        if ('undefined' === typeof run)
        {
            console.log("Mocha should be run with --delay flag");
            process.exit(1);
        }
        if (null === cachedServices)
        {
            console.log("Method 'prepare' shoud be called first");
            process.exit(1);
        }
        let desc = description;
        // no need to call callback if we already know that exchange does not exist
        let shouldRun = undefined !== cachedServices.exchanges[exchangeId];
        if (shouldRun)
        {
            if (checkDemo && cachedServices.exchanges[exchangeId].demo)
            {
                desc += ' (demo)'
            }
            if (undefined !== shouldRunCb)
            {
                shouldRun = shouldRunCb(cachedServices);
            }
        }
        if (!shouldRun)
        {
            describe(`${desc}`, function(){
                it('it will be skipped because it is not supported by gateway');
            });
        }
        else
        {
            describe(`${desc}`, function(){
                before(function() {
                    tracer.setCurrentSuite(desc);
                });
                this.timeout(timeout);
                cb(cachedServices, cachedPairs[exchangeId]);
            });
        }
    }

    /**
    * Creates a new suite
    *
    * @param {string} description test description
    * @param {function} cb callback to execute to run test
    * @param {function} shouldRunCb function which should return true|false to indicate whether or not test should be run
    */
    static createSuite(description, cb, shouldRunCb)
    {
        // ensure Mocha has been run with --delay flag
        if ('undefined' === typeof run)
        {
            console.log("Mocha should be run with --delay flag");
            process.exit(1);
        }
        if (null === cachedServices)
        {
            console.log("Method 'prepare' shoud be called first");
            process.exit(1);
        }
        let shouldRun = true;
        if (undefined !== shouldRunCb)
        {
            shouldRun = shouldRunCb(cachedServices);
        }
        if (!shouldRun)
        {
            describe(`${description}`, function(){
                it('it will be skipped because it is not supported by gateway');
            });
        }
        else
        {
            describe(`${description}`, function(){
                before(function() {
                    tracer.setCurrentSuite(description);
                });
                this.timeout(timeout);
                cb(cachedServices);
            });
        }
    }

    /**
    * Calls a function for all requested exchanges (can only be called once)
    *
    * @param {function} func function to call for each requested exchanges
    */
    static callForRequestedExchanges(func)
    {
        if (callForRequestedExchangesCalled)
        {
            return;
        }
        callForRequestedExchangesCalled = true;
        let list = [];
        if (undefined !== process.env['EXCHANGES'])
        {
            if ('NONE' == process.env['EXCHANGES'])
            {
                return;
            }
            _.forEach(process.env['EXCHANGES'].split(','), (e) => {
                e = e.trim();
                if ('' == e)
                {
                    return;
                }
                list.push(e);
            });
        }
        if (0 === list.length)
        {
            list = _.uniq(Object.keys(cachedServices.exchanges));
        }
        _.forEach(list.sort(), (e) => {
            func(e);
        });
    }

    /**
    * Checks whether or not features are enabled for an exchange
    *
    * @param {string} exchangeId exchange identifier
    * @param {string[]} features list of features (optional)
    */
    static checkExchange(exchangeId, features)
    {
        if (null === cachedServices)
        {
            console.log("Method 'prepare' shoud be called first");
            process.exit(1);
        }
        if (undefined === cachedServices.exchanges[exchangeId])
        {
            return false;
        }
        let enabled = true;
        if (undefined !== features)
        {
            _.forEach(features, (f) => {
                // at least one feature is not enabled
                if (undefined === cachedServices.exchanges[exchangeId].features[f] || !cachedServices.exchanges[exchangeId].features[f].enabled)
                {
                    enabled = false;
                    return false;
                }
            });
        }
        return enabled;
    }

    /**
    * Checks whether or not features are enabled for a service
    *
    * @param {string} serviceId exchange identifier
    * @param {string[]} features list of features (optional)
    */
    static checkService(serviceId, features)
    {
        if (null === cachedServices)
        {
            console.log("Method 'prepare' shoud be called first");
            process.exit(1);
        }
        if (undefined === cachedServices.others[serviceId])
        {
            return false;
        }
        let enabled = true;
        if (undefined !== features)
        {
            _.forEach(features, (f) => {
                // at least one feature is not enabled
                if (undefined === cachedServices.others[serviceId].features[f] || cachedServices.others[serviceId].features[f].enabled)
                {
                    enabled = false;
                    return false;
                }
            });
        }
        return enabled;
    }

    /**
    * Returns exchange identifier with supported features
    *
    * @param {string[]} features features which should be supported
    * @return {string} exchange identifier or null if not found
    */
    static getExchangeWithFeatures(features)
    {
        let exchangeId = null;
        if (0 == features.length)
        {
            return exchangeId;
        }
        let exchanges = Object.keys(cachedServices.exchanges);
        if (undefined !== process.env['EXCHANGES'])
        {
            if ('NONE' == process.env['EXCHANGES'])
            {
                return null;
            }
            exchanges = [];
            _.forEach(process.env['EXCHANGES'].split(','), (e) => {
                e = e.trim();
                if ('' == e)
                {
                    return;
                }
                if (undefined !== cachedServices.exchanges[e])
                {
                    exchanges.push(e);
                }
            });
            if (0 == exchanges.length)
            {
                return null;
            }
        }

        _.forEach(_.shuffle(exchanges), (id) => {
            exchangeId = id;
            let e = cachedServices.exchanges[id];
            _.forEach(features, (f) => {
                if (undefined === e.features[f] || !e.features[f].enabled)
                {
                    exchangeId = null;
                    return false;
                }
            });
            if (null !== exchangeId)
            {
                return false;
            }
        });
        return exchangeId;
    };

    /**
    * Returns exchange identifier which does not support any of the features in a list
    *
    * @param {string[]} features features which should not be supported
    * @return {string} exchange identifier or null if not found
    */
    static getExchangeWithoutFeatures(features)
    {
        let exchangeId = null;
        _.forEach(_.shuffle(Object.keys(cachedServices.exchanges)), (id) => {
            exchangeId = id;
            let e = cachedServices.exchanges[id];
            _.forEach(features, (f) => {
                if (undefined !== e.features[f] && e.features[f].enabled)
                {
                    exchangeId = null;
                    return false;
                }
            });
            if (null !== exchangeId)
            {
                return false;
            }
        });
        return exchangeId;
    };

    /**
    * Returns the list of cached pairs for a given exchange
    *
    * @param {string} exchangeId exchange identifier
    * @return {object} dictionary of pairs
    */
    static getCachedPairs(exchangeId)
    {
        return cachedPairs[exchangeId];
    }

    /**
    * Returns the list of symbols (ex: USDT-BTC)
    *
    * @param {object} pairs list of pairs returned by exchange
    * @return {string[]} array containing only the symbols
    */
    static getPairsSymbols(pairs)
    {
        return Object.keys(pairs);
    }

    /**
    * Returns random symbols from a list of pairs
    *
    * @param {object} pairs list of pairs returned by exchange
    * @param {integer} opt.count number of random entries to return (optional, default = 1)
    * @param {string[]} opt.include array of symbols to try to always include first (optional)
    * @param {string[]} opt.exclude array of symbols to exclude (optional)
    * @return {string[]} random symbols
    */
    static getRandomPairsSymbols(pairs, opt)
    {
        if (undefined === opt)
        {
            opt = {};
        }
        if (undefined === opt.count || 0 == opt.count)
        {
            opt.count = 1;
        }
        let list = [];
        let includedSymbols = {};
        let symbolsToExclude = {};
        if (undefined !== opt.exclude)
        {
            _.forEach(opt.exclude, (pair) => {
                symbolsToExclude[pair] = true;
            });
        }
        if (undefined !== opt.include)
        {
            _.forEach(opt.include, (pair) => {
                if (undefined !== pairs[pair])
                {
                    includedSymbols[pair] = true;
                    list.push(pair);
                    if (list.length == opt.count)
                    {
                        return false;
                    }
                }
            });
        }
        if (list.length < opt.count)
        {
            let keys = _.shuffle(Object.keys(pairs));
            _.forEach(keys, (k) => {
                // pair already in the list
                if (undefined !== includedSymbols[k])
                {
                    return;
                }
                // pair should not be included
                if (undefined !== symbolsToExclude[k])
                {
                    return;
                }
                list.push(k);
                includedSymbols[k] = true;
                if (list.length == opt.count)
                {
                    return false;
                }
            });
        }
        return list;
    }

    /**
    * Returns the first N symbols supported in a list of pairs
    *
    * @param {object} pairs list of pairs returned by exchange
    * @param {integer} opt.count number of symbols to return (optional, if not set will return all default pairs)
    * @param {string[]} opt.symbols array of symbols to search for (optional)
    * @return {string} first supported symbol (will be null if no symbol was found)
    */
    static getSupportedPairSymbols(pairs, opt)
    {
        let _opt = {count:defaultPairsSymbols.length,symbols:defaultPairsSymbols};
        if (undefined !== opt)
        {
            if (undefined !== opt.count)
            {
                _opt.count = opt.count;
            }
            if (undefined !== opt.symbols)
            {
                _opt.symbols = opt.symbols;
            }
        }
        let symbols = [];
        _.forEach(_opt.symbols, (pair) => {
            if (undefined !== pairs[pair])
            {
                symbols.push(pair);
                if (symbols.length == _opt.count)
                {
                    return false;
                }
            }
        });
        return symbols;
    }

    /**
    * Returns a subset of pairs
    *
    * @param {object} pairs list of pairs returned by exchange
    * @param {string[]} symbols array of symbols
    * @return {object} subset of pairs
    */
    static getPairs(pairs, symbols)
    {
        let list = {};
        _.forEach(symbols, (pair) => {
            if (undefined !== pairs[pair])
            {
                list[pair] = pairs[pair];
            }
        });
        return list;
    }

}

module.exports = MochaHelper;
