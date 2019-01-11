"use strict";

/*
    Implemented using Coin Codex https://coincodex.com/
 */

const _ = require('lodash');
const request = require('request');
const debug = require('debug')('CEG:MarketCap');
const Big = require('big.js');
const logger = require('winston');
const Errors = require('../errors');
const AbstractServiceClass = require('../abstract-service');
const PromiseHelper = require('../promise-helper');

const DEFAULT_SOCKETTIMEOUT = 60 * 1000;

// how often in seconds cached data should be refreshed (15 min)
const REFRESH_PERIOD = 900;

// this single url provides everything we need for both price, price evolution & market cap
const COINS_URL = 'https://coincodex.com/apps/coincodex/cache/all_coins_packed.json';

// in case some symbols are not handled by Coin Codex
const DEFAULT_ALIASES = {
    'IOTA':'IOT',
    'MIOTA':'IOT'
}

const serviceId = 'marketCap';
const serviceName = 'Market Cap';

// list of all possible features (should be enabled by default if supported by class)
const supportedFeatures = {};

class MarketCap extends AbstractServiceClass
{

constructor(config)
{
    super(serviceId, serviceName, supportedFeatures, false);

    this.__cache = {
        lastTimestamp:0,
        nextTimestamp:0,
        cachePeriod:REFRESH_PERIOD * 1000,
        data:{
            bySymbol:{},
            byMarketCap:[],
            // symbol aliases
            aliases:{}
        },
        promise:null
    };
}

/**
 * Internal function used to update cache
 *
 * @param {boolean} forceRefresh if true cache will be refreshed even if it's not expired
 * @return {Promise} which resolves to true on success, false otherwise
 */
async _refreshCache(forceRefresh)
{
    let timestamp = Date.now();
    if (!forceRefresh && timestamp < this.__cache.nextTimestamp)
    {
        return true;
    }
    if (null === this.__cache.promise)
    {
        this.__cache.promise = new Promise((resolve, reject) => {
            this._getRawData().then((rawData) => {
                // only update cache if list is not empty
                if (0 != rawData.data.length)
                {
                    timestamp = Date.now();
                    this._updateCache(rawData);
                    this.__cache.lastTimestamp = timestamp;
                    this.__cache.nextTimestamp = timestamp + this.__cache.cachePeriod;
                }
                this.__cache.promise = null;
                return resolve(true);
            }).catch ((e) => {
                this.__cache.promise = null;
                this._logError(e, '_refreshCache');
                return resolve(false);
            });
        });
    }
    return this.__cache.promise;
}

/**
 * Update cache from Coin Codex data
 *
 * @param {object} rawData data returned by Coin Codex
 */
_updateCache(rawData)
{
    const columns = {
        'symbol':-1,
        'display_symbol':-1,
        'name':-1,
        'last_price_usd':-1,
        'price_change_1H_percent':-1,
        'price_change_1D_percent':-1,
        'price_change_7D_percent':-1,
        'volume_24_usd':-1,
        'supply':-1,
        'last_update':-1
    };
    rawData.columns.forEach((name, index) => {
        if (undefined === columns[name])
        {
            return;
        }
        columns[name] = index;
    });
    // ensure we have all needed columns
    _.forEach(columns, (index, name) => {
        if (-1 == index)
        {
            throw new Errors.ServiceError.NetworkError.UnknownError(this.getId(), `Missing column '${name}' in response`);
        }
    });
    const bySymbol = {};
    const byMarketCap = [];
    const aliases = {};
    rawData.data.forEach((e) => {
        let price = e[columns['last_price_usd']];
        let supply = e[columns['supply']];
        // just ignore coins without price or supply
        if (null === price || null === supply || 0 == supply)
        {
            return;
        }
        let data = {
            symbol:e[columns['display_symbol']],
            name:e[columns['name']],
            circulating_supply:supply,
            price_usd:parseFloat(price.toFixed(4)),
            percent_change_1h:e[columns['price_change_1H_percent']],
            percent_change_1d:e[columns['price_change_1H_percent']],
            percent_change_7d:e[columns['price_change_1D_percent']],
            volume_24h_usd:e[columns['volume_24_usd']]
        }
        let lastUpdated = parseInt(e[columns['last_update']]);
        if (isNaN(lastUpdated))
        {
            logger.warn("Got invalid 'last_update' from Coin Codex for symbol '%s' : value = '%s'", data.symbol, e[columns['last_update']]);
            return;
        }
        data.last_updated = lastUpdated;
        data.market_cap_usd = parseFloat(new Big(price).times(supply).toFixed(4));
        bySymbol[data.symbol] = {internalName:data.name.toLowerCase(), data:data};
        byMarketCap.push({
            symbol:data.symbol,
            market_cap_usd:data.market_cap_usd
        });
        // check if we have an alias
        if (data.symbol != e[columns['symbol']])
        {
            aliases[e[columns['symbol']]] = data.symbol;
        }
    });
    // add default aliases
    _.forEach(DEFAULT_ALIASES, (symbol, alias) => {
        aliases[alias] = symbol;
    });
    // sort by market cap
    byMarketCap.sort((a,b) => {
        if (a.market_cap_usd > b.market_cap_usd)
        {
            return -1;
        }
        return 1;
    });
    // update data with rank
    byMarketCap.forEach((c, index) => {
        bySymbol[c.symbol].data.rank = index + 1;
    });
    // compute price in btc
    if (undefined !== bySymbol['BTC'])
    {
        const btc_price  = bySymbol['BTC'].data.price_usd;
        _.forEach(bySymbol, (c, symbol) => {
            c.data.price_btc = parseFloat(new Big(c.data.price_usd).div(btc_price).toFixed(8));
        });
        bySymbol['BTC'].data.price_btc = 1;
    }
    // update cache
    this.__cache.data.bySymbol = bySymbol;
    this.__cache.data.byMarketCap = byMarketCap;
    this.__cache.data.aliases = aliases;
}

/**
 * Retrieve data from CoinCodex
 */
/*
Example output

{
    "columns":[
        "symbol",
        "display_symbol",
        "name",
        "shortname",
        "last_price_usd",
        "price_change_1H_percent",
        "price_change_1D_percent",
        "price_change_7D_percent",
        "price_change_30D_percent",
        "price_change_90D_percent",
        "price_change_180D_percent",
        "price_change_365D_percent",
        "price_change_YTD_percent",
        "volume_24_usd",
        "display",
        "supply",
        "flags",
        "last_update",
        "ico_end",
        "include_supply"
    ],
    "data":[
        [
            "BTC",
            "BTC",
            "Bitcoin",
            "bitcoin",
            6474.672014242,
            -0.1,
            -0.88,
            1.54,
            -2.13,
            0.65,
            -26.5,
            -11.47,
            -52.91,
            3849580304.7763,
            "true",
            17366225,
            "0",
            "1541705806",
            null,
            "true"
        ],
        [
            "VEN",
            "VET",
            "VeChain",
            "vechain",
            0.828365203,
            -39.33,
            34.25,
            -38.26,
            552.75,
            -44.78,
            -82.75,
            262.63,
            -61.51,
            12256.246040375,
            "true",
            0,
            "",
            "1541705786",
            null,
            "true"
        ]
    ]
},...
*/
_getRawData()
{
    return new Promise((resolve, reject) => {
        let options = {};
        options.json = true;
        options.timeout = DEFAULT_SOCKETTIMEOUT;
        options.method = 'GET';
        // use timestamp to bypass cache
        options.url = COINS_URL + `?t=${Date.now()}`;
        if (debug.enabled)
        {
            debug('Retrieving data');
        }
        request(options, (error, response, body) => {
            if (null !== error)
            {
                this._logNetworkError(error, '_getData');
                if (this._isTimeoutError(error))
                {
                    return reject(new Errors.ServiceError.NetworkError.RequestTimeout(this.getId(), error));
                }
                if (this._isDDosProtectionError(error))
                {
                    return reject(new Errors.ServiceError.NetworkError.DDosProtection(this.getId(), error));
                }
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), error));
            }
            if (200 != response.statusCode)
            {
                // maybe a wrong url ?
                this._logNetworkError(response, '_getData');
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), response));
            }
            if (undefined === body.columns)
            {
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), "Missing 'columns' in response"));
            }
            if (undefined === body.data)
            {
                return reject(new Errors.ServiceError.NetworkError.UnknownError(this.getId(), "Missing 'data' in response"));
            }
            return resolve(body);
        });
    });
}

