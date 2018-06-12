"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:OKEx');
const logger = require('winston');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const internalConfig = require('../../internal-config');

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 *
 * @param {object} exchange exchange instance
 * @param {object} config full config object
 */
constructor(exchange, config)
{
    let exchangeId = exchange.getId();
    super(exchange, {globalTickersSubscription:true,marketsSubscription:false});
}

}

module.exports = SubscriptionManager;
