"use strict";
const _ = require('lodash');
const logger = require('winston');
const debug = require('debug')('CEG:TickerCache');
const serviceRegistry = require('./service-registry');

const SID = 'internal.ticker-cache';

// request ticker update every 3min (coinmarketcap API is updated every 5min and result are cached by CoinMarketCap module for 6 min)
const COINMARKETCAP_TICKER_LOOP_PERIOD = 180 * 1000;
// in case of failure, retry after 30s
const COINMARKETCAP_TICKER_LOOP_PERIOD_AFTER_FAILURE = 30 * 1000;

// request ticker update every 5min (marketCap servicer caches results for 15 min)
const MARKET_CAP_TICKER_LOOP_PERIOD = 300 * 1000;
// in case of failure, retry after 30s
const MARKET_CAP_TICKER_LOOP_PERIOD_AFTER_FAILURE = 30 * 1000;

/**
 * Used to cache price results, so that they can be used by various classes after
 */
class TickerCache
{

constructor()
{
    // subscriptions per exchange
    this._exchanges = {}
    // subscriptions per service
    this._services = {}
    // used to provide unique id to clients and track if we need to subscribe/unsubscribe on exchange
    this._nextSubscribeId = 1;
}

/**
 * Returns a new subscribe identifier which can be used in subscribe/unsubscribe
 *
 * @return {integer} new id
 */
getNewSubscribeId()
{
    return this._nextSubscribeId++;
}

/**
 * Returns an object describing exchange subscriptions
 *
 * @param {string} exchangeId exchange identifier
 */
_getExchange(exchangeId)
{
    // initialize subscriptions for this exchange
    if (undefined === this._exchanges[exchangeId])
    {
        let obj = serviceRegistry.getExchange(exchangeId);
        if (null === obj)
        {
            return null;
        }
        let manager = obj.instance.getSubscriptionManager();
        let exchange = {
            manager:manager,
            subscriptions:{
                pairs:{},
                timestamp:null
            },
            cache:{}
        }
        exchange.listener = function(evt){
            // ignore if we don't support this pair
            if (undefined === exchange.subscriptions.pairs[evt.pair])
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Received 'ticker' event from exchange '${evt.exchange}' for pair '${evt.pair}' : ${JSON.stringify(evt.data)}`)
            }
            // cache value
            exchange.cache[evt.pair] = {
                timestamp:Date.now() / 1000.0,
                data:evt.data
            }
        };
        manager.addListener('ticker', exchange.listener);
        this._exchanges[exchangeId] = exchange;
    }
    return this._exchanges[exchangeId];
}

_getCoinMarketCap()
{
    let obj = serviceRegistry.getService('coinmarketcap');
    let service = {
        instance:obj.instance,
        loop:{requestId:0,enabled:false},
        subscriptions:{
            symbols:{},
            timestamp:null
        },
        cache:{}
    }
    return service;
}

_getMarketCap()
{
    let obj = serviceRegistry.getService('marketCap');
    let service = {
        instance:obj.instance,
        loop:{requestId:0,enabled:false},
        subscriptions:{
            symbols:{},
            timestamp:null
        },
        cache:{}
    }
    return service;
}

/**
 * Returns an object describing service subscription
 *
 * @param {string} serviceId exchange identifier
 */
_getService(serviceId)
{
    // initialize subscriptions for this service
    if (undefined === this._services[serviceId])
    {
        let obj = serviceRegistry.getService(serviceId);
        if (null === obj)
        {
            return null;
        }
        switch (serviceId)
        {
            case 'coinmarketcap':
                this._services[serviceId] = this._getCoinMarketCap();
                break;
            case 'marketCap':
                this._services[serviceId] = this._getMarketCap();
                break;
            default:
                return null;
        }
    }
    return this._services[serviceId];
}

/**
 * Initialize subscription for a given symbol
 *
 * @param {integer} subscribeId caller id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeCoinMarketCapSymbol(subscribeId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of subscribeId which have a subscription for current pair
        subscribeId:{}
    }
    obj.subscribeId[subscribeId] = timestamp;
    return obj;
}

/**
 * Initialize subscription for a given symbol
 *
 * @param {integer} subscribeId caller id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeMarketCapSymbol(subscribeId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of subscribeId which have a subscription for current pair
        subscribeId:{}
    }
    obj.subscribeId[subscribeId] = timestamp;
    return obj;
}

/**
 * Initialize subscription for a given pair
 *
 * @param {integer} subscribeId caller id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeExchangePair(subscribeId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of subscribeId which have a subscription for current pair
        subscribeId:{}
    }
    obj.subscribeId[subscribeId] = timestamp;
    return obj;
}

/**
 * Subscribe to ticker for a given pair on a given exchange
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} exchangeId exchange identifier
 * @param {string} pair pair to subscribe to X-Y
 * @return {boolean} true if subscription was performed successfully, false otherwise
 */
subscribeToExchangeTicker(subscribeId, exchangeId, pair)
{
    let exchange = this._getExchange(exchangeId);
    if (null === exchange)
    {
        logger.error(`Exchange '${exchangeId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    if (undefined === exchange.subscriptions.pairs[pair])
    {
        updated = true;
        exchange.subscriptions.pairs[pair] = this._initializeExchangePair(subscribeId, timestamp);
    }
    else
    {
        if (undefined === exchange.subscriptions.pairs[pair].subscribeId[subscribeId])
        {
            exchange.subscriptions.pairs[pair].subscribeId[subscribeId] = timestamp;
        }
    }
    if (updated)
    {
        exchange.subscriptions.timestamp = timestamp;
        exchange.manager.updateTickersSubscriptions(SID, [pair], [], true);
    }
    return true;
}

/**
 * Unsubscribe from tickers for a given pair on a given exchange
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} exchangeId exchange identifier
 * @param {string} pair pair to subscribe to X-Y
 * @return {boolean} true if unsubscription was performed successfully, false otherwise
 */
unsubscribeFromExchangeTicker(subscribeId, exchangeId, pair)
{
    let exchange = this._getExchange(exchangeId);
    if (null === exchange)
    {
        logger.error(`Exchange '${exchangeId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    // no subscription for this pair, do nothing
    if (undefined === exchange.subscriptions.pairs[pair] || undefined === exchange.subscriptions.pairs[pair].subscribeId[subscribeId])
    {
        return true;
    }
    // remove caller id
    delete exchange.subscriptions.pairs[pair].subscribeId[subscribeId];
    // no more subscriptions for this pair, remove it
    if (_.isEmpty(exchange.subscriptions.pairs[pair].subscribeId))
    {
        delete exchange.subscriptions.pairs[pair];
        updated = true;
    }
    if (updated)
    {
        exchange.subscriptions.timestamp = timestamp;
        exchange.manager.updateTickersSubscriptions(SID, [], [pair], true);
    }
    return true;
}

/**
 * Retrieve cached value for a given ticker field of a pair
 *
 * @param {string} exchangeId exchange identifier (ex: binance)
 * @param {string} pair pair to retrieve value for (ex: USDT-BTC)
 * @param {string} field attribute to retrieve value for (ex: last, buy, sell, volume)
 * @param {string} minTimestamp if timestamp of cached value is less than this value, it will be considered as missing (to ensure we don't use data which is too old) (optional)
 * @return {float} value or null if no value exists
 */
getExchangeTickerField(exchangeId, pair, field, minTimestamp)
{
    if (undefined === this._exchanges[exchangeId])
    {
        return null;
    }
    if (undefined === this._exchanges[exchangeId].cache[pair])
    {
        return null;
    }
    if (undefined === this._exchanges[exchangeId].cache[pair].data[field])
    {
        return null;
    }
    // data is too old
    if (undefined !== minTimestamp && this._exchanges[exchangeId].cache[pair].timestamp < minTimestamp)
    {
        logger.warn(`Cached ticker '${exchangeId}[${pair}]' is too old : cachedTimestamp = ${this._exchanges[exchangeId].cache[pair].timestamp}, minTimestamp = ${minTimestamp}`);
        return null;
    }
    return this._exchanges[exchangeId].cache[pair].data[field];
}

/**
 * Retrieve cached data & timestamp for a given pair
 *
 * @param {string} exchangeId exchange identifier (ex: binance)
 * @param {string} pair pair to retrieve value for (ex: USDT-BTC)
 * @return {object} {timestamp:float,data:{}} or null if no data exists
 */
getExchangeTickerData(exchangeId, pair)
{
    if (undefined === this._exchanges[exchangeId])
    {
        return null;
    }
    if (undefined === this._exchanges[exchangeId].cache[pair])
    {
        return null;
    }
    return this._exchanges[exchangeId].cache[pair];
}

_startCoinMarketCapTickerLoop()
{
    if (debug.enabled)
    {
        debug('CoinMarketCap ticker loop will be started');
    }
    let serviceId = 'coinmarketcap';
    let service = this._services[serviceId];
    let requestId = ++service.loop.requestId;
    service.loop.enabled = true;
    service.cache = {};
    let symbols = Object.keys(service.subscriptions.symbols[symbol]);
    const getTicker = function(){
        service.instance.getTickers({symbols:symbols}).then(function(data){
            // loop has been disabled
            if (!service.loop.enabled)
            {
                return;
            }
            // we already have another loop with a distinct requestId
            if (service.loop.requestId > requestId)
            {
                return;
            }
            if (debug.enabled)
            {
                debug('Successfully retrieved coinmarketcap tickers');
            }
            let cache = {};
            _.forEach(data, (entry) => {
                if (undefined === service.subscriptions.symbols[entry.symbol])
                {
                    return;
                }
                if (null === entry.last_updated)
                {
                    return;
                }
                cache[entry.symbol] = {
                    timestamp:entry.last_updated,
                    data:entry
                }
            });
            // replace cache
            service.cache = cache;
            // schedule new retrieval
            setTimeout(function(){
                getTicker();
            }, COINMARKETCAP_TICKER_LOOP_PERIOD);
        }).catch(function(err){
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
            else
            {
                logger.error(`Could not retrieve coinmarketcap tickers : ${JSON.stringify(err)}`);
            }
            // empty cache
            service.cache = {};
            // schedule new retrieval
            setTimeout(function(){
                getTicker();
            }, COINMARKETCAP_TICKER_LOOP_PERIOD_AFTER_FAILURE);
        });
    }
    getTicker();
}

_stopCoinMarketCapTickerLoop()
{
    if (debug.enabled)
    {
        debug('CoinMarketCap ticker loop will be stopped');
    }
    let serviceId = 'coinmarketcap';
    let service = this._services[serviceId];
    // disable loop
    service.loop.enabled = false;
    // empty cache
    service.cache = {};
}

/**
 * Subscribe to coinmarketcap ticker for a given symbol
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} symbol symbol to subscribe to
 * @return {boolean} true if subscription was performed successfully, false otherwise
 */
subscribeToCoinMarketCapTicker(subscribeId, symbol)
{
    let serviceId = 'coinmarketcap';
    let service = this._getService(serviceId);
    if (null === service)
    {
        logger.error(`Service '${serviceId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    if (undefined === service.subscriptions.symbols[symbol])
    {
        updated = true;
        service.subscriptions.symbols[symbol] = this._initializeCoinMarketCapSymbol(subscribeId, timestamp);
    }
    else
    {
        if (undefined === service.subscriptions.symbols[symbol].subscribeId[subscribeId])
        {
            service.subscriptions.symbols[symbol].subscribeId[subscribeId] = timestamp;
        }
    }
    if (updated)
    {
        service.subscriptions.timestamp = timestamp;
        if (!service.loop.enabled)
        {
            this._startCoinMarketCapTickerLoop();
        }
        // only request a single symbol
        else
        {
            let serviceId = 'coinmarketcap';
            let service = this._services[serviceId];
            service.instance.getTickers({symbols:[symbol]}).then(function(data){
                // loop has been disabled
                if (!service.loop.enabled)
                {
                    return;
                }
                // no data ?
                if (0 == data.length)
                {
                    return;
                }
                if (undefined === service.subscriptions.symbols[symbol])
                {
                    return;
                }
                if (null === data[0].last_updated)
                {
                    return;
                }
                service.cache[symbol] = {
                    timestamp:data[0].last_updated,
                    data:data[0]
                }
            }).catch(function(err){
                if (undefined !== err.stack)
                {
                    logger.error(err.stack);
                }
                else
                {
                    logger.error(`Could not retrieve coinmarketcap ticker for '${symbol}' : ${JSON.stringify(err)}`);
                }
            });
        }
    }
    return true;
}

/**
 * Unsubscribe from coinmarketcap tickers for a given symbol
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} symbol symbol to subscribe to
 * @return {boolean} true if unsubscription was performed successfully, false otherwise
 */
unsubscribeFromCoinMarketCapTicker(subscribeId, symbol)
{
    let serviceId = 'coinmarketcap';
    let service = this._getService(serviceId);
    if (null === service)
    {
        logger.error(`Service '${serviceId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    // no subscription for this pair, do nothing
    if (undefined === service.subscriptions.symbols[symbol] || undefined === service.subscriptions.symbols[symbol].subscribeId[subscribeId])
    {
        return true;
    }
    // remove caller id
    delete service.subscriptions.symbols[symbol].subscribeId[subscribeId];
    // no more subscriptions for this pair, remove it
    if (_.isEmpty(service.subscriptions.symbols[symbol].subscribeId))
    {
        delete service.subscriptions.symbols[symbol];
        updated = true;
    }
    if (updated)
    {
        service.subscriptions.timestamp = timestamp;
        // no more subscriptions ? => stop ticker loop
        if (_.isEmpty(service.subscriptions.symbols))
        {
            this._stopCoinMarketCapTickerLoop();
        }
    }
    return true;
}

/**
 * Retrieve cached value for coinmarketcap for a given field
 *
 * @param {string} symbol symbol to retrieve value for (ex: NEO)
 * @param {string} field attribute to retrieve value for (ex: price_usd)
 * @param {string} minTimestamp if timestamp of cached value is less than this value, it will be considered as missing (to ensure we don't use data which is too old) (optional)
 * @return {float} value or null if no value exists
 */
getCoinMarketCapTickerField(symbol, field, minTimestamp)
{
    let serviceId = 'coinmarketcap';
    if (undefined === this._services[serviceId])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol].data[field])
    {
        return null;
    }
    // data is too old
    if (undefined !== minTimestamp && this._services[serviceId].cache[symbol].timestamp < minTimestamp)
    {
        logger.warn(`Cached ticker for '${serviceId}[${symbol}]' is too old : cachedTimestamp = ${this._services[serviceId].cache[symbol].timestamp}, minTimestamp = ${minTimestamp}`);
        return null;
    }
    return this._services[serviceId].cache[symbol].data[field];
}

/**
 * Retrieve cached data & timestamp for a given symbol
 *
 * @param {string} symbol symbol to retrieve value for (ex: NEO)
 * @return {object} {timestamp:float,data:{}} or null if no data exists
 */
getCoinMarketCapTickerData(symbol)
{
    let serviceId = 'coinmarketcap';
    if (undefined === this._services[serviceId])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol])
    {
        return null;
    }
    return this._services[serviceId].cache[symbol];
}

// TODO
_startMarketCapTickerLoop()
{
    if (debug.enabled)
    {
        debug('MarketCap ticker loop will be started');
    }
    let serviceId = 'marketCap';
    let service = this._services[serviceId];
    let requestId = ++service.loop.requestId;
    service.loop.enabled = true;
    service.cache = {};
    let symbols = Object.keys(service.subscriptions.symbols[symbol]);
    const getTicker = function(){
        service.instance.getTickers({symbols:symbols}).then(function(data){
            // loop has been disabled
            if (!service.loop.enabled)
            {
                return;
            }
            // we already have another loop with a distinct requestId
            if (service.loop.requestId > requestId)
            {
                return;
            }
            if (debug.enabled)
            {
                debug('Successfully retrieved marketCap tickers');
            }
            let cache = {};
            _.forEach(data, (entry) => {
                if (undefined === service.subscriptions.symbols[entry.symbol])
                {
                    return;
                }
                if (null === entry.last_updated)
                {
                    return;
                }
                cache[entry.symbol] = {
                    timestamp:entry.last_updated,
                    data:entry
                }
            });
            // replace cache
            service.cache = cache;
            // schedule new retrieval
            setTimeout(function(){
                getTicker();
            }, MARKET_CAP_TICKER_LOOP_PERIOD);
        }).catch(function(err){
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
            else
            {
                logger.error(`Could not retrieve marketCap tickers : ${JSON.stringify(err)}`);
            }
            // empty cache
            service.cache = {};
            // schedule new retrieval
            setTimeout(function(){
                getTicker();
            }, MARKET_CAP_TICKER_LOOP_PERIOD_AFTER_FAILURE);
        });
    }
    getTicker();
}

_stopMarketCapTickerLoop()
{
    if (debug.enabled)
    {
        debug('MarketCap ticker loop will be stopped');
    }
    let serviceId = 'marketCap';
    let service = this._services[serviceId];
    // disable loop
    service.loop.enabled = false;
    // empty cache
    service.cache = {};
}

/**
 * Subscribe to marketCap ticker for a given symbol
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} symbol symbol to subscribe to
 * @return {boolean} true if subscription was performed successfully, false otherwise
 */
subscribeToMarketCapTicker(subscribeId, symbol)
{
    let serviceId = 'marketCap';
    let service = this._getService(serviceId);
    if (null === service)
    {
        logger.error(`Service '${serviceId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    if (undefined === service.subscriptions.symbols[symbol])
    {
        updated = true;
        service.subscriptions.symbols[symbol] = this._initializeMarketCapSymbol(subscribeId, timestamp);
    }
    else
    {
        if (undefined === service.subscriptions.symbols[symbol].subscribeId[subscribeId])
        {
            service.subscriptions.symbols[symbol].subscribeId[subscribeId] = timestamp;
        }
    }
    if (updated)
    {
        service.subscriptions.timestamp = timestamp;
        if (!service.loop.enabled)
        {
            this._startMarketCapTickerLoop();
        }
        // only request a single symbol
        else
        {
            let serviceId = 'marketCap';
            let service = this._services[serviceId];
            service.instance.getTickers({symbols:[symbol]}).then(function(data){
                // loop has been disabled
                if (!service.loop.enabled)
                {
                    return;
                }
                // no data ?
                if (0 == data.length)
                {
                    return;
                }
                if (undefined === service.subscriptions.symbols[symbol])
                {
                    return;
                }
                if (null === data[0].last_updated)
                {
                    return;
                }
                service.cache[symbol] = {
                    timestamp:data[0].last_updated,
                    data:data[0]
                }
            }).catch(function(err){
                if (undefined !== err.stack)
                {
                    logger.error(err.stack);
                }
                else
                {
                    logger.error(`Could not retrieve marketCap ticker for '${symbol}' : ${JSON.stringify(err)}`);
                }
            });
        }
    }
    return true;
}

/**
 * Unsubscribe from marketCap tickers for a given symbol
 *
 * @param {integer} subscribeId unique identifier of the caller
 * @param {string} symbol symbol to subscribe to
 * @return {boolean} true if unsubscription was performed successfully, false otherwise
 */
unsubscribeFromMarketCapTicker(subscribeId, symbol)
{
    let serviceId = 'marketCap';
    let service = this._getService(serviceId);
    if (null === service)
    {
        logger.error(`Service '${serviceId}' does not exist`);
        return false;
    }
    let timestamp = Date.now() / 1000.0;
    let updated = false;
    // no subscription for this pair, do nothing
    if (undefined === service.subscriptions.symbols[symbol] || undefined === service.subscriptions.symbols[symbol].subscribeId[subscribeId])
    {
        return true;
    }
    // remove caller id
    delete service.subscriptions.symbols[symbol].subscribeId[subscribeId];
    // no more subscriptions for this pair, remove it
    if (_.isEmpty(service.subscriptions.symbols[symbol].subscribeId))
    {
        delete service.subscriptions.symbols[symbol];
        updated = true;
    }
    if (updated)
    {
        service.subscriptions.timestamp = timestamp;
        // no more subscriptions ? => stop ticker loop
        if (_.isEmpty(service.subscriptions.symbols))
        {
            this._stopMarketCapTickerLoop();
        }
    }
    return true;
}

/**
 * Retrieve cached value for marketCap for a given field
 *
 * @param {string} symbol symbol to retrieve value for (ex: NEO)
 * @param {string} field attribute to retrieve value for (ex: price_usd)
 * @param {string} minTimestamp if timestamp of cached value is less than this value, it will be considered as missing (to ensure we don't use data which is too old) (optional)
 * @return {float} value or null if no value exists
 */
getMarketCapTickerField(symbol, field, minTimestamp)
{
    let serviceId = 'marketCap';
    if (undefined === this._services[serviceId])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol].data[field])
    {
        return null;
    }
    // data is too old
    if (undefined !== minTimestamp && this._services[serviceId].cache[symbol].timestamp < minTimestamp)
    {
        logger.warn(`Cached ticker for '${serviceId}[${symbol}]' is too old : cachedTimestamp = ${this._services[serviceId].cache[symbol].timestamp}, minTimestamp = ${minTimestamp}`);
        return null;
    }
    return this._services[serviceId].cache[symbol].data[field];
}

/**
 * Retrieve cached data & timestamp for a given symbol
 *
 * @param {string} symbol symbol to retrieve value for (ex: NEO)
 * @return {object} {timestamp:float,data:{}} or null if no data exists
 */
getMarketCapTickerData(symbol)
{
    let serviceId = 'marketCap';
    if (undefined === this._services[serviceId])
    {
        return null;
    }
    if (undefined === this._services[serviceId].cache[symbol])
    {
        return null;
    }
    return this._services[serviceId].cache[symbol];
}

}

let instance = new TickerCache();

module.exports = instance;
