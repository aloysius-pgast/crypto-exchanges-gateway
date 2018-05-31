"use strict";
const _ = require('lodash');
const request = require('request');
const debug = require('debug')('CEG:CoinMarketCap');
const Big = require('big.js');
const Errors = require('../errors');
const AbstractServiceClass = require('../abstract-service');
const PromiseHelper = require('../promise-helper');
const Scraper = require('./historical-data-scraper');

const DEFAULT_SOCKETTIMEOUT = 60 * 1000;

// how many entries to retrieve at once
const PAGE_SIZE = 100;

// coinmarketcap API base url
const BASE_URL = 'https://api.coinmarketcap.com/v2'

const fiatCurrencies = {
    "AUD":1,
    "BRL":1,
    "CAD":1,
    "CHF":1,
    "CLP":1,
    "CNY":1,
    "CZK":1,
    "DKK":1,
    "EUR":1,
    "GBP":1,
    "HKD":1,
    "HUF":1,
    "IDR":1,
    "ILS":1,
    "INR":1,
    "JPY":1,
    "KRW":1,
    "MXN":1,
    "MYR":1,
    "NOK":1,
    "NZD":1,
    "PHP":1,
    "PKR":1,
    "PLN":1,
    "RUB":1,
    "SEK":1,
    "SGD":1,
    "THB":1,
    "TRY":1,
    "TWD":1,
    "ZAR":1
};

const serviceId = 'coinmarketcap';
const serviceName = 'Coin Market Cap';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {
    history:{enabled:true}
};

