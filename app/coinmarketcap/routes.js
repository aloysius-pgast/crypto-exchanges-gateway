"use strict";
const util = require('util');
const _ = require('lodash');
const requestHelper = require('../request-helper');
const serviceRegistry = require('../service-registry');

module.exports = function(app, bodyParser, config) {

if (!config.coinmarketcap.enabled)
{
    return;
}

const acceptedConvertCurrencies = {
    "AUD":1,
    "BRL":1,
    "CAD":1,
    "CHF":1,
    "CNY":1,
    "EUR":1,
    "GBP":1,
    "HKD":1,
    "IDR":1,
    "INR":1,
    "JPY":1,
    "KRW":1,
    "MXN":1,
    "RUB":1
};

const CoinMarketCapClass = require('./coinmarketcap');
const coinmarketcap = new CoinMarketCapClass(config);

// register service
serviceRegistry.registerService('coinmarketcap', 'Coin Market Cap', coinmarketcap, {});

/**
 * Returns tickers for all currencies (or a list of currencies)
 *
 * @param {string} outputFormat (custom|coinmarketcap) if value is 'coinmarketcap' result returned by CoinMarketCap will be returned untouched (optional, default = 'custom')
 * @param {string} symbols comma-separated list of symbols (ex: BTC,ETH) (optional, will be ignored if 'outputFormat' is 'coinmarketcap')
 * @param {integer} limit returns only the top limit results (optional)
 * @param {string} convert convert to another currency (optional)
 */
app.get('/coinmarketcap/tickers', (req, res) => {
    let opt = {outputFormat:'custom'};
    if ('coinmarketcap' == req.query.outputFormat)
    {
        opt.outputFormat = 'coinmarketcap';
    }
    // check convert
    if (undefined !== req.query.convert && '' != req.query.convert)
    {
        if (undefined === acceptedConvertCurrencies[req.query.convert])
        {
            res.status(400).send({origin:"gateway",error:util.format("Value '%s' is not supported for parameter 'convert'", req.query.convert)});
            return;
        }
        opt.convert = req.query.convert;
    }
    // limit
    if (undefined !== req.query.limit && '' != req.query.limit)
    {
        let limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0)
        {
            res.status(400).send({origin:"gateway",error:util.format("Parameter 'limit' should be an integer > 0 : value = '%s'", req.query.limit)});
            return;
        }
        opt.limit = limit;
    }
    if ('custom' == opt.outputFormat)
    {
        if (undefined !== req.query.symbols && '' != req.query.symbols)
        {
            // support both array and comma-separated string
            if (Array.isArray(req.query.symbols))
            {
                opt.symbols = req.query.symbols;
            }
            else
            {
                opt.symbols = req.query.symbols.split(',');
            }
        }
    }
    coinmarketcap.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns all existing symbols
 */
app.get('/coinmarketcap/symbols', (req, res) => {
    let opt = {outputFormat:'custom'};
    coinmarketcap.tickers(opt)
        .then(function(data) {
            let list = [];
            _.forEach(data, function (entry) {
                list.push(entry['symbol']);
                return;
            });
            res.send(list.sort());
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns all existing convert currencies
 */
app.get('/coinmarketcap/convertCurrencies', (req, res) => {
    let list = [];
    _.forEach(acceptedConvertCurrencies, function (entry, name) {
        list.push(name);
        return;
    });
    res.send(list.sort());
});

};
