"use strict";

const _ = require('lodash');
const Big = require('big.js');
const logger = require('winston');
const serviceRegistry = require('../../service-registry');
const PromiseHelper = require('../../promise-helper');
const FakeExchangeClass = require('../../fake-exchange');

module.exports = function(app, bodyParsers, config) {

let exchanges = {};
_.forEach(serviceRegistry.getExchanges(), (obj, id) => {
    if (obj.features.balances.enabled)
    {
        // use fakeExchange if demo mode is enabled for exchange
        if (obj.demo)
        {
            exchanges[id] = new FakeExchangeClass(obj.instance);
        }
        else
        {
            exchanges[id] = obj.instance;
        }
    }
});
let coinmarketcap = serviceRegistry.getService('coinmarketcap');
if (null !== coinmarketcap)
{
    coinmarketcap = coinmarketcap.instance;
}

//-- only enable route if we have exchanges with supported feature AND coinmarketcap
if (null === coinmarketcap || _.isEmpty(exchanges))
{
    return;
}

/**
 * @param {string} exchanges list of exchanges to include in the result (optional, all by default)
 */
app.get('/portfolio', (req, res) => {
    let filteredList = [];
    if (undefined !== req.query.exchanges && '' != req.query.exchanges)
    {
        // support both array and comma-separated string
        if (Array.isArray(req.query.exchanges))
        {
            _.forEach(req.query.exchanges, (id) => {
                if (undefined !== exchanges[id])
                {
                    filteredList.push(id);
                }
            });
        }
        else
        {
            let arr = req.query.exchanges.split(',');
            _.forEach(arr, (id) => {
                if (undefined !== exchanges[id])
                {
                    filteredList.push(id);
                }
            });
        }
    }
    // by default query all supported exchanges
    if (0 == filteredList.length)
    {
        filteredList = Object.keys(exchanges);
    }
    let arr = [];
    _.forEach(filteredList, (id) => {
        let p = exchanges[id].balances({outputFormat:'custom'});
        arr.push({promise:p, context:{exchange:id,api:'balances'}});
    });
    let balances = {};
    PromiseHelper.all(arr).then(function(data){
        _.forEach(data, function (entry) {
            // could not retrieve balances for this exchange
            if (!entry.success)
            {
                return;
            }
            _.forEach(entry.value, (e, currency) => {
                if (undefined === balances[currency])
                {
                    balances[currency] = {volume:0, price:0, pricePercent:0.0, unknownPrice:true}
                }
                balances[currency].volume += e.total;
            });
        });
        // get data from coinmarketcap
        coinmarketcap.tickers({}).then(function(data) {
            let tickers = {};
            _.forEach(data, (entry) => {
                // ignore tickers without price
                if (null === entry.price_usd)
                {
                    return;
                }
                // ignore tickers we're not interested in
                if (undefined === balances[entry.symbol])
                {
                    // try to map currency to coinmarketcap symbol
                    switch (entry.symbol)
                    {
                        case 'MIOTA':
                            entry.symbol = 'IOTA';
                            break;
                        default:
                            return;
                    }
                }
                tickers[entry.symbol] = entry.price_usd;
            });
            sendPortfolio(res, balances, tickers);
        }).catch(function(err) {
            res.status(503).send({origin:"remote",error:err});
        });
    });
});

const sendPortfolio = (res, balances, tickers) => {
    let totalPrice = 0;
    // update balances
    _.forEach(balances, (entry, currency) => {
        if (undefined === tickers[currency])
        {
            return;
        }
        entry.unknownPrice = false;
        entry.price = parseFloat(new Big(entry.volume).times(tickers[currency]).toFixed(4));
        totalPrice += entry.price;
    });
    // update %
    _.forEach(balances, (entry, currency) => {
        entry.pricePercent = parseFloat(new Big(100.0 * entry.price).div(totalPrice).toFixed(2));
    });
    res.send({balances:balances,price:parseFloat(totalPrice.toFixed(4))});
}

};