class CoinMarketCap extends AbstractServiceClass
{

constructor(config)
{
    super(serviceId, serviceName, supportedFeatures, false);
    // per symbol/currency USD rate (ie: how much is 1 USD in a given currency)
    this._cachedUSDRates = {
        cachePeriod:360 * 1000,
        cache:{}
    };
    // per-symbols cached tickers
    this._cachedTickers = {
        cachePeriod:360 * 1000,
        cache:{}
    };
    // we should retrieve first page at least every N seconds (N = ${tickers cache period}/2)
    // we cache result of first page since it's likely first 100 symbols are gonna be queried more often (we're all sheep after all)
    this._firstPage = {
        lastTimestamp:0,
        nextTimestamp:0,
        cachePeriod:Math.floor(this._cachedTickers.cachePeriod / 2.0),
        promise:null
    };
    this._cachedSymbols = {
        lastTimestamp:0,
        nextTimestamp:0,
        // cache results for 4H
        cachePeriod:3600 * 4 * 1000,
        promise:null,
        cache:{},
    };
    // one request every 6 seconds
    this._limiterPublic = this._getRateLimiter(1, config.coinmarketcap.throttle.publicApi.minPeriod);
}

/**
 * Indicates whether or not a currency is valid (ie: can be used for conversion)
 *
 * @param {string} currency currency to check (ex: GBP)
 * @return {boolean}
 */
isValidFiatCurrency(currency)
{
    return undefined !== fiatCurrencies[currency];
}

/**
 * Indicates whether or not a symbol exists
 *
 * @param {string} symbol symbol to check (ex: BTC)
 * @return {boolean}
 */
async isValidSymbol(symbol)
{
    await this._refreshCachedSymbols(false);
    return undefined !== this._cachedSymbols.cache[symbol];
}

/**
 * Internal function used to refresh first page
 *
 * @param {boolean} forceRefresh if true page will be refreshed even if it's not expired
 * @return {Promise} which resolves to true on success, false otherwise
 */
async _refreshFirstPage(forceRefresh)
{
    let timestamp = Date.now();
    if (!forceRefresh && timestamp < this._firstPage.nextTimestamp)
    {
        return true;
    }
    if (null === this._firstPage.promise)
    {
        this._firstPage.promise = new Promise((resolve, reject) => {
            this._getTickersPage(1).then((list) => {
                // only update cache if list is not empty
                if (0 != list.length)
                {
                    timestamp = Date.now();
                    this._firstPage.lastTimestamp = timestamp;
                    this._firstPage.nextTimestamp = timestamp + this._firstPage.cachePeriod;
                }
                this._firstPage.promise = null;
                return resolve(true);
            }).catch ((e) => {
                this._firstPage.promise = null;
                this._logError(e, '_refreshFirstPage');
                return resolve(false);
            });
        });
    }
    return this._firstPage.promise;
}

/**
 * Internal function used to update cached symbols
 *
 * @param {boolean} forceRefresh if true cache will be refreshed even if it's not expired
 * @return {Promise} which resolves to true on success, false otherwise
 */
async _refreshCachedSymbols(forceRefresh)
{
    let timestamp = Date.now();
    if (!forceRefresh && timestamp < this._cachedSymbols.nextTimestamp)
    {
        return true;
    }
    if (null === this._cachedSymbols.promise)
    {
        this._cachedSymbols.promise = new Promise((resolve, reject) => {
            this._getSymbols().then((list) => {
                // only update cache if list is not empty
                if (!_.isEmpty(list))
                {
                    timestamp = Date.now();
                    this._cachedSymbols.cache = list;
                    this._cachedSymbols.lastTimestamp = timestamp;
                    this._cachedSymbols.nextTimestamp = timestamp + this._cachedSymbols.cachePeriod;
                }
                this._cachedSymbols.promise = null;
                return resolve(true);
            }).catch ((e) => {
                this._cachedSymbols.promise = null;
                this._logError(e, '_refreshCachedSymbols');
                return resolve(false);
            });
        });
    }
    return this._cachedSymbols.promise;
}

/**
 * Retrieve symbols
 */
/*
Example output

{
    "XRP":{
        "id":52,
        "name":"Ripple",
        "website_slug":"ripple"
    },
    "QRK":{
        "id":53,
        "name":"Quark",
        "website_slug":"quark"
    },
    "ZET":{
        "id":56,
        "name":"Zetacoin",
        "website_slug":"zetacoin"
    },
    "SRC":{
        "id":57,
        "name":"SecureCoin",
        "website_slug":"securecoin"
    }
}
*/
_getSymbols()
{
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let options = {};
            options.json = true;
            options.timeout = DEFAULT_SOCKETTIMEOUT;
            options.method = 'GET';
            options.url = `${BASE_URL}/listings`;
            if (debug.enabled)
            {
                debug('Retrieving symbols');
            }
            request(options, function (error, response, body) {
                if (null !== error)
                {
                    self._logNetworkError(error, '_getSymbols');
                    if (self._isTimeoutError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.RequestTimeout(self.getId(), error));
                    }
                    if (self._isDDosProtectionError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.DDosProtection(self.getId(), error));
                    }
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), error));
                }
                if (200 != response.statusCode)
                {
                    // maybe a wrong url ?
                    self._logNetworkError(response, '_getSymbols');
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), response));
                }
                if (undefined === body.data)
                {
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), "Missing 'data' in response"));
                }
                let list = {};
                _.forEach(body.data, (e) => {
                    list[e.symbol] = {id:e.id,name:e.name,website_slug:e.website_slug}
                });
                return resolve(list);
            });
        });
    });
}

/**
 * Returns available symbols
 *
 * @param {boolean} useCache whether or not cache should be used
 */
/*
Example output

["BTC","LTC","NMC","TRC","PPC","NVC"]

*/
async getSymbols(useCache)
{
    await this._refreshCachedSymbols(!useCache);
    return Object.keys(this._cachedSymbols.cache);
}

