"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../lib/assert');
const MochaHelper = require('../../lib/mocha-helper');
const restClient = require('../../lib/rest-client').getInstance();

const defineForExchange = (exchangeId) => {
    const testPairs = require('./pairs/test');
    const testTickers = require('./tickers/test');
    const testOrderBooks = require('./orderBooks/test');
    const testTrades = require('./trades/test');
    const testKlines = require('./klines/test');
    const testTestOrder = require('./testOrder/test');
    const testOpenOrders = require('./openOrders/test');
    const testClosedOrders = require('./closedOrders/test');
    const testOrders = require('./orders/test');
    const testBalances = require('./balances/test');

    MochaHelper.createSuite(`/exchanges/${exchangeId}`, (services) => {
        testPairs(exchangeId);
        testTickers(exchangeId);
        testOrderBooks(exchangeId);
        testTrades(exchangeId);
        testKlines(exchangeId);
        testOpenOrders(exchangeId);
        testTestOrder(exchangeId);
        testClosedOrders(exchangeId);
        testOrders(exchangeId);
        testBalances(exchangeId);
    }, (services) => {
        return MochaHelper.checkExchange(exchangeId);
    });
}

MochaHelper.prepare(() => {
    MochaHelper.callForRequestedExchanges(defineForExchange);
});
