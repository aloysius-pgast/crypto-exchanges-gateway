"use strict";

const Bottleneck = require('bottleneck');
const request = require('request');
const util = require('util');
const _ = require('lodash');

const DEFAULT_SOCKETTIMEOUT = 60 * 1000;
// coinmarketcap API base url
const BASE_URL = 'https://api.coinmarketcap.com/v1'

class CoinMarketCap
{

constructor(config)
{
    this._limiterPublic = new Bottleneck(1, config.coinmarketcap.throttle.publicApi.minPeriod * 1000);
}

/**
* Returns tickers
*
* @param {string} opt.symbols used to retrieve tickers for only a list of symbols (optional)
* @param {string} opt.convert used to convert result to another currency (ie: != usd)
* @param {integer} opt.limit used to limit results
* @return {Promise}
*/
tickers(opt)
{
    let self = this;
    return this._limiterPublic.schedule(function(){
        return new Promise((resolve, reject) => {
            let params = {};
            if (undefined !== opt.convert)
            {
                params['convert'] = opt.convert;
            }
            // no limit if we have a list of symbols
            if (undefined !== opt.symbols && 0 != opt.symbols.length)
            {
                params['limit'] = 0;
            }
            else
            {
                if (undefined !== opt.limit)
                {
                    params['limit'] = opt.limit;
                }
                else
                {
                    params['limit'] = 0;
                }
            }
            let options = {};
            options.json = true;
            options.timeout = DEFAULT_SOCKETTIMEOUT;
            options.method = 'GET';
            options.url = util.format('%s/ticker', BASE_URL);
            options.qs = params;
            request(options, function (error, response, body) {
                if (null !== error)
                {
                    if (undefined !== error.message)
                    {
                        reject({origin:"gateway","error":error.message});
                    }
                    else
                    {
                        reject({origin:"gateway","error":"unknown error"});
                    }
                    return;
                }
                if (200 != response.statusCode)
                {
                    if ('object' == typeof body && undefined !== body.error)
                    {
                        reject({origin:"remote","error":body.error});
                    }
                    else
                    {
                        let err = util.format('%d %s', response.statusCode, response.statusMessage);
                        reject({origin:"remote","error":err});
                    }
                    return;
                }
                // return raw results
                if ('coinmarketcap' == opt.outputFormat)
                {
                    resolve(body);
                    return;
                }
                let list = [];
                let filteredList = {};
                if (undefined !== opt.symbols && 0 !== opt.symbols.length)
                {
                    _.forEach(opt.symbols, function(entry){
                        filteredList[entry] = 1;
                    });
                }
                let mapping = {
                    'price_usd':'price_usd',
                    'price_btc':'price_btc',
                    '24h_volume_usd':'24h_volume_usd',
                    'market_cap_usd':'market_cap_usd',
                    'available_supply':'available_supply',
                    'total_supply':'total_supply',
                    'percent_change_1h':'percent_change_1h',
                    'percent_change_24h':'percent_change_24h',
                    'percent_change_7d':'percent_change_7d'
                }
                if (undefined !== opt.convert)
                {
                    let currency = opt.convert.toLowerCase();
                    mapping['price_converted'] = util.format('price_%s', currency);
                    mapping['24h_volume_converted'] = util.format('24h_volume_%s', currency);
                    mapping['market_cap_converted'] = util.format('market_cap_%s', currency);
                }
                _.forEach(body, function (entry) {
                    if (undefined !== opt.symbols && undefined === filteredList[entry.symbol])
                    {
                        return;
                    }
                    let data = {
                        'id':entry.id,
                        'name':entry.name,
                        'symbol':entry.symbol,
                        'rank':parseInt(entry.rank),
                        'last_updated':parseInt(entry.last_updated),
                        'convert_currency':null,
                        'price_converted':null,
                        '24h_volume_converted':null,
                        'market_cap_converted':null
                    };
                    if (undefined !== opt.convert)
                    {
                        data['convert_currency'] = opt.convert;
                    }
                    _.forEach(mapping, function (remoteKey, resultKey) {
                        if (undefined === entry[remoteKey] || null === entry[remoteKey])
                        {
                            data[resultKey] = null;
                        }
                        else
                        {
                            data[resultKey] = parseFloat(entry[remoteKey]);
                        }
                    });
                    list.push(data);
                });
                resolve(list);
            });
        });
    });
}

}

module.exports = CoinMarketCap;