/**
* Returns tickers
*
* @param {string[]} opt.symbols used to retrieve tickers for only a list of symbols (optional)
* @param {string[]} opt.convertTo used to convert result to some others symbols/currencies (optional)
* @param {integer} opt.limit used to limit results (optional, default to 100) (will be ignored if opt.symbols is set and is not empty)
* @return {Promise}
*/
async getTickers(opt)
{
    if (undefined === opt)
    {
        opt = {};
    }

    // first ensure we have all symbols
    await this._refreshCachedSymbols(false);

    let list = [];

    if (undefined !== opt.symbols && 0 != opt.symbols.length)
    {
        let symbols = [];
        _.forEach(opt.symbols, (symbol) => {
            // unknown symbol
            if (undefined === this._cachedSymbols.cache[symbol])
            {
                return;
            }
            symbols.push(symbol);
        });
        if (0 != symbols.length)
        {
            await this._refreshFirstPage(false);
            let arr = [];
            _.forEach(symbols, (symbol) => {
                let p = this._getTicker(symbol);
                arr.push({promise:p, context:{api:'_getTicker',symbol:symbol}});
            });
            let data = await PromiseHelper.all(arr);
            _.forEach(data, function (entry) {
                // could not retrieve specific ticker
                if (!entry.success || null === entry.value)
                {
                    return;
                }
                list.push(entry.value);
            });
            // sort by rank
            list = list.sort((a,b) => {
                return a.rank < b.rank ? -1 : 1;
            });
        }
    }
    else
    {
        let limit = PAGE_SIZE;
        if (undefined !== opt.limit)
        {
            limit = opt.limit;
        }
        let pages = Math.ceil(limit / PAGE_SIZE);
        // loop through all pages
        for (let i = 1; i <= pages; ++i)
        {
            let arr;
            try
            {
                arr = await this._getTickersPage(i);
            }
            catch (e)
            {
                if (e instanceof Errors.BaseError)
                {
                    throw e;
                }
                this._logError(e, '_getTickersPage');
                throw new Errors.GatewayError.InternalError();
            }
            _.forEach(arr, (e) => {
                list.push(e);
                if (limit == list.length)
                {
                    return false;
                }
            });
            if (limit == list.length)
            {
                break;
            }
        }
    }
    // do we need to convert ?
    if (0 != list.length && undefined !== opt.convertTo && 0 != opt.convertTo.length && undefined !== this._cachedSymbols.cache['USDT'])
    {
        let arr = [];
        _.forEach(opt.convertTo, (e) => {
            // not a valid currency & not a valid symbol
            if ('BTC' === e || (undefined === fiatCurrencies[e] && undefined === this._cachedSymbols.cache[e]))
            {
                return;
            }
            let p = this._getUSDRate(e);
            arr.push({promise:p, context:{api:'_getUSDRate',symbol:e}});
        });
        let rates = {};
        let data = await PromiseHelper.all(arr);
        _.forEach(data, function (entry) {
            // could not retrieve specific rate
            if (!entry.success || null === entry.value)
            {
                return;
            }
            rates[entry.value.symbol] = entry.value.rate;
        });
        // update list
        if (!_.isEmpty(rates))
        {
            _.forEach(list, (ticker) => {
                _.forEach(rates, (r, symbol) => {
                    let obj = {
                        price:null,
                        volume_24h:null,
                        market_cap:null
                    };
                    if (ticker.symbol == symbol)
                    {
                        obj.price = 1.0;
                        obj.market_cap = ticker.circulating_supply;
                    }
                    else
                    {
                        if (null !== ticker.price_usd)
                        {
                            obj.price = parseFloat(r.times(ticker.price_usd).toFixed(10));
                        }
                        if (null !== ticker.market_cap_usd)
                        {
                            obj.market_cap = parseFloat(r.times(ticker.market_cap_usd).toFixed(9));
                        }
                    }
                    if (null !== ticker.volume_24h_usd)
                    {
                        obj.volume_24h = parseFloat(r.times(ticker.volume_24h_usd).toFixed(9));
                    }
                    ticker.converted[symbol] = obj;
                });
            });
        }
    }

    return list;
}

/**
 * Returns ticker for a single symbol
 *
 * @param {string} symbol ticker symbol
 * @return {Promise} promise which will resolve to a ticker (see _formatTicker) (or null if ticker was not found) or reject a BaseError
 */
