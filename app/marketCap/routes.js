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

if (!config.marketCap.enabled)
{
    return;
}

const ClientClass = require('./client');
const client = new ClientClass(config);

// we need to clone the features since we're gonna make some changes
let features = _.cloneDeep(client.getFeatures());

// register service
serviceRegistry.registerService(client.getId(), client.getName(), client, features, client.isDemo());

/*
 * Returns tickers for all symbols (or a list of symbols) (any unknown symbol will be ignored)
 */
(function(){
    const schema = Joi.object({
        symbols: Joi.csvArray().items(Joi.string().currency()).single(true),
        limit: Joi.number().integer().positive().default(DEFAULT_LIMIT)
    });

    /**
     * Returns tickers for all symbols (or a list of symbols)
     *
     * @param {string[]} symbols comma-separated list of symbols (ex: BTC,ETH)
     * @param {integer} limit returns only the top limit results (optional, default = 100, will be ignored if symbols is set)
     */
    app.get('/marketCap/tickers', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'getTickers', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {useCache:true};
        // check symbols
        if (undefined !== req.query.symbols && 0 != params.value.symbols.length)
        {
            opt.symbols = params.value.symbols;
        }
        else
        {
            opt.limit = params.value.limit;
        }
        client.getTickers(opt).then(function(data) {
            statistics.increaseStatistic(client.getId(), 'getTickers', true);
            return res.send(data);
        }).catch(function(err){
            statistics.increaseStatistic(client.getId(), 'getTickers', false);
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * Returns tickers for a single symbol (will return a 404 if symbol does not exist)
 */
(function(){
    const schema = Joi.object({
        symbol: Joi.string().currency().required()
    });

    /**
     * Returns tickers for a single symbol
     *
     * @param {string} symbol symbol (ex: BTC)
     */
    app.get('/marketCap/tickers/:symbol', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'getTicker', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {useCache:true, symbols:[params.value.symbol]};
        client.getTickers(opt).then(function(data) {
            // no ticker for this symbol
            if (0 == data.length)
            {
                let err = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`Symbol '${params.value.symbol}' does not exist`, {symbol:params.value.symbol});
                statistics.increaseStatistic(client.getId(), 'getTicker', false);
                return sendError(client.getId(), res, err);
            }
            statistics.increaseStatistic(client.getId(), 'getTicker', true);
            return res.send(data[0]);
        }).catch(function(err){
            statistics.increaseStatistic(client.getId(), 'getTicker', false);
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * List coins
 */
(function(){
    const schema = Joi.object({
        symbols: Joi.csvArray().items(Joi.string().currency()).single(true),
        names: Joi.csvArray().items(Joi.string().currency()).single(true),
        includeAliases:Joi.boolean().default(false)
    });

    /**
     * List coins
     */
    app.get('/marketCap/coins', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'listCoins', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {
            useCache:true,
            includeAliases:params.value.includeAliases,
            symbol:params.value.symbols,
            name:params.value.names
        };
        client.listCoins(opt).then(function(list) {
            statistics.increaseStatistic(client.getId(), 'listCoins', true);
            return res.send(list);
        }).catch(function(err){
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * List symbols
 */
(function(){
    const schema = Joi.object({
        includeAliases:Joi.boolean().default(false)
    });

    /**
     * Returns all existing symbols
     */
    app.get('/marketCap/symbols', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'listSymbols', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {useCache:true, includeAliases:params.value.includeAliases};
        client.listSymbols(opt).then(function(list) {
            statistics.increaseStatistic(client.getId(), 'listSymbols', true);
            return res.send(list);
        }).catch(function(err){
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * Returns all existing aliases
 */
(function(){

    /**
     * Returns all existing symbols
     */
    app.get('/marketCap/aliases', (req, res) => {
        const opt = {useCache:true};
        client.listAliases(opt).then(function(list) {
            statistics.increaseStatistic(client.getId(), 'listAliases', true);
            return res.send(list);
        }).catch(function(err){
            return sendError(client.getId(), res, err);
        });
    });
})();

};
