"use strict";
const fs = require('fs');
const path = require('path');
const util = require('util');
const _ = require('lodash');
const pairFinder = require('../pair-finder');

module.exports = function(app, bodyParser, config) {

let enabledExchanges = [];

// load every enabled exchange
_.forEach(config.exchanges, function (entry, name) {
    if (undefined === entry.enabled || !entry.enabled)
    {
        return;
    }
    enabledExchanges.push(name);
    let file = path.join(__dirname, '../exchanges', name, 'routes.js');
    if (!fs.existsSync(file))
    {
        console.warn(util.format("Exchange '%s' is enabled in config but file '%s' does not exist (exchange will be disabled)", name, file));
        return;
    }
    // load exchange routes
    require(file)(app, bodyParser, config);
});

/**
 * List available exchanges
 *
 * @param {string} pair used to list only exchanges containing a given pair (optional)
 */
app.get('/exchanges', (req, res) => {
    if (undefined === req.query.pair || '' == req.query.pair)
    {
        res.send(enabledExchanges);
        return;
    }
    pairFinder.find(req.query.pair)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

};