async _getTicker(symbol)
{
    let timestamp = Date.now();
    if (undefined !== this._cachedTickers.cache[symbol])
    {
        if (timestamp < this._cachedTickers.cache[symbol].nextTimestamp)
        {
            return this._cachedTickers.cache[symbol].entry;
        }
    }
    let id = this._cachedSymbols.cache[symbol].id;
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let params = {convert:'BTC'};
            let options = {};
            options.json = true;
            options.timeout = DEFAULT_SOCKETTIMEOUT;
            options.method = 'GET';
            options.url = `${BASE_URL}/ticker/${id}`;
            options.qs = params;
            if (debug.enabled)
            {
                debug(`Retrieving ticker for '${symbol}'`);
            }
            request(options, function (error, response, body) {
                if (null !== error)
                {
                    self._logNetworkError(error, '_getTicker');
                    if (self._isTimeoutError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.RequestTimeout(self.getId(), error));
                    }
                    if (self._isDDosProtectionError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.DDosProtection(self.getId(), error));
                    }
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), error));
                }
                if (200 != response.statusCode)
                {
                    // probably an invalid id
                    if (404 == response.statusCode && 'object' === typeof body && null === body.data)
                    {
                        return resolve(null);
                    }
                    // maybe a wrong url ?
                    self._logNetworkError(response, '_getTicker');
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), response));
                }
                if (undefined === body.data)
                {
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), "Missing 'data' in response"));
                }
                let entry = self._formatTicker(body.data);
                // update cache
                timestamp = Date.now();
                self._cachedTickers.cache[symbol] = {
                    entry:entry,
                    lastTimestamp:timestamp,
                    nextTimestamp:timestamp + self._cachedTickers.cachePeriod
                };
                return resolve(entry);
            });
        });
    });
}

/**
 * Retrieves a page of tickers
 *
 * @param {integer} page page to retrieve
 * @return {Promise} Promise which will resolve to an array of tickers (see _formatTicker) or reject a BaseError
 */
_getTickersPage(page)
{
    let start = (page - 1) * PAGE_SIZE + 1;
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let params = {start:start,limit:PAGE_SIZE,convert:'BTC'};
            let options = {};
            options.json = true;
            options.timeout = DEFAULT_SOCKETTIMEOUT;
            options.method = 'GET';
            options.url = `${BASE_URL}/ticker`;
            options.qs = params;
            if (debug.enabled)
            {
                debug(`Retrieving tickers (page ${page})`);
            }
            request(options, function (error, response, body) {
                if (null !== error)
                {
                    self._logNetworkError(error, '_getTickersPage');
                    if (self._isTimeoutError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.RequestTimeout(self.getId(), error));
                    }
                    if (self._isDDosProtectionError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.DDosProtection(self.getId(), error));
                    }
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), error));
                }
                if (200 != response.statusCode)
                {
                    // we probably reached the end of the list
                    if (404 == response.statusCode && 'object' === typeof body && null === body.data)
                    {
                        return resolve([]);
                    }
                    // maybe a wrong url ?
                    self._logNetworkError(response, '_getTickersPage');
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), response));
                }
                if (undefined === body.data)
                {
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), "Missing 'data' in response"));
                }
                let list = [];
                let timestamp = Date.now();
                _.forEach(body.data, (e) => {
                    let entry = self._formatTicker(e);
                    if (1 == page)
                    {
                        self._cachedTickers.cache[entry.symbol] = {
                            entry:entry,
                            lastTimestamp:timestamp,
                            nextTimestamp:timestamp + self._cachedTickers.cachePeriod
                        };
                    }
                    list.push(entry);
                });
                // we need to sort result by rang since CoinMarketCap returns an object and order will be messed up after JSON parsing
                return resolve(list.sort((a,b) => {
                    return a.rank < b.rank ? -1 : 1;
                }));
            });
        });
    });
}

