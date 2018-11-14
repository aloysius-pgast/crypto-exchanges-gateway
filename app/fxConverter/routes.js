"use strict";
const util = require('util');
const _ = require('lodash');
const Joi = require('../custom-joi');
const JoiHelper = require('../joi-helper');
const Errors = require('../errors');
const serviceRegistry = require('../service-registry');
const statistics = require('../statistics');

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

if (!config.fxConverter.enabled)
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
 * Returns rates for all pairs (or a list of pairs) (any unknown symbol will be ignored)
 */
(function(){
    const schema = Joi.object({
        pairs: Joi.csvArray().items(Joi.string().pair()).single(true)
    });

    /**
     * Returns tickers for all symbols (or a list of symbols)
     *
     * @param {string[]} pairs comma-separated list of pairs (ex: USD-EUR,USD-GBP) (optional, by default all rates will be returned using USD as base currency)
     */
    app.get('/fxConverter/rates', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'getRates', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {useCache:true};
        // check symbols
        if (undefined !== req.query.pairs && 0 != params.value.pairs.length)
        {
            opt.pairs = params.value.pairs;
        }
        client.getRates(opt).then(function(data) {
            statistics.increaseStatistic(client.getId(), 'getRates', true);
            return res.send(data);
        }).catch(function(err){
            statistics.increaseStatistic(client.getId(), 'getRates', false);
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * Returns rate for a single pair (will return a 404 if symbol does not exist)
 */
(function(){
    const schema = Joi.object({
        pair: Joi.string().pair().required()
    });

    /**
     * Returns tickers for a single symbol
     *
     * @param {string} pair (ex: USD-EUR)
     */
    app.get('/fxConverter/rates/:pair', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseStatistic(client.getId(), 'getRate', false);
            return sendError(client.getId(), res, params.error);
        }
        const opt = {useCache:true, pairs:[params.value.pair]};
        client.getRates(opt).then(function(data) {
            // no rate for this pair
            if (undefined === data[params.value.pair])
            {
                let err = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`Pair '${params.value.pair}' does not exist`, {pair:params.value.pair});
                statistics.increaseStatistic(client.getId(), 'getRate', false);
                return sendError(client.getId(), res, err);
            }
            statistics.increaseStatistic(client.getId(), 'getRate', true);
            const result = {};
            result[params.value.pair] = data[params.value.pair];
            return res.send(result);
        }).catch(function(err){
            statistics.increaseStatistic(client.getId(), 'getRate', false);
            return sendError(client.getId(), res, err);
        });
    });
})();

/*
 * Returns all existing currencies
 */
(function(){

    /**
     * Returns all existing currencies
     */
    app.get('/fxConverter/currencies', (req, res) => {
        const opt = {useCache:true};
        client.listCurrencies(opt).then(function(list) {
            statistics.increaseStatistic(client.getId(), 'listCurrencies', true);
            return res.send(list);
        }).catch(function(err){
            return sendError(client.getId(), res, err);
        });
    });
})();

};
