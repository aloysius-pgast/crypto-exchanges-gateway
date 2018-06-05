"use strict";
const _ = require('lodash');
const Joi = require('../../custom-joi');
const JoiHelper = require('../../joi-helper');
const Errors = require('../../errors');
const statistics = require('../../statistics');
const pairFinder = require('../../pair-finder');
const serviceRegistry = require('../../service-registry');
const FakeExchangeClass = require('../../fake-exchange');

/**
 * Sends an http error to client
 *
 * @param {string} exchangeId exchange identifier
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (exchangeId, res, err) => {
    return Errors.sendHttpError(res, err, exchangeId);
}

class DefaultExchangeRoutes
{

/**
 * Defines default routes
 */
static defineRoutes(app, exchange, bodyParsers)
{
    let hasCredentials = exchange.hasCredentials();
    let isDemo = exchange.isDemo();
    let features = exchange.getFeatures();

    //-- pairs
    if (undefined !== features['pairs'] && features['pairs'].enabled)
    {
        this.defineGetPairsRoute(app, exchange);
        this.defineGetPairRoute(app, exchange);

        // update pair finder
        const getPairs = function(opt){
            let o = {};
            if (undefined !== opt.pair)
            {
                o.pairs = [opt.pair];
            }
            else if (undefined !== opt.currency)
            {
                o.currencies = [opt.currency];
            }
            else if (undefined !== opt.baseCurrency)
            {
                o.baseCurrencies = [opt.baseCurrency];
            }
            return exchange.getPairs(true, o);
        }
        pairFinder.register(exchange.getId(), getPairs);

        // define testOrder route
        this.defineGetTestOrderRoute(app, exchange);
    }

    //-- tickers
    if (undefined !== features['tickers'] && features['tickers'].enabled)
    {
        this.defineGetTickersRoute(app, exchange);
        this.defineGetTickerRoute(app, exchange);
    }

    //-- order books
    if (undefined !== features['orderBooks'] && features['orderBooks'].enabled)
    {
        this.defineGetOrderBookRoute(app, exchange);
    }

    //-- trades
    if (undefined !== features['trades'] && features['trades'].enabled)
    {
        this.defineGetTradesRoute(app, exchange);
    }

    //-- klines
    if (undefined !== features['klines'] && features['klines'].enabled)
    {
        this.defineGetKlinesRoute(app, exchange);
    }

    //-- subscriptions (always defined)
    this.defineGetSubscriptionsRoute(app, exchange);
    this.defineGetConnectionsRoute(app, exchange);

    /* below routes require credentials */
    if (!hasCredentials)
    {
        // if we don't have credentials, mark features as disable
        _.forEach(['orders', 'openOrders', 'closedOrders', 'balances'], (e) => {
            features[e] = {enabled:false}
        });
    }
    // use fake exchange if demo mode is enabled
    let fakeExchange = null;
    if (isDemo)
    {
        fakeExchange = new FakeExchangeClass(exchange);
    }

    //-- open orders
    if (undefined !== features['openOrders'] && features['openOrders'].enabled)
    {
        this.defineGetOpenOrdersRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
        this.defineGetOpenOrderRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
        this.definePostOpenOrderRoute(app, exchange, bodyParsers.urlEncoded, {isDemo:isDemo, fakeExchange:fakeExchange});
        this.defineDeleteOpenOrderRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
    }

    //-- closed orders
    if (undefined !== features['closedOrders'] && features['closedOrders'].enabled)
    {
        this.defineGetClosedOrdersRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
        this.defineGetClosedOrderRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
    }

    //-- order
    if (undefined !== features['orders'] && features['orders'].enabled)
    {
        this.defineGetOrderRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
    }

    //-- balances
    if (undefined !== features['balances'] && features['balances'].enabled)
    {
        this.defineGetBalancesRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
        this.defineGetBalanceRoute(app, exchange, {isDemo:isDemo, fakeExchange:fakeExchange});
    }

    // register exchange
    serviceRegistry.registerExchange(exchange.getId(), exchange.getType(), exchange.getName(), exchange, features, isDemo);
}

/**
 * Defines the route used to retrieve pairs
 */
static defineGetPairsRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair(),
        currency: Joi.string().currency(),
        baseCurrency: Joi.string().currency(),
        useCache: Joi.boolean().truthy('1').falsy('0').insensitive(true).default(false)
    });

    /**
     * Retrieves existing pairs
     * @param {string} pair : used to retrieve only a single pair (ex: BTC-ETH (optional)
     * @param {string} currency : used to list pairs with a given currency (ex: ETH in BTC-ETH pair) (optional, will be ignored if pair is set)
     * @param {string} baseCurrency : used to list pairs with a given base currency (ex: BTC in BTC-ETH pair) (optional, will be ignored if currency or pair are set)
     * @param {boolean} useCache : if true cache will be used if available (optional, default = false)
     */
    app.get(`/exchanges/${exchange.getId()}/pairs`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPairs', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {};
        if (undefined !== params.value.pair)
        {
            opt.pairs = [params.value.pair];
        }
        else if (undefined !== params.value.currency)
        {
            opt.currencies = [params.value.currency];
        }
        else if (undefined !== params.value.baseCurrency)
        {
            opt.baseCurrencies = [params.value.baseCurrency];
        }
        exchange.getPairs(params.value.useCache, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPairs', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPairs', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve a single pair
 */
static defineGetPairRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair(),
        useCache: Joi.boolean().truthy('1').falsy('0').insensitive(true).default(false)
    });

    /**
     * Returns information for a single pair
     *
     * @param {string} pair pairs to retrieve ticker for
     * @param {boolean} useCache : if true cache will be used if available (optional, default = false)
     */
    app.get(`/exchanges/${exchange.getId()}/pairs/:pair`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPair', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {pairs:[params.value.pair]};
        exchange.getPairs(params.value.useCache, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPair', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getPair', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve all tickers
 */
static defineGetTickersRoute(app, exchange)
{
    const obj = {
        pairs: Joi.csvArray().items(Joi.string().pair()).single(true)
    };

    if (exchange.doesRequirePair('tickers'))
    {
        obj.pairs = obj.pairs.required();
    }
    const schema = Joi.object(obj);

    /**
     * Returns tickers for a list of pairs. No error will be returned if one of the pairs does not exist
     *
     * @param {string} pairs pairs to retrieve ticker for (optional)
     */
    app.get(`/exchanges/${exchange.getId()}/tickers`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTickers', false);
            return sendError(exchange.getId(), res, params.error);
        }
        exchange.getTickers(params.value.pairs).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTickers', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTickers', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve ticker for a single pair
 */
static defineGetTickerRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair()
    });

    /**
     * Returns ticker for an existing pair
     *
     * @param {string} pair pairs to retrieve ticker for
     */
    app.get(`/exchanges/${exchange.getId()}/tickers/:pair`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTicker', false);
            return sendError(exchange.getId(), res, params.error);
        }
        exchange.getTickers([params.value.pair]).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTicker', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTicker', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve order book for a single pair
 */
static defineGetOrderBookRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair(),
        limit: Joi.number().integer().positive()
    });

    /**
     * Returns order book for a given pair
     *
     * @param {string} pair pair to retrieve order book for
     * @param {integer} limit how many entries to retrieve (optional)
     */
    app.get(`/exchanges/${exchange.getId()}/orderBooks/:pair`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getOrderBook', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {};
        if (undefined !== params.value.limit)
        {
            opt.limit = params.value.limit;
        }
        exchange.getOrderBook(params.value.pair, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getOrderBook', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getOrderBook', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve last trades for a single pair
 */
static defineGetTradesRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair(),
        limit: Joi.number().integer().positive(),
        afterTradeId: Joi.number().integer().positive(),
        afterTimestamp: Joi.number().positive()
    });

    /**
     * Returns last trades for a given pair
     *
     * @param {string} pair pair to retrieve last trades for
     * @param {integer} afterTradeId only retrieve trade with an ID > 'afterTradeId' (optional)
     * @param {float} afterTimestamp only retrieve trade with timestamp > 'afterTimestamp' (optional)
     */
    app.get(`/exchanges/${exchange.getId()}/trades/:pair`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTrades', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {};
        if (undefined !== params.value.limit)
        {
            opt.limit = params.value.limit;
        }
        if (undefined !== params.value.afterTradeId)
        {
            opt.afterTradeId = params.value.afterTradeId;
        }
        if (undefined !== params.value.afterTimestamp)
        {
            opt.afterTimestamp = params.value.afterTimestamp;
        }
        exchange.getTrades(params.value.pair, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTrades', true);
            res.send(data);
        }).catch(function(err){
            statistics.increaseExchangeStatistic(exchange.getId(), 'getTrades', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve chart data for a single pair
 */
static defineGetKlinesRoute(app, exchange)
{
    const schema = Joi.object({
        pair: Joi.string().pair(),
        interval: Joi.string().default(exchange.getDefaultKlinesInterval()),
        fromTimestamp: Joi.number().positive(),
        toTimestamp: Joi.number().positive(),
        limit: Joi.number().integer().positive()
    });

    /**
     * Returns charts data for a given pair
     *
     * @param {string} pair pair to retrieve charts data for
     * @param {string} interval charts interval (optional, default = 5m)
     * @param {float} fromTimestamp only retrieve klines with timestamp >= 'fromTimestamp' (optional)
     * @param {float} toTimestamp only retrieve klines with timestamp <= 'toTimestamp' (optional, will be ignored if 'fromTimestamp' is not defined) (if not set will return first 500 entries from 'fromTimestamp')
     * @param {integer} limit number of entries to return (optional, default = 500, max = 5000) (will be ignored if 'toTimestamp' is set)
     */
    app.get(`/exchanges/${exchange.getId()}/klines/:pair`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getKlines', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {interval:params.value.interval};
        if (!exchange.isKlinesIntervalSupported(params.value.interval))
        {
            let err = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval(exchange.getId(), params.value.interval);
            statistics.increaseExchangeStatistic(exchange.getId(), 'getKlines', false);
            return sendError(exchange.getId(), res, err);
        }
        if (undefined !== params.value.fromTimestamp)
        {
            opt.fromTimestamp = params.value.fromTimestamp;
        }
        if (undefined !== params.value.toTimestamp)
        {
            opt.toTimestamp = params.value.toTimestamp;
        }
        if (undefined !== params.value.limit)
        {
            opt.limit = params.value.limit;
        }
        exchange.getKlines(params.value.pair, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getKlines', true);
            res.send(data);
        }).catch(function(err){
            statistics.increaseExchangeStatistic(exchange.getId(), 'getKlines', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to list existing subscriptions
 */
 static defineGetSubscriptionsRoute(app, exchange)
 {
     /**
      * Returns existing subscriptions for current exchange
      */
     app.get(`/exchanges/${exchange.getId()}/subscriptions`, (req, res) => {
         let manager = exchange.getSubscriptionManager();
         if (null === manager)
         {
             return res.send({});
         }
         try
         {
             let list = manager.getSubscriptions();
             statistics.increaseExchangeStatistic(exchange.getId(), 'getSubscriptions', true);
             return res.send(list);
         }
         catch (e)
         {
             statistics.increaseExchangeStatistic(exchange.getId(), 'getSubscriptions', false);
             return sendError(exchange.getId(), res, e);
         }
     });
}

/**
 * Defines the route used to list established connections to exchange
 */
 static defineGetConnectionsRoute(app, exchange)
 {
     /**
      * Returns established stream connections to exchange
      */
     app.get(`/exchanges/${exchange.getId()}/connections`, (req, res) => {
         let manager = exchange.getSubscriptionManager();
         if (null === manager)
         {
             return res.send({});
         }
         try
         {
             let list = manager.getConnections();
             statistics.increaseExchangeStatistic(exchange.getId(), 'getConnections', false);
             return res.send(list);
         }
         catch (e)
         {
             statistics.increaseExchangeStatistic(exchange.getId(), 'getConnections', false);
             return sendError(exchange.getId(), res, e);
         }
     });
}

/**
 * Defines the route used to test order
 */
static defineGetTestOrderRoute(app, exchange)
{
    const schema = Joi.object({
        orderType: Joi.string().required().valid(['buy','sell']),
        pair: Joi.string().required().pair(),
        targetRate: Joi.number().required().positive(),
        quantity: Joi.number().positive(),
        targetPrice: Joi.number().positive(),
        finalPrice: Joi.number().positive(),
        feesPercent: Joi.number().min(0).max(100).default(exchange.getFeesPercent())
    }).xor('quantity','targetPrice','finalPrice');

    /**
     * Test an order and update quantity to match limits
     *
     * One of quantity|targetPrice|finalPrice should be defined
     *
     * @param {string} orderType (buy|sell)
     * @param {string} pair pair to create order for (expected format depends on 'inputFormat' parameter
     * @param {float} targetRate rate to use for order
     * @param {float} quantity quantity to buy/sell (optional)
     * @param {float} targetPrice quantity * target rate (optional) (will be ignored if quantity is set)
     * @param {float} finalPrice targetPrice +- fees (optional) (will be ignored if quantity/targetPrice is set)
     * @param {float} feesPercent fees % (optional) (0-100)
     */
    app.get(`/exchanges/${exchange.getId()}/testOrder`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(exchange.getId(), 'testOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let opt = {};
        if (undefined !== params.value.feesPercent)
        {
            opt.feesPercent = params.value.feesPercent;
        }
        // optional parameters
        if (undefined !== params.value.quantity)
        {
            opt.quantity = params.value.quantity;
        }
        else if (undefined !== params.value.targetPrice)
        {
            opt.targetPrice = params.value.targetPrice;
        }
        else
        {
            opt.finalPrice = params.value.finalPrice;
        }
        exchange.testOrder(params.value.orderType, params.value.pair, params.value.targetRate, opt).then(function(data) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'testOrder', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'testOrder', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to list open orders
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetOpenOrdersRoute(app, exchange, opt)
{
    const obj = {
        pairs: Joi.csvArray().items(Joi.string().pair()).single(true)
    };
    if (exchange.doesRequirePair('openOrders'))
    {
        obj.pairs = obj.pairs.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }
    /**
     * Returns open orders
     *
     * @param {string} pairs pairs to retrieve open orders for (optional)
     */
    app.get(`/exchanges/${exchangeId}/openOrders`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getOpenOrders', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getOpenOrders(params.value.pairs);
        }
        else
        {
            p = exchange.getOpenOrders(params.value.pairs);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getOpenOrders', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getOpenOrders', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve a single open order
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetOpenOrderRoute(app, exchange, opt)
{
    const obj = {
        pair: Joi.string().pair()
    };
    if (exchange.doesRequirePair('openOrders'))
    {
        obj.pair = obj.pair.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }
    /**
     * Returns a single open order. No error will be triggered if order does not exist
     *
     * @param {string} orderNumber unique identifier of the order to return
     * @param {string} pair pair for this order (optional)
     */
    app.get(`/exchanges/${exchangeId}/openOrders/:orderNumber`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getOpenOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let pairs = [];
        if (undefined !== params.value.pair)
        {
            pairs.push(params.value.pair);
        }
        let _opt = {orderNumber:req.params.orderNumber};
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getOpenOrders(pairs, _opt);
        }
        else
        {
            p = exchange.getOpenOrders(pairs, _opt);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getOpenOrder', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'getOpenOrder', true);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to create a new order
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static definePostOpenOrderRoute(app, exchange, bodyParser, opt)
{
    const schema = Joi.object({
        orderType: Joi.string().required().valid(['buy','sell']),
        pair: Joi.string().required().pair(),
        targetRate: Joi.number().required().positive(),
        quantity: Joi.number().positive()
    });

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }

    /**
     * Create a new order
     *
     * @param {string} orderType (buy|sell)
     * @param {string} pair pair to create order for (expected format depends on 'inputFormat' parameter
     * @param {float} targetRate rate to use for order
     * @param {float} quantity quantity to buy/sell
     */
    app.post(`/exchanges/${exchangeId}/openOrders`, bodyParser, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'addOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.createOrder(params.value.orderType, params.value.pair, params.value.targetRate, params.value.quantity);
        }
        else
        {
            p = exchange.createOrder(params.value.orderType, params.value.pair, params.value.targetRate, params.value.quantity);
        }
        p.then(function(orderNumber) {
            statistics.increaseExchangeStatistic(statsId, 'createOrder', true);
            res.send({orderNumber:orderNumber});
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'createOrder', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to cancel an order
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineDeleteOpenOrderRoute(app, exchange, opt)
{
    const obj = {
        pair: Joi.string().pair()
    }
    if (exchange.doesRequirePair('openOrders'))
    {
        obj.pair = obj.pair.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }

    /**
     * Cancels an existing order
     *
     * @param {string} orderNumber unique identifier of the order to cancel
     * @param {string} pair pair for this order (optional)
     */
    app.delete(`/exchanges/${exchangeId}/openOrders/:orderNumber`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'cancelOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.cancelOrder(req.params.orderNumber, params.value.pair);
        }
        else
        {
            p = exchange.cancelOrder(req.params.orderNumber, params.value.pair);
        }
        p.then(function(result) {
            statistics.increaseExchangeStatistic(statsId, 'cancelOrder', true);
            res.send({});
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'cancelOrder', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to list closed orders
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetClosedOrdersRoute(app, exchange, opt)
{
    const obj = {
        pairs: Joi.csvArray().items(Joi.string().pair()).single(true),
        completeHistory: Joi.boolean().truthy('1').falsy('0').insensitive(true).default(false)
    }
    if (exchange.doesRequirePair('closedOrders'))
    {
        obj.pairs = obj.pairs.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }
    /**
     * Returns closed orders
     *
     * @param {string} pairs pairs to retrieve closed orders for (optional)
     * @param {boolean} completeHistory if true complete history will be retrieved (might not be supported on all exchanges)
     */
    app.get(`/exchanges/${exchangeId}/closedOrders`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getClosedOrders', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let _opt = {};
        if (true === params.value.completeHistory)
        {
            _opt.completeHistory = true;
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getClosedOrders(params.value.pairs, _opt);
        }
        else
        {
            p = exchange.getClosedOrders(params.value.pairs, _opt);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getClosedOrders', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(exchange.getId(), 'getClosedOrders', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve a single closed order
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetClosedOrderRoute(app, exchange, opt)
{
    const obj = {
        pair: Joi.string().pair()
    }
    if (exchange.doesRequirePair('closedOrders'))
    {
        obj.pair = obj.pair.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }
    /**
     * Returns a single closed order. No error will be triggered if order does not exist
     *
     * @param {string} orderNumber unique identifier of the order to return
     * @param {string} pair pair for this order (optional)
     */
    app.get(`/exchanges/${exchangeId}/closedOrders/:orderNumber`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getClosedOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let pairs = [];
        if (undefined !== params.value.pair)
        {
            pairs.push(params.value.pair);
        }
        let _opt = {orderNumber:req.params.orderNumber};
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getClosedOrders(pairs, _opt);
        }
        else
        {
            p = exchange.getClosedOrders(pairs, _opt);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getClosedOrder', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'getClosedOrder', true);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve a single order (open or closed)
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetOrderRoute(app, exchange, opt)
{
    const obj = {
        pair: Joi.string().pair()
    }
    if (exchange.doesRequirePair('orders'))
    {
        obj.pair = obj.pair.required();
    }
    const schema = Joi.object(obj);

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }
    /**
     * Returns a single open order
     *
     * @param {string} orderNumber unique identifier of the order to return
     * @param {string} pair pair for this order (optional)
     */
    app.get(`/exchanges/${exchangeId}/orders/:orderNumber`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getOrder', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getOrder(req.params.orderNumber, params.value.pair);
        }
        else
        {
            p = exchange.getOrder(req.params.orderNumber, params.value.pair);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getOrder', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'getOrder', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve all balances
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetBalancesRoute(app, exchange, opt)
{
    const schema = Joi.object({
        currencies: Joi.csvArray().items(Joi.string().currency()).single(true)
    });

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }

    /**
     * Returns balances for a list of currencies
     *
     * @param {string} currencies currencies to retrieve balances for (optional)
     */
    app.get(`/exchanges/${exchangeId}/balances`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getBalances', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getBalances(params.value.currencies);
        }
        else
        {
            p = exchange.getBalances(params.value.currencies);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getBalances', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'getBalances', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

/**
 * Defines the route used to retrieve balance for a single currency
 * @param {boolean} opt.isDemo : whether or not demo mode is enabled for this exchange
 * @param {object} opt.fakeExchange : fake exchange object
 */
static defineGetBalanceRoute(app, exchange, opt)
{
    const schema = Joi.object({
        currency: Joi.string().currency()
    });

    let exchangeId = exchange.getId();
    let statsId = exchangeId;
    if (opt.isDemo)
    {
        statsId = opt.fakeExchange.getId();
    }

    /**
     * Returns balances for a single currency
     *
     * @param {string} currencies currencies to retrieve balances for (optional)
     */
    app.get(`/exchanges/${exchangeId}/balances/:currency`, (req, res) => {
        const params = JoiHelper.validate(schema, req, {params:true});
        if (null !== params.error)
        {
            statistics.increaseExchangeStatistic(statsId, 'getBalance', false);
            return sendError(exchange.getId(), res, params.error);
        }
        let p;
        if (opt.isDemo)
        {
            p = opt.fakeExchange.getBalances([params.value.currency]);
        }
        else
        {
            p = exchange.getBalances([params.value.currency]);
        }
        p.then(function(data) {
            statistics.increaseExchangeStatistic(statsId, 'getBalance', true);
            res.send(data);
        }).catch(function(err) {
            statistics.increaseExchangeStatistic(statsId, 'getBalance', false);
            return sendError(exchange.getId(), res, err);
        });
    });
}

}

module.exports = DefaultExchangeRoutes;