/**
 * Returns USD rate for a single symbol or currency
 *
 * @param {string} symbol ticker symbol
 * @return {Promise} promise which will resolve to an object {symbol:string,rate:Big} (or null if ticker was not found) or reject a BaseError
 */
async _getUSDRate(symbol)
{
    let timestamp = Date.now();
    if (undefined !== this._cachedUSDRates.cache[symbol])
    {
        if (timestamp < this._cachedUSDRates.cache[symbol].nextTimestamp)
        {
            return this._cachedUSDRates.cache[symbol].entry;
        }
    }
    let id = this._cachedSymbols.cache['USDT'].id;
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let params = {convert:symbol};
            let options = {};
            options.json = true;
            options.timeout = DEFAULT_SOCKETTIMEOUT;
            options.method = 'GET';
            options.url = `${BASE_URL}/ticker/${id}`;
            options.qs = params;
            if (debug.enabled)
            {
                debug(`Retrieving USD rate for ${symbol}`);
            }
            request(options, function (error, response, body) {
                if (null !== error)
                {
                    self._logNetworkError(error, '_getUSDRate');
                    if (self._isTimeoutError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.RequestTimeout(self.getId(), error));
                    }
                    if (self._isDDosProtectionError(error))
                    {
                        return reject(new Errors.ServiceError.NetworkError.DDosProtection(self.getId(), error));
                    }
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), error));
                }
                if (200 != response.statusCode)
                {
                    // probably an invalid id
                    if (404 == response.statusCode && 'object' === typeof body && null === body.data)
                    {
                        return resolve(null);
                    }
                    // maybe a wrong url ?
                    self._logNetworkError(response, '_getUSDRate');
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), response));
                }
                if (undefined === body.data)
                {
                    return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), "Missing 'data' in response"));
                }
                // API did not return any price for this symbol
                if (undefined === body.data.quotes[symbol] || null === body.data.quotes[symbol].price)
                {
                    return resolve(null);
                }
                let rate = new Big(body.data.quotes[symbol].price).div(body.data.quotes['USD'].price);
                let entry = {symbol:symbol,rate:rate};
                // update cache
                timestamp = Date.now();
                self._cachedUSDRates.cache[symbol] = {
                    entry:entry,
                    lastTimestamp:timestamp,
                    nextTimestamp:timestamp + self._cachedUSDRates.cachePeriod
                };
                return resolve(entry);
            });
        });
    });
}

/**
 * Formats a ticker entry returned by CoinMarketCap API
 *
 * @param {object} ticker entry
 * @return {object} formatted ticker
 */
/*
Example output :

[
    {
        "name":"Bitcoin",
        "symbol":"BTC",
        "rank":1,
        "circulating_supply":17040337,
        "total_supply":17040337,
        "max_supply":21000000,
        "last_updated":1526639371,
        "price_usd":8143.91,
        "market_cap_usd":138774970898,
        "volume_24h_usd":6003390000,
        "percent_change_1h":-0.01,
        "percent_change_24h":-2.03,
        "percent_change_7d":-6.94,
        "price_btc":1,
        "market_cap_btc":17040337,
        "volume_24h_btc":737163.1071561449
        "converted":{}
    },
    {
        "name":"Ethereum",
        "symbol":"ETH",
        "rank":2,
        "circulating_supply":99509648,
        "total_supply":99509648,
        "max_supply":null,
        "last_updated":1526639358,
        "price_usd":684.101,
        "market_cap_usd":68074649770,
        "volume_24h_usd":2456270000,
        "percent_change_1h":0.03,
        "percent_change_24h":-2.69,
        "percent_change_7d":-2.17,
        "price_btc":0.0840015423,
        "market_cap_btc":8358964,
        "volume_24h_btc":301608.1955719059,
        "converted":{}
    }
]

*/
_formatTicker(e)
{
    let entry = {
        name:e.name,
        symbol:e.symbol,
        rank:e.rank,
        circulating_supply:e.circulating_supply,
        total_supply:e.total_supply,
        max_supply:e.max_supply,
        last_updated:e.last_updated,
        converted:{}
    };
    if (undefined !== e.quotes['USD'])
    {
        entry.price_usd = e.quotes['USD'].price;
        entry.market_cap_usd = e.quotes['USD'].market_cap;
        entry.volume_24h_usd = e.quotes['USD'].volume_24h;
        entry.percent_change_1h = e.quotes['USD'].percent_change_1h;
        entry.percent_change_24h = e.quotes['USD'].percent_change_24h;
        entry.percent_change_7d = e.quotes['USD'].percent_change_7d;
    }
    else
    {
        entry.price_usd = null;
        entry.market_cap_usd = null;
        entry.volume_24h_usd = null;
        entry.percent_change_1h = null;
        entry.percent_change_24h = null;
        entry.percent_change_7d = null;
    }
    if (undefined !== e.quotes['BTC'])
    {
        entry.price_btc = e.quotes['BTC'].price;
        entry.market_cap_btc = e.quotes['BTC'].market_cap;
        entry.volume_24h_btc = e.quotes['BTC'].volume_24h;
    }
    else
    {
        entry.price_btc = null;
        entry.market_cap_btc = null;
        entry.volume_24h_btc = null;
    }
    return entry;
}