/**
 * List existing coins
 *
 * If an array is passed for opt.name, coin will be accepted if at least one condition matches
 * If an array is passed for opt.symbol, coin will be accepted if at least one condition matches
 * If multiple filters from [opt.name, opt.symbol] are set, all filters will need to match for coin to be accepted
 *
 * @param {boolean} opt.useCache (optional, default = true)
 * @param {string|string[]} opt.symbol, used to only retrieve coins with a matching symbol. Coin will be accepted if symbol matches exactly (optional)
 * @param {string|string[]} opt.name, used to only retrieve coins with a matching name. Coin will be accepted if part of the name is matched (optional)
 * @param {boolean} opt.includeAliases, if true an entry will be included for coin aliases (optional, default = false)
 * @return {object} {coinX:{symbol:coinX,name:string,aliasFor:string},...}
 */
/*
Example output

{
    "ETH": {
        "symbol": "ETH",
        "name": "Ethereum"
    },
    "NANO": {

        "symbol": "NANO",
        "name": "Nano"
    },
    "XRB": {
        "symbol": "XRB",
        "name": "Nano",
        "aliasFor": "NANO"
    }
}

*/
async listCoins(opt)
{
    let useCache = true;
    let includeAliases = false;
    let nameFilter, symbolFilter;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
        if (true === opt.includeAliases)
        {
            includeAliases = true;
        }
        // prepare 'name' filter
        if (undefined !== opt.name)
        {
            let names = opt.name;
            const arr = [];
            if (!Array.isArray(opt.name))
            {
                names = [opt.name];
            }
            names.forEach((n) => {
                let str = n.trim().toLowerCase();
                if ('' != str)
                {
                    arr.push(str);
                }
            });
            if (0 != arr.length)
            {
                nameFilter = arr;
            }
        }
        // prepare 'symbol' filter
        if (undefined !== opt.symbol)
        {
            let symbols = opt.symbol;
            const arr = [];
            if (!Array.isArray(opt.symbol))
            {
                symbols = [opt.symbol];
            }
            symbols.forEach((s) => {
                let str = s.trim().toUpperCase();
                if ('' != str)
                {
                    arr.push(str);
                }
            });
            if (0 != arr.length)
            {
                symbolFilter = arr;
            }
        }
    }
    await this._refreshCache(!useCache);
    const list = {};
    _.forEach(this.__cache.data.bySymbol, (c, symbol) => {
        // filter by symbol
        if (undefined !== symbolFilter)
        {
            let accept = false;
            _.forEach(symbolFilter, (s) => {
                // exact match
                if (s == symbol)
                {
                    accept = true;
                    return false;
                }
            });
            if (!accept)
            {
                return;
            }
        }
        // filter by name
        if (undefined !== nameFilter)
        {
            let accept = false;
            _.forEach(nameFilter, (n) => {
                // match in the middle of the string
                if (-1 !== c.internalName.indexOf(n))
                {
                    accept = true;
                    return false;
                }
            });
            if (!accept)
            {
                return;
            }
        }
        list[symbol] = {
            symbol:symbol,
            name:c.data.name
        };
    });
    if (includeAliases)
    {
        _.forEach(this.__cache.data.aliases, (symbol, alias) => {
            // filter by symbol
            if (undefined !== symbolFilter)
            {
                let accept = false;
                _.forEach(symbolFilter, (s) => {
                    // exact match
                    if (s == alias)
                    {
                        accept = true;
                        return false;
                    }
                });
                if (!accept)
                {
                    return;
                }
            }
            let coin = this.__cache.data.bySymbol[symbol];
            // filter by name
            if (undefined !== nameFilter)
            {
                let accept = false;
                _.forEach(nameFilter, (n) => {
                    // match in the middle of the string
                    if (-1 !== coin.internalName.indexOf(n))
                    {
                        accept = true;
                        return false;
                    }
                });
                if (!accept)
                {
                    return;
                }
            }
            list[alias] = {
                symbol:alias,
                name:coin.data.name,
                aliasFor:symbol
            };
        });
    }
    return list;
}

