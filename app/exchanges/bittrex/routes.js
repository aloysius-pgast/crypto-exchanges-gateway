"use strict";
const DefaultRoutes = require('../../routes/http/default-exchange-routes');

module.exports = function(app, bodyParsers, config, exchangeId) {

if (!config.exchanges[exchangeId].enabled)
{
    return;
}

const exchangeName = config.exchanges[exchangeId].name;
const ExchangeClass = require('./exchange');
const exchange = new ExchangeClass(exchangeId, exchangeName, config);

// define supported routes
DefaultRoutes.defineRoutes(app, exchange, bodyParsers);

};
