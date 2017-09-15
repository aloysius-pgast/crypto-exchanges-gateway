"use strict";
const util = require('util');
const RequestHelper = require('../../request-helper');
const pairFinder = require('../../pair-finder');

module.exports = function(app, bodyParser, config) {

if (!config.exchanges.poloniex.enabled)
{
    return;
}

const ExchangeClass = require('./exchange');
const exchange = new ExchangeClass(config);

let getPairs = function(){
    return exchange.pairs();
}
pairFinder.register('poloniex', getPairs);

/**
 * Returns tickers for all pairs (or a list of pairs)
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pairs pairs to retrieve ticker for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/poloniex/tickers', (req, res) => {
    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if ('custom' == opt.outputFormat)
    {
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
    }
    exchange.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Returns ticker for an existing pair
 *
 * @param {string} pair pairs to retrieve ticker for
 *
 */
app.get('/exchanges/poloniex/tickers/:pair', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pairs = [req.params.pair];
    exchange.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Retrieves existing pairs
 */
app.get('/exchanges/poloniex/pairs', (req, res) => {
    let opt = {};
    exchange.pairs(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Returns order book for a given pair
 *
 * @param {string} pair pair to retrieve order book for (X-Y)

 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {integer} limit how many entries to retrieve (optional, default = 50)
 */
app.get('/exchanges/poloniex/orderBooks/:pair', (req, res) => {
    let opt = {outputFormat:'custom', limit:50};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pair = req.params.pair;
    if (undefined != req.query.limit)
    {
        let limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0)
        {
            res.status(400).send({origin:"gateway",error:util.format("Parameter 'limit' should be an integer > 0 : value = '%s'", req.query.limit)});
            return;
        }
        opt.limit = limit;
    }
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.orderBook(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

//-- below routes require valid key/secret
if ('' === config.exchanges.poloniex.key || '' === config.exchanges.poloniex.secret)
{
    return;
}

/**
 * Returns all open orders
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pairs pairs to retrieve open orders for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/poloniex/openOrders', (req, res) => {
    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if ('custom' == opt.outputFormat)
    {
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
    }
    exchange.openOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Returns a single open order
 *
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get('/exchanges/poloniex/openOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'}
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    exchange.openOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Creates a new order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to create order for (X-Y)
 * @param {float} targetRate rate to use for order
 * @param {float} quantity quantity to buy/sell
 */
app.post('/exchanges/poloniex/openOrders', bodyParser, (req, res) => {
    let opt = {outputFormat:'custom'}
    let value = RequestHelper.getParam(req, 'outputFormat');
    if ('exchange' == value)
    {
        opt.outputFormat = 'exchange';
    }
    //-- order type
    value = RequestHelper.getParam(req, 'orderType');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'orderType'"});
        return;
    }
    if ('buy' != value && 'sell' != value)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'orderType' is not valid : value = '%s'", value)});
        return;
    }
    opt.orderType = value;
    //-- pair
    value = RequestHelper.getParam(req, 'pair');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'pair'"});
        return;
    }
    opt.pair = value;
    //-- targetRate
    value = RequestHelper.getParam(req, 'targetRate');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'targetRate'"});
        return;
    }
    let targetRate = parseFloat(value);
    if (isNaN(targetRate) || targetRate <= 0)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'targetRate' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.targetRate = value;
    //-- quantity
    value = RequestHelper.getParam(req, 'quantity');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'quantity'"});
        return;
    }
    let quantity = parseFloat(value);
    if (isNaN(quantity) || quantity <= 0)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'quantity' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.quantity = value;

    //-- create order
    exchange.addOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Cancels an existing order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderNumber unique identifier of the order to cancel
 */
app.delete('/exchanges/poloniex/openOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    //-- create order
    exchange.cancelOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Returns closed orders
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {integer} fromTimestamp when to start searching for completed orders (optional, defaults to current timestamp - 24H)
 * @param {integer} toTimestamp when to stop searching for completed orders (optional, defaults to now) (requires fromTimestamp)
 * @param {string} pairs pairs to retrieve closed orders for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/poloniex/closedOrders', (req, res) => {
    let currentTimestamp = parseInt(new Date().getTime() / 1000);
    let minTimestamp = currentTimestamp - (3600 * 24);
    let opt = {outputFormat:'custom', fromTimestamp:minTimestamp, toTimestamp:currentTimestamp};
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if (undefined != req.query.fromTimestamp)
    {
        let fromTimestamp = parseInt(req.query.fromTimestamp);
        if (isNaN(fromTimestamp) || fromTimestamp <= 0)
        {
            res.status(400).send({origin:"gateway",error:util.format("Query parameter 'fromTimestamp' should be a Unix timestamp integer >= 0 : value = '%s'", req.query.fromTimestamp)});
            return;
        }
        opt.fromTimestamp = fromTimestamp;
        if (undefined != req.query.toTimestamp)
        {
            let toTimestamp = parseInt(req.query.toTimestamp);
            if (isNaN(toTimestamp) || toTimestamp <= 0)
            {
                res.status(400).send({origin:"gateway",error:util.format("Query parameter 'toTimestamp' should be a Unix timestamp integer >= 0 : value = '%s'", req.query.toTimestamp)});
                return;
            }
            opt.toTimestamp = toTimestamp;
        }
    }
    if ('custom' == opt.outputFormat)
    {
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
    }
    exchange.closedOrders(opt)
        .then(function(data) {
            // always return an object if outputFormat is exchange
            if ('exchange' == opt.outputFormat && 0 == data.length)
            {
                res.send({});
                return;
            }
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Returns a single closed order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get('/exchanges/poloniex/closedOrders/:orderNumber', (req, res) => {
    let currentTimestamp = parseInt(new Date().getTime() / 1000);
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    opt.orderNumber = req.params.orderNumber;
    exchange.closedOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

/**
 * Retrieves balances
 *
 */
app.get('/exchanges/poloniex/balances', (req, res) => {
    let opt = {outputFormat:'custom'};
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.balances(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(ex)
        {
            res.status(503).send({origin:"remote",error:ex.message});
        });
});

};
