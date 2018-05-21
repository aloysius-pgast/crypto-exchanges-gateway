"use strict";
const fs = require('fs');
const path = require('path');
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const pairFinder = require('../../pair-finder');
const Errors = require('../../errors');

/**
 * Sends an http error to client
 *
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (res, err) => {
    return Errors.sendHttpError(res, err);
}

module.exports = function(app, bodyParsers, config) {

let enabledExchanges = [];

// load every enabled exchange
_.forEach(config.exchanges, function (entry, exchangeId) {
    if (undefined === entry.enabled || !entry.enabled)
    {
        return;
    }
    let file = path.join(__dirname, '../../exchanges', entry.type, 'routes.js');
    if (!fs.existsSync(file))
    {
        logger.warn("Exchange '%s' (%s) is enabled in config but file '%s' does not exist (exchange will be disabled)", exchangeId, entry.type, file);
        return;
    }
    enabledExchanges.push(exchangeId);
    // load exchange routes
    require(file)(app, bodyParsers, config, exchangeId);
});

/**
 * List available exchanges
 *
 * @param {string} pair used to list only exchanges containing a given pair (optional)
 * @param {string} currency : retrieve only pairs having a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if pair is set)
 * @param {string} baseCurrency : retrieve only pairs having a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if pair or currency are set)
 */
app.get('/exchanges', (req, res) => {
    let opt = {};
    if (undefined !== req.query.pair && '' != req.query.pair)
    {
        opt.pair = req.query.pair;
    }
    else if (undefined !== req.query.currency && '' != req.query.currency)
    {
        opt.currency = req.query.currency;
    }
    else if (undefined !== req.query.baseCurrency && '' != req.query.baseCurrency)
    {
        opt.baseCurrency = req.query.baseCurrency;
    }
    // return all enabled exchanges
    else
    {
        return res.send(enabledExchanges);
    }
    pairFinder.find(opt).then(function(data) {
        res.send(data);
    }).catch(function(err) {
        return sendError(res, err);
    });
});

};
