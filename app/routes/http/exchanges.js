"use strict";
const fs = require('fs');
const path = require('path');
const util = require('util');
const _ = require('lodash');
const logger = require('winston');
const pairFinder = require('../../pair-finder');

module.exports = function(app, bodyParser, config) {

let enabledExchanges = [];

// load every enabled exchange (except dummy ones)
let dummyExchanges = [];
_.forEach(config.exchanges, function (entry, exchangeId) {
    if (undefined === entry.enabled || !entry.enabled)
    {
        return;
    }
    if (true === entry.dummy)
    {
        dummyExchanges.push(entry);
        return;
    }
    let file = path.join(__dirname, '../../exchanges', exchangeId, 'routes.js');
    if (!fs.existsSync(file))
    {
        logger.warn(util.format("Exchange '%s' is enabled in config but file '%s' does not exist (exchange will be disabled)", exchangeId, file));
        return;
    }
    enabledExchanges.push(exchangeId);
    // load exchange routes
    require(file)(app, bodyParser, config);
});
// handle dummy exchanges
if (0 != dummyExchanges.length)
{
    _.forEach(dummyExchanges, (entry) => {
        let file = path.join(__dirname, '../../exchanges', 'dummy', 'routes.js');
        if (!fs.existsSync(file))
        {
            logger.warn(util.format("Exchange '%s' is enabled in config but file '%s' does not exist (exchange will be disabled)", entry.id, file));
            return;
        }
        enabledExchanges.push(entry.id);
        // load exchange routes
        require(file)(app, bodyParser, config, entry.id);
    });
}

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
    // return all enable exchanges
    else
    {
        res.send(enabledExchanges);
        return;
    }
    pairFinder.find(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

};
