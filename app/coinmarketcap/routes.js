"use strict";
const util = require('util');
const _ = require('lodash');
const Joi = require('../custom-joi');
const JoiHelper = require('../joi-helper');
const Errors = require('../errors');
const serviceRegistry = require('../service-registry');
const statistics = require('../statistics');

// how many entries to return by default
const DEFAULT_LIMIT = 100;

/**
 * Sends an http error to client
 *
 * @param {string} serviceId exchange identifier
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (serviceId, res, err) => {
    return Errors.sendHttpError(res, err, serviceId);
}

module.exports = function(app, bodyParsers, config) {

if (!config.coinmarketcap.enabled)
{
    return;
}

const CoinMarketCapClass = require('./coinmarketcap');
const coinmarketcap = new CoinMarketCapClass(config);

// we need to clone the features since we're gonna make some changes
let features = _.cloneDeep(coinmarketcap.getFeatures());
// disable history if not enabled in config
if (!config.coinmarketcap.history)
{
    features.history = {enabled:false};
}


// register service
serviceRegistry.registerService(coinmarketcap.getId(), coinmarketcap.getName(), coinmarketcap, features, coinmarketcap.isDemo());

/*
 * Returns tickers for all currencies (or a list of currencies) (any unknown symbol will be ignored)
 */
(function(){
    const schema = Joi.object({
        symbols: Joi.csvArray().items(Joi.string().currency()).single(true),
        limit: Joi.number().integer().positive().default(DEFAULT_LIMIT),
        convertTo:Joi.csvArray().items(Joi.string().currency()).single(true)
    });

    /**
     * Returns tickers for all symbols (or a list of symbols)
     *
     * @param {string[]} symbols comma-separated list of symbols (ex: BTC,ETH)
     * @param {integer} limit returns only the top limit results (optional, default = 100, will be ignored if symbols is set)
     * @param {string[]} convertTo convert to a list of currencies / symbols (optional)
     */
    app.get('/coinmarketcap/tickers', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTickers', false);
            return sendError(coinmarketcap.getId(), res, params.error);
        }
        let opt = {};
        // check convert
        if (undefined !== req.query.convertTo && 0 != params.value.convertTo.length)
        {
            opt.convertTo = params.value.convertTo;
        }
        // check symbols
        if (undefined !== req.query.symbols && 0 != params.value.symbols.length)
        {
            opt.symbols = params.value.symbols;
        }
        else
        {
            opt.limit = params.value.limit;
        }
        coinmarketcap.getTickers(opt).then(function(data) {
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTickers', true);
            return res.send(data);
        }).catch(function(err){
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTickers', false);
            return sendError(coinmarketcap.getId(), res, err);
        });
    });
})();

/*
 * Returns tickers for a single symbol (will return a 404 if symbol does not exist)
 */
(function(){
    const schema = Joi.object({
        symbol: Joi.string().currency().required(),
        convertTo:Joi.csvArray().items(Joi.string().currency()).single(true)
    });

    /**
     * Returns tickers for all currencies (or a list of currencies)
     *
     * @param {string} symbol symbol (ex: BTC)
     * @param {string[]} convertTo convert to a list of currencies / symbols (optional)
     */
    app.get('/coinmarketcap/tickers/:symbol', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTicker', false);
            return sendError(coinmarketcap.getId(), res, params.error);
        }
        let opt = {symbols:[params.value.symbol]};
        // check convert
        if (undefined !== req.query.convertTo && 0 != params.value.convertTo.length)
        {
            opt.convertTo = params.value.convertTo;
        }
        coinmarketcap.getTickers(opt).then(function(data) {
            // no ticker for this symbol
            if (0 == data.length)
            {
                let err = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`Symbol '${params.value.symbol}' does not exist`, {symbol:params.value.symbol});
                statistics.increaseStatistic(coinmarketcap.getId(), 'getTicker', false);
                return sendError(coinmarketcap.getId(), res, err);
            }
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTicker', true);
            return res.send(data[0]);
        }).catch(function(err){
            statistics.increaseStatistic(coinmarketcap.getId(), 'getTicker', false);
            return sendError(coinmarketcap.getId(), res, err);
        });
    });
})();

