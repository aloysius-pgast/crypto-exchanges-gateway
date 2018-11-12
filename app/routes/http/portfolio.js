"use strict";
const _ = require('lodash');
const Big = require('big.js');
const logger = require('winston');
const Errors = require('../../errors');
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
            exchanges[id] = {isDemo:true, instance:new FakeExchangeClass(obj.instance)};
        }
        else
        {
            exchanges[id] = {isDemo:false, instance:obj.instance};
        }
    }
});
let marketCap = serviceRegistry.getService('marketCap');
if (null !== marketCap)
{
    marketCap = marketCap.instance;
}

//-- only enable route if we have exchanges with supported feature AND marketCap
if (null === marketCap || _.isEmpty(exchanges))
{
    return;
}

let fxConverter = serviceRegistry.getService('fxConverter');
if (null !== fxConverter)
{
    fxConverter = fxConverter.instance;
}

const logError = (e, method) => {
    Errors.logError(e, `portfolio|${method}`)
}

/**
 * @param {string} exchanges list of exchanges to include in the result (optional, all by default)
 * @param {string[]} convertTo used to convert result to some others symbols/currencies (optional)
 */
app.get('/portfolio', (req, res) => {
    getPortfolio(req, res).catch((e) => {
        logError(e, 'getPortfolio');
        let extError = new Errors.GatewayError.InternalError();
        return Errors.sendHttpError(res, extError);
    });
});

const getPortfolio = async (req, res) => {
    let data;

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
        if (0 == filteredList.length)
        {
            return res.send({balances:{},price:0,convertedPrice:{}});
        }
    }
    else
    {
        // by default query all supported exchanges
        filteredList = Object.keys(exchanges);
    }
    const convertTo = {};
    if (undefined !== req.query.convertTo && '' != req.query.convertTo)
    {
        const convertCurrencies = [];
        // support both array and comma-separated string
        if (Array.isArray(req.query.convertTo))
        {
            _.forEach(req.query.convertTo, (c) => {
                convertCurrencies.push(c);
            });
        }
        else
        {
            const arr = req.query.convertTo.split(',');
            _.forEach(arr, (c) => {
                convertCurrencies.push(c);
            });
        }
        convertCurrencies.forEach(async (c) => {
            if ('USD' == c)
            {
                return;
            }
            if (null !== fxConverter)
            {
                if (await fxConverter.isValidCurrency(c))
                {
                    convertTo[c] = {currency:c, unknown:false, fiat:true, pair:`USD-${c}`};
                    return;
                }
            }
            if (await marketCap.isValidSymbol(c))
            {
                convertTo[c] = {currency:c, unknown:false, fiat:false};
                return;
            }
            convertTo[c] = {currency:c, unknown:true};
        });
    }

    //-- retrieve all balances
    const arr = [];
    _.forEach(filteredList, (id) => {
        let p;
        if (exchanges[id].isDemo)
        {
            p = getDemoBalances(exchanges[id].instance);
        }
        else
        {
            p = exchanges[id].instance.getBalances();
        }
        arr.push({promise:p, context:{exchange:id,api:'getBalances'}});
    });
    const balances = {};
    try
    {
        data = await PromiseHelper.all(arr);
    }
    catch (e)
    {
        return Errors.sendHttpError(res, e, 'portfolio');
    }
    _.forEach(data, (entry) => {
        // could not retrieve balances for this exchange
        if (!entry.success)
        {
            return;
        }
        _.forEach(entry.value, (e, currency) => {
            if (undefined === balances[currency])
            {
                balances[currency] = {volume:0,price:0,pricePercent:0,convertedPrice:{},unknownPrice:true}
            }
            balances[currency].volume += e.total;
        });
    });

    //-- retrieve tickers from marketCap
    const balancesSymbols = Object.keys(balances);
    const  symbols = [];
    balancesSymbols.forEach((s) => {
        symbols.push(s);
    });
    // add conversion symbols
    _.forEach(convertTo, (c) => {
        if (c.unknown || c.fiat)
        {
            return;
        }
        symbols.push(c.currency);
    });
    const marketCapSymbols = mapExchangeCurrenciesToMarketCapSymbols(symbols);
    let opt = {symbols:marketCapSymbols};
    // get data from marketCap
    try
    {
        data = await marketCap.getTickers(opt);
    }
    catch (e)
    {
        return Errors.sendHttpError(res, e, 'portfolio');
    }
    const marketCapTickers = {};
    data.forEach((t) => {
        // ignore tickers we're not interested in
        if (undefined === balances[t.symbol] && undefined === convertTo[t.symbol])
        {
            t.symbol = mapMarketCapSymbolToExchangeCurrency(t.symbol);
            // ignore symbol which we're not interested in
            if (undefined === balances[t.symbol] && undefined === convertTo[t.symbol])
            {
                return;
            }
        }
        marketCapTickers[t.symbol] = {price_usd:t.price_usd,price_btc:t.price_btc};
    });

    //-- retrieve rates from fxConverter
    const fxPairs = [];
    _.forEach(convertTo, (c) => {
        if (c.unknown || !c.fiat)
        {
            return;
        }
        fxPairs.push(c.pair);
    });
    let fxRates = {};
    if (0 != fxPairs.length)
    {
        try
        {
            fxRates = await fxConverter.getRates({pairs:fxPairs});
        }
        catch (e)
        {
            return Errors.sendHttpError(res, e, 'portfolio');
        }
    }

    return sendPortfolio(res, balances, convertTo, marketCapTickers, fxRates);
}