/**
 * Returns the list of supported fiat currencies
 *
 * @return {string[]} list of currencies (ex: ["AUD","GBP"])
 */
getFiatCurrencies()
{
    return Object.keys(fiatCurrencies);
}

/**
 * Retrieve data for a given currency
 *
 * @param {string} symbol symbol to retrieve data for
 * @param {boolean} opt.completeHistory whether or not complete history should be retrieved (optional, default = false)
 * @param {string} opt.from start date (yyyy-mm-dd) (optional, default to yesterday - 6 days) (will be ignored if opt.completeHistory is true)
 * @param {string} opt.to to date (yyyy-mm-dd) (optional, default to yesterday) (will be ignored if opt.completeHistory is true)
 * @param {string} opt.sort (asc|desc) (optional, default = desc)
 * @return {Promise}
 */
/*
Example output

[
    {
        "date":"2018-05-17",
        "open":61.9371,
        "high":63.2217,
        "low":57.1824,
        "close":57.8224,
        "volume":96606600,
        "market_cap":4025910000
    },
    {
        "date":"2018-05-16",
        "open":63.0586,
        "high":63.3669,
        "low":59.8824,
        "close":61.849,
        "volume":99496200,
        "market_cap":4098810000
    }
]
*/
async getHistory(symbol, opt)
{
    await this._refreshCachedSymbols(false);
    // symbol does not exist
    if (undefined === this._cachedSymbols.cache[symbol])
    {
        return [];
    }
    let website_slug = this._cachedSymbols.cache[symbol].website_slug;
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let scraper = new Scraper();
            scraper.get(website_slug, opt).then(function(list){
                return resolve(list);
            }).catch(function(e){
                if (e.hasOwnProperty('response'))
                {
                    if (null !== e.error)
                    {
                        self._logNetworkError(e.error, 'getHistory');
                        if (self._isTimeoutError(e.error))
                        {
                            return reject(new Errors.ServiceError.NetworkError.RequestTimeout(self.getId(), e.error));
                        }
                        if (self._isDDosProtectionError(e.error))
                        {
                            return reject(new Errors.ServiceError.NetworkError.DDosProtection(self.getId(), e.error));
                        }
                        return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), e.error));
                    }
                    if (200 != e.response.statusCode)
                    {
                        // maybe a wrong url ?
                        self._logNetworkError(e.response, 'getHistory');
                        return reject(new Errors.ServiceError.NetworkError.UnknownError(self.getId(), e.response));
                    }
                }
                this._logError(e, 'getHistory');
                return reject(new Errors.GatewayError.InternalError());
            });
        });
    });
}

}

module.exports = CoinMarketCap;