/*
 * Returns all existing symbols
 */
(function(){
    /**
     * Returns all existing symbols
     */
    app.get('/coinmarketcap/symbols', (req, res) => {
        coinmarketcap.getSymbols(true).then(function(list) {
            statistics.increaseStatistic(coinmarketcap.getId(), 'getSymbols', true);
            return res.send(list);
        }).catch(function(err){
            return sendError(coinmarketcap.getId(), res, err);
        });
    });
})();

/**
 * Returns all existing convert currencies
 */
app.get('/coinmarketcap/fiatCurrencies', (req, res) => {
    return res.send(coinmarketcap.getFiatCurrencies());
});

if (features.history.enabled)
{
    /*
     * Returns history for a given symbol and a given period
     */
    (function(){
        const schema = Joi.object({
            symbol: Joi.string().currency().required(),
            from:Joi.string().regex(/^(19|20)[0-9]{2}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/),
            to:Joi.string().regex(/^(19|20)[0-9]{2}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/),
            completeHistory:Joi.boolean().default(false),
            sort:Joi.string().valid(['asc','desc']).default('desc')
        });

        /**
         * Returns history for a currency
         *
         * @param {string} symbol (ex: BTC)
         * @param {boolean} completeHistory whether or not complete history should be retrieved (optional, default = false)
         * @param {string} from start date (yyyy-mm-dd) (optional, default to yesterday - 6 days) (will be ignored if opt.completeHistory is true)
         * @param {string} to to date (yyyy-mm-dd) (optional, default to yesterday) (will be ignored if opt.completeHistory is true)
         * @param {string} sort (asc|desc) (optional, default = desc)
         */
        app.get('/coinmarketcap/history/:symbol', (req, res) => {
            const params = JoiHelper.validate(schema, req, {params:true,query:true});
            if (null !== params.error)
            {
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', false);
                return sendError(coinmarketcap.getId(), res, params.error);
            }
            let opt = {completeHistory:params.value.completeHistory,sort:params.value.sort};
            if (undefined !== params.value.from)
            {
                opt.from = params.value.from;
            }
            if (undefined !== params.value.to)
            {
                opt.to = params.value.to;
            }
            coinmarketcap.getHistory(params.value.symbol, opt).then(function(data) {
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', true);
                return res.send(data);
            }).catch(function(err){
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', false);
                return sendError(coinmarketcap.getId(), res, err);
            });
        });
    })();

    /*
     * Returns history for a given symbol and a given date
     */
    (function(){
        const schema = Joi.object({
            symbol: Joi.string().currency().required(),
            date:Joi.string().regex(/^(19|20)[0-9]{2}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/).required()
        });

        /**
         * Returns history for a currency
         *
         * @param {string} symbol (ex: BTC)
         * @param {string} date (yyyy-mm-dd)
         */
        app.get('/coinmarketcap/history/:symbol/:date', (req, res) => {
            const params = JoiHelper.validate(schema, req, {params:true,query:true});
            if (null !== params.error)
            {
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', false);
                return sendError(coinmarketcap.getId(), res, params.error);
            }
            let opt = {from:params.value.date,to:params.value.date};
            coinmarketcap.getHistory(params.value.symbol, opt).then(function(data) {
                // no entry for this date
                if (0 == data.length)
                {
                    let err = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`No data for this date`, {date:params.value.date});
                    statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', false);
                    return sendError(coinmarketcap.getId(), res, err);
                }
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', true);
                return res.send(data[0]);
            }).catch(function(err){
                statistics.increaseStatistic(coinmarketcap.getId(), 'getHistory', false);
                return sendError(coinmarketcap.getId(), res, err);
            });
        });
    })();

}

};