/**
 * List existing symbols
 *
 * @param {boolean} opt.useCache (optional, default = true)
 * @param {boolean} opt.includeAliases, if true an entry will be included for coin aliases (optional, default = false)
 * @return {string[]} ['coinX', 'coinY',...]
 */
/*
Example output

[
    "0xBTC",
    "1CR",
    "1ST",
    "1WO",
    "2GIVE",
    "2GO"
]

*/
async listSymbols(opt)
{
    let useCache = true;
    let includeAliases = false;
    let nameFilter, symbolFilter;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
        if (true === opt.includeAliases)
        {
            includeAliases = true;
        }
    }
    await this._refreshCache(!useCache);
    const list = Object.keys(this.__cache.data.bySymbol);
    if (includeAliases)
    {
        _.forEach(this.__cache.data.aliases, (symbol, alias) => {
            list.push(alias);
        });
    }
    list.sort();
    return list;
}

/**
 * List existing aliases
 *
 * @param {boolean} opt.useCache (optional, default = true)
 * @return {object} {'aliasX':'coinX', 'aliasY':'coinY',...}
 */
/*
Example output

{
    "XRB": "NANO",
    "HOT2": "HOT",
    "QSH": "QASH",
    "CM": "CMT"
}

*/
async listAliases(opt)
{
    let useCache = true;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
    }
    await this._refreshCache(!useCache);
    const list = this.__cache.data.aliases;
    return list;
}