/**
 * When exchange is in demo mode, only generate balances for symbols in the top 20
 */
let top20TickersPromise = null;
const getTop20Tickers = () => {
    if (null === top20TickersPromise)
    {
        top20TickersPromise = new Promise((resolve, reject) => {
            marketCap.getTickers({limit:20}).then((list) => {
                top20TickersPromise = null;
                return resolve(list);
            }).catch((e) => {
                logError(e, 'getTop20Tickers');
                return resolve([]);
            });
        });
    }
    return top20TickersPromise;
}

const getDemoBalances = async (exchange) => {
    let tickers = await getTop20Tickers();
    if (0 == tickers.length)
    {
        return {};
    }
    let currencies = _.map(tickers, (e) => {return e.symbol});
    return exchange.getBalances(currencies);
}

/**
 * Converts a list of exchanges currencies to marketCap symbols
 *
 * @param {string[]} array of exchanges currencies
 * @return {string[]} array of marketCap symbols
 */
const mapExchangeCurrenciesToMarketCapSymbols = (list) => {
    return _.map(list, (c) => {
        switch (c)
        {
            case 'IOTA':
                return 'MIOTA';
            case 'XRB':
                return 'NANO';
        }
        return c;
    });
}

/**
 * Converts a marketCap symbol to an exchange symbol
 *
 * @param {string} marketCap symbol
 * @return {string[]} exchange symbol
 */
const mapMarketCapSymbolToExchangeCurrency = (symbol) => {
    // try to map currency to marketCap symbol
    switch (symbol)
    {
        case 'MIOTA':
            return 'IOTA';
        case 'NANO':
            return 'XRB';
    }
    return symbol;
}

/**
 * Send portfolio to client
 */
const sendPortfolio = (res, balances, convertTo, marketCapTickers, fxRates) => {
    let totalPriceUSD = 0;
    let totalPriceConverted = {};
    // initialize totalPriceConverted
    _.forEach(convertTo, (c) => {
        if (c.unknown)
        {
            totalPriceConverted[c.currency] = {price:0, unknownPrice:true};
            return;
        }
        totalPriceConverted[c.currency] = {price:0, unknownPrice:false};
    });

    // update USD price in balances + compute total USD price
    _.forEach(balances, (entry, currency) => {
        if (undefined === marketCapTickers[currency])
        {
            return;
        }
        entry.unknownPrice = false;
        // compute USD price
        entry.price = new Big(entry.volume).times(marketCapTickers[currency].price_usd);
        // compute convertedPrice
        _.forEach(convertTo, (c) => {
            if (c.unknown)
            {
                entry.convertedPrice[c.currency] = {price:0, unknownPrice:true};
                return;
            }
            let priceConverted;
            // this is a crypto currency
            if (!c.fiat)
            {
                if (0 == marketCapTickers[c.currency].price_usd)
                {
                    entry.convertedPrice[c.currency] = {price:0, unknownPrice:true};
                    return;
                }
                priceConverted = new Big(entry.price).div(marketCapTickers[c.currency].price_usd);
            }
            // use fxConverter
            else
            {
                priceConverted = new Big(entry.price).div(fxRates[c.pair].rate);
            }
            entry.convertedPrice[c.currency] = {
                price:parseFloat(priceConverted.toFixed(4)),
                unknownPrice:false
            };
            totalPriceConverted[c.currency].price += entry.convertedPrice[c.currency].price;
        });
        // format USD price
        entry.price = parseFloat(entry.price.toFixed(4));
        // format volume
        entry.volume = parseFloat(entry.volume.toFixed(8));
        // update total price
        totalPriceUSD += entry.price;
    });

    // update %
    _.forEach(balances, (entry, currency) => {
        entry.pricePercent = 0;
        if (0 != totalPriceUSD)
        {
            entry.pricePercent = parseFloat(new Big(100.0 * entry.price).div(totalPriceUSD).toFixed(2));
        }
    });

    // format total price & totalPriceConverted
    totalPriceUSD = parseFloat(totalPriceUSD.toFixed(4));
    _.forEach(totalPriceConverted, (e) => {
        if (e.unknownPrice)
        {
            return;
        }
        e.price = parseFloat(e.price.toFixed(8));
    });
    return res.send({balances:balances,price:totalPriceUSD,convertedPrice:totalPriceConverted});
}

};
