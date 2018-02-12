"use strict";
const util = require('util');
const _ = require('lodash');
const RequestHelper = require('../../request-helper');
const pairFinder = require('../../pair-finder');
const serviceRegistry = require('../../service-registry');
const statistics = require('../../statistics');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

module.exports = function(app, bodyParser, config, exchangeId) {

const exchangeName = config.exchanges[exchangeId].name;
const ExchangeClass = require('./exchange');
const exchange = new ExchangeClass(exchangeId, exchangeName, config);

// features
let features = {
    'tickers':{enabled:true, allPairs:true}, 'wsTickers':{enabled:true},
    'orderBooks':{enabled:true}, 'wsOrderBooks':{enabled:true},
    'pairs':{enabled:true},
    'trades':{enabled:true}, 'wsTrades':{enabled:true},
    'klines':{enabled:false}, 'wsKlines':{enabled:false},
    // disabled by default
    'openOrders':{enabled:false},
    'closedOrders':{enabled:false},
    'balances':{enabled:false}
};

/**
 * Retrieves existing pairs
 * @param {string} currency : used to list pairs with a given currency (ex: ETH in BTC-ETH pair) (optional)
 * @param {string} baseCurrency : used to list pairs with a given base currency (ex: BTC in BTC-ETH pair) (will be ignored if currency is set) (optional)
 */
let getPairs = function(opt){
    return exchange.pairs(opt);
}
pairFinder.register(exchangeId, getPairs);

/**
 * Returns tickers for all pairs (or a list of pairs)
 *
 * @param {string} pairs pairs to retrieve ticker for (optional)
 */
app.get(`/exchanges/${exchangeId}/tickers`, (req, res) => {
    let opt = {}
    if (undefined !== req.query.pairs && '' != req.query.pairs)
    {
        // support both array and comma-separated string
        if (Array.isArray(req.query.pairs))
        {
            opt.pairs = req.query.pairs;
        }
        else
        {
            opt.pairs = req.query.pairs.split(',');
        }
    }
    exchange.tickers(opt)
        .then(function(data) {
            statistics.increaseExchangeStatistic(exchangeId, 'getTickers', true);
            res.send(data);
        })
        .catch(function(err)
        {
            let origin = 'remote';
            if ('client' == err.origin)
            {
                origin = 'gateway';
            }
            statistics.increaseExchangeStatistic(exchangeId, 'getTickers', false);
            res.status(503).send({origin:origin,error:err.error});
        });
});

/**
 * Returns ticker for an existing pair
 *
 * @param {string} pair pair to retrieve ticker for
 */
app.get(`/exchanges/${exchangeId}/tickers/:pair`, (req, res) => {
    let opt = {};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getTickers', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pairs = [req.params.pair];
    exchange.tickers(opt)
        .then(function(data) {
            statistics.increaseExchangeStatistic(exchangeId, 'getTickers', true);
            res.send(data);
        })
        .catch(function(err)
        {
            let origin = 'remote';
            if ('client' == err.origin)
            {
                origin = 'gateway';
            }
            statistics.increaseExchangeStatistic(exchangeId, 'getTickers', false);
            res.status(503).send({origin:origin,error:err.error});
        });
});

 /**
  * Retrieves existing pairs
  * @param {string} pair : used to retrieve only a single pair (ex: BTC-ETH (optional)
  * @param {string} currency : used to list pairs with a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if pair is set)
  * @param {string} baseCurrency : used to list pairs with a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if currency or pair are set)
  */
app.get(`/exchanges/${exchangeId}/pairs`, (req, res) => {
    let opt = {};
    if (undefined !== req.query.pair && '' != req.query.pair)
    {
        opt.pair = req.query.pair;
    }
    else if (undefined != req.query.currency && '' != req.query.currency)
    {
        opt.currency = req.query.currency;
    }
    else if (undefined != req.query.baseCurrency && '' != req.query.baseCurrency)
    {
        opt.baseCurrency = req.query.baseCurrency;
    }
    exchange.pairs(opt)
        .then(function(data) {
            statistics.increaseExchangeStatistic(exchangeId, 'getPairs', true);
            res.send(data);
        })
        .catch(function(err)
        {
            let origin = 'remote';
            if ('client' == err.origin)
            {
                origin = 'gateway';
            }
            statistics.increaseExchangeStatistic(exchangeId, 'getPairs', false);
            res.status(503).send({origin:origin,error:err.error});
        });
});

/**
 * Returns order book for a given pair
 *
 * @param {string} pair pair to retrieve order book for
 */
app.get(`/exchanges/${exchangeId}/orderBooks/:pair`, (req, res) => {
    let opt = {};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getOrderBooks', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pair = req.params.pair;
    exchange.orderBook(opt)
        .then(function(data) {
            statistics.increaseExchangeStatistic(exchangeId, 'getOrderBooks', true);
            res.send(data);
        })
        .catch(function(err)
        {
            let origin = 'remote';
            if ('client' == err.origin)
            {
                origin = 'gateway';
            }
            statistics.increaseExchangeStatistic(exchangeId, 'getOrderBooks', false);
            res.status(503).send({origin:origin,error:err.error});
        });
});

/**
 * Returns last trades for a given pair
 *
 * @param {integer} afterTradeId only retrieve trade with an ID > afterTradeId (optional)
 * @param {string} pair pair to retrieve last trades for
 */
app.get(`/exchanges/${exchangeId}/trades/:pair`, (req, res) => {
    let opt = {};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getTrades', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pair = req.params.pair;
    if (undefined !== req.query.afterTradeId)
    {
        let afterTradeId = parseInt(req.query.afterTradeId);
        if (isNaN(afterTradeId) || afterTradeId <= 0)
        {
            statistics.increaseExchangeStatistic(exchangeId, 'getTrades', false);
            res.status(400).send({origin:"gateway",error:util.format("Parameter 'afterTradeId' should be an integer > 0 : value = '%s'", req.query.afterTradeId)});
            return;
        }
        opt.afterTradeId = afterTradeId;
    }
    exchange.trades(opt)
        .then(function(data) {
            statistics.increaseExchangeStatistic(exchangeId, 'getTrades', true);
            res.send(data);
        })
        .catch(function(err)
        {
            let origin = 'remote';
            if ('client' == err.origin)
            {
                origin = 'gateway';
            }
            statistics.increaseExchangeStatistic(exchangeId, 'getTrades', false);
            res.status(503).send({origin:origin,error:err.error});
        });
});

/**
 * Returns existing subscriptions for current exchange
 */
app.get(`/exchanges/${exchangeId}/subscriptions`, (req, res) => {
    let manager = exchange.getSubscriptionManager();
    let list = manager.getSubscriptions();
    res.send(list);
});

/**
 * Returns established stream connections to exchange
 */
app.get(`/exchanges/${exchangeId}/connections`, (req, res) => {
    let manager = exchange.getSubscriptionManager();
    let list = manager.getConnections();
    res.send(list);
});

// enable private features
features['openOrders'] = {enabled:true, allPairs:true};
features['closedOrders'] = {enabled:true, allPairs:true};
features['balances'] = {enabled:true, allCurrencies:true};

// register exchange
serviceRegistry.registerExchange(exchangeId, exchange.getType(), exchangeName, exchange, features, false);

/**
 * Returns open orders
 *
 * @param {string} pairs pairs to retrieve open orders for (optional)
 */
app.get(`/exchanges/${exchangeId}/openOrders`, (req, res) => {

    let opt = {}
    if (undefined !== req.query.pairs && '' != req.query.pairs)
    {
        // support both array and comma-separated string
        if (Array.isArray(req.query.pairs))
        {
            opt.pairs = req.query.pairs;
        }
        else
        {
            opt.pairs = req.query.pairs.split(',');
        }
    }
    let p = exchange.openOrders(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getOpenOrders', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getOpenOrders', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Returns a single open order
 *
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get(`/exchanges/${exchangeId}/openOrders/:orderNumber`, (req, res) => {
    let opt = {};
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getOpenOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    let p = exchange.openOrders(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getOpenOrder', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getOpenOrder', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Create a new order
 *
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to create order for (expected format depends on 'inputFormat' parameter
 * @param {float} targetRate rate to use for order
 * @param {float} quantity quantity to buy/sell
 */
app.post(`/exchanges/${exchangeId}/openOrders`, bodyParser, (req, res) => {
    let opt = {}
    let value;
    //-- order type
    value = RequestHelper.getParam(req, 'orderType');
    if (undefined === value || '' == value)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'orderType'"});
        return;
    }
    if ('buy' != value && 'sell' != value)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'orderType' is not valid : value = '%s'", value)});
        return;
    }
    opt.orderType = value;
    //-- pair
    value = RequestHelper.getParam(req, 'pair');
    if (undefined === value || '' == value)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'pair'"});
        return;
    }
    opt.pair = value;
    //-- targetRate
    value = RequestHelper.getParam(req, 'targetRate');
    if (undefined === value || '' == value)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'targetRate'"});
        return;
    }
    let targetRate = parseFloat(value);
    if (isNaN(targetRate) || targetRate <= 0)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'targetRate' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.targetRate = targetRate;
    //-- quantity
    value = RequestHelper.getParam(req, 'quantity');
    if (undefined === value || '' == value)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'quantity'"});
        return;
    }
    let quantity = parseFloat(value);
    if (isNaN(quantity) || quantity <= 0)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'quantity' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.quantity = quantity;
    //-- create order
    let p = exchange.addOrder(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Cancels an existing order
 *
 * @param {string} orderNumber unique identifier of the order to cancel
 */
app.delete(`/exchanges/${exchangeId}/openOrders/:orderNumber`, (req, res) => {
    let opt = {}
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'cancelOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    //-- cancel order
    let p = exchange.cancelOrder(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'cancelOrder', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'addOrder', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Returns closed orders
 *
 * @param {string} pairs pairs to retrieve closed orders for (optional)
 */
app.get(`/exchanges/${exchangeId}/closedOrders`, (req, res) => {
    let opt = {};
    if (undefined !== req.query.pairs && '' != req.query.pairs)
    {
        // support both array and comma-separated string
        if (Array.isArray(req.query.pairs))
        {
            opt.pairs = req.query.pairs;
        }
        else
        {
            opt.pairs = req.query.pairs.split(',');
        }
    }
    let p = exchange.closedOrders(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getClosedOrders', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getClosedOrders', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Returns a single closed order
 *
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get(`/exchanges/${exchangeId}/closedOrders/:orderNumber`, (req, res) => {
    let opt = {};
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getClosedOrder', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    let p = exchange.closedOrders(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getClosedOrder', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getClosedOrder', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Retrieves balances
 */
app.get(`/exchanges/${exchangeId}/balances`, (req, res) => {
    let opt = {};
    let p = exchange.balances(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getBalances', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getBalances', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

/**
 * Retrieves balance for a single currency
 *
 * @param {string} currency currency to retrieve balance for
 *
 */
app.get(`/exchanges/${exchangeId}/balances/:currency`, (req, res) => {
    let opt = {};
    if (undefined === req.params.currency || '' == req.params.currency)
    {
        statistics.increaseExchangeStatistic(exchangeId, 'getBalances', false);
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'currency'"});
        return;
    }
    opt.currencies = [req.params.currency];
    let p = exchange.balances(opt);
    p.then(function(data) {
        statistics.increaseExchangeStatistic(exchangeId, 'getBalances', true);
        res.send(data);
    })
    .catch(function(err)
    {
        let origin = 'remote';
        if ('client' == err.origin)
        {
            origin = 'gateway';
        }
        statistics.increaseExchangeStatistic(exchangeId, 'getBalances', false);
        res.status(503).send({origin:origin,error:err.error});
    });
});

};