/**
 * Indicates whether or not a symbol exists.
 *
 * @param {string} symbol symbol to check (ex: BTC)
 * @return {boolean} true if symbol exists or is an alias, false otherwise
 */
async isValidSymbol(symbol)
{
    await this._refreshCache(false);
    return undefined !== this.__cache.data.bySymbol[symbol] ||
        undefined !== this.__cache.data.aliases[symbol];
}

/**
* Returns tickers
*
* @param {boolean} opt.useCache (optional, default = true)
* @param {string[]} opt.symbols used to retrieve tickers for only a list of symbols (optional)
* @param {integer} opt.limit used to limit results (optional, default to 100) (will be ignored if opt.symbols is set and is not empty)
* @return {object[]}
*/
/*
Example output

NB: if both symbol & alias are defined in opt.symbols, they will be both in result. This means that {rank} can be != than {array_index + 1}

[
    {
        "symbol": "BTC",
        "name": "Bitcoin",
        "circulating_supply": 17366225,
        "price_usd": 6474.672,
        "percent_change_1h": -0.1,
        "percent_change_1d": -0.1,
        "percent_change_7d": -0.88,
        "volume_24h_usd": 3849580304.7763,
        "last_updated": 1541705806,
        "market_cap_usd": 112440611000.5298,
        "rank": 1,
        "price_btc": 1
    },
    {
        "symbol": "ETH",
        "name": "Ethereum",
        "circulating_supply": 103079167,
        "price_usd": 213.8525,
        "percent_change_1h": 0.08,
        "percent_change_1d": 0.08,
        "percent_change_7d": -1.84,
        "volume_24h_usd": 1482222148.0864,
        "last_updated": 1541705806,
        "market_cap_usd": 22043735416.8208,
        "rank": 2,
        "price_btc": 0.03302909
    },
    {
        "symbol": "XRP",
        "name": "Ripple",
        "circulating_supply": 40205508733,
        "price_usd": 0.5035,
        "percent_change_1h": -0.17,
        "percent_change_1d": -0.17,
        "percent_change_7d": -5.06,
        "volume_24h_usd": 583415935.75768,
        "last_updated": 1541705611,
        "market_cap_usd": 20241642205.7317,
        "rank": 3,
        "price_btc": 0.00007776
    }
]

*/
async getTickers(opt)
{
    let useCache = true;
    let limit = 100;
    let symbols;
    if (undefined !== opt)
    {
        if (false === opt.useCache)
        {
            useCache = false;
        }
        if (undefined !== opt.limit)
        {
            limit = opt.limit;
        }
        if (undefined !== opt.symbols)
        {
            const arr = [];
            opt.symbols.forEach((s) => {
                let str = s.trim();
                if ('' != str)
                {
                    arr.push(str)
                }
            });
            if (0 != arr.length)
            {
                symbols = arr;
            }
        }
    }
    await this._refreshCache(!useCache);
    const list = [];
    // if we don't have any symbols, just return first N coins by market cap
    if (undefined === symbols)
    {
        _.forEach(this.__cache.data.byMarketCap, (c) => {
            list.push(this.__cache.data.bySymbol[c.symbol].data);
            if (limit == list.length)
            {
                return false;
            }
        });
    }
    else
    {
        symbols.forEach((s) => {
            if (undefined !== this.__cache.data.bySymbol[s])
            {
                list.push(this.__cache.data.bySymbol[s].data);
                return;
            }
            let symbol = this.__cache.data.aliases[s];
            if (undefined === symbol)
            {
                return;
            }
            let ticker = _.clone(this.__cache.data.bySymbol[symbol].data);
            ticker.symbol = s;
            list.push(ticker);
        });
        // sort by market cap
        list.sort((a, b) => {
            if (a.market_cap_usd > b.market_cap_usd)
            {
                return -1;
            }
            return 1;
        });
    }
    return list;
}

}

module.exports = MarketCap;
