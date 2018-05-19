"use strict";
const _ = require('lodash');
const Joi = require('../../custom-joi');
const JoiHelper = require('../../joi-helper');
const Errors = require('../../errors');
const RequestHelper = require('../../request-helper');
const serviceRegistry = require('../../service-registry');
const sessionRegistry = require('../../session-registry');

/**
 * Sends an http error to client
 *
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 */
const sendError = (res, err) => {
    return Errors.sendHttpError(res, err, 'sessions');
}

module.exports = function(app, bodyParsers, config) {

/**
 * Ensures exchange and requested pair exist
 *
 * In case of error, an error will be sent to http client
 *
 * @param {object} req http request object
 * @param {object} res http response object
 * @param {array} features exchange features (optional)
 * @return {object} exchange instance if exchange exists and has all features, null otherwise
 */
const checkExchange = (req, res, features) => {
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange does not exist
    if (null === exchange)
    {
        let err = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchange(req.params.exchange);
        return sendError(res, err);
    }
    let exchangeInstance = exchange.instance;
    if (undefined !== features)
    {
        _.forEach(features, (f) => {
            if (undefined === exchange.features[f] || !exchange.features[f].enabled)
            {
                let err = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature(req.params.exchange, f);
                return sendError(res, err);
            }
        });
    }
    return exchangeInstance;
}

/**
 * Ensures requested pairs exist
 *
 * In case of error, an error will be sent to http client
 *
 * @param {object} exchange Exchange instance
 * @param {object} req http request object
 * @param {object} res http response object
 * @return {Promise} promise which will resolve to boolean (no reject)
 */
const checkPair = (exchange, req, res) => {
    return new Promise((resolve, reject) => {
        exchange.getPairsSymbols(true).then(function(data){
            if (-1 == data.indexOf(req.params.pair))
            {
                let err = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair(req.params.exchange, req.params.pair);
                resolve(false);
                return sendError(res, err);
            }
            resolve(true);
        }).catch (function(err){
            resolve(false);
            return sendError(res, err);
        });
    });
}

/**
 * Ensures exchange and requested pair exist
 *
 * In case of error, an error will be sent to http client
 *
 * @param {object} req http request object
 * @param {object} res http response object
 * @param {array} features exchange features
 * @return {Promise} promise which will resolve to boolean (no reject)
 */
const checkExchangeAndPair = (req, res, features) => {
    let exchange = checkExchange(req, res, features);
    if (false === exchange)
    {
        return Promise.resolve(false);
    }
    return checkPair(exchange, req, res);
}

/*
 * List existing sessions
 */
(function(){
    const schema = Joi.object({
        rpc: Joi.boolean().truthy('1').falsy('0').insensitive(true)
    });

    /**
     * List existing sessions
     *
     * @param {boolean} rpc if true, only RPC sessions will be retrieved. If false only non-rpc sessions will be retrieved. If not set, all sessions will be retrieved
     */
    app.get('/sessions', (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true});
        if (null !== params.error)
        {
            return sendError(res, params.error);
        }
        let opt = {};
        if (undefined !== params.value.rpc)
        {
            opt.rpc = params.value.rpc;
        }
        let sessions = sessionRegistry.getSessions(opt);
        let list = {};
        _.forEach(sessions, (session, sid) => {
            list[sid] = session.toHash()
        });
        return res.send(list);
    });
})();

/**
 * Retrieves a single session
 *
 * @param {string} sid session identifier
 */
app.get('/sessions/:sid', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    let list = {};
    // session does not exist
    if (null === session)
    {
        res.send(list);
        return;
    }
    list[req.params.sid] = session.toHash();
    return res.send(list);
});

/*
 * Creates a new RPC session
 */
(function(){

    const schema = Joi.object({
        expires: Joi.boolean().truthy('1').falsy('0').insensitive(true).default(false),
        timeout: Joi.number().integer().min(0).default(600)
    });

    /**
     * Creates a new RPC session
     *
     * NB: no error will be returned if session with same id already exists (unless existing session is a non-RPC session)
     *
     * @param {sid} session identifier
     * @param {boolean} expires whether or not session will expire after all client connections have been closed (optional, default = false)
     * @param {integer} timeout number of second to wait before destroying session all client connections have been closed (optional, default = 600) (will be ignored if expires is false)
     */
    app.post(`/sessions/:sid`, bodyParsers.urlEncoded, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            return sendError(res, params.error);
        }
        let session = sessionRegistry.getSession(req.params.sid);
        // session already exists
        if (null !== session)
        {
            // we cannot re-use a non-rpc session id
            if (!session.isRpc())
            {
                let err = new Errors.GatewayError.InvalidRequest.UnknownError(`Session '${req.params.sid}' is a non RPC session`);
                return sendError(res, err);
            }
        }
        else
        {
            // create a new session
            session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
        }
        // update expiry ?
        if (!params.value.expires)
        {
            session.disableExpiry();
        }
        else
        {
            session.enableExpiry(params.value.timeout);
        }
        return res.send({});
    });
})();


/*
 * Updates expiry for a given RPC session
 */
(function(){

    const schema = Joi.object({
        expires: Joi.boolean().truthy('1').falsy('0').insensitive(true).required(),
        timeout: Joi.number().integer().min(0).default(600)
    });

    /**
     * Updates expiry for a given RPC session
     *
     * @param {sid} session identifier
     * @param {boolean} expires whether or not session will expire after all client connections have been closed
     * @param {integer} timeout number of second to wait before destroying session all client connections have been closed (optional, default = 600) (will be ignored if 'expires' is 'false')
     */
    app.patch(`/sessions/:sid/expiry`, bodyParsers.urlEncoded, (req, res) => {
        const params = JoiHelper.validate(schema, req, {query:true,body:true});
        if (null !== params.error)
        {
            return sendError(res, params.error);
        }
        let session = sessionRegistry.getSession(req.params.sid);
        // session does not exist
        if (null === session)
        {
            let err = new Errors.GatewayError.InvalidRequest.ObjectNotFound(`Session '${req.params.sid} does not exist'`);
            return sendError(res, err);
        }
        // session is not an RPC session
        if (!session.isRpc())
        {
            let err = new Errors.GatewayError.InvalidRequest.UnknownError('Expiry cannot be changed for a non-RPC session');
            return sendError(res, err);
        }
        let expires = params.value.expires;
        if (!expires)
        {
            session.disableExpiry();
            return res.send({});
        }
        session.enableExpiry(params.value.timeout);
        return res.send({});
    });
})();

/**
 * Destroy an existing session
 *
 * @param {string} sid session identifier
 */
app.delete('/sessions/:sid', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    session.destroy();
    return res.send({});
});

/**
 * List subscriptions for a given session
 */
app.get('/sessions/:sid/subscriptions', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    let result = {};
    // session does not exist
    if (null === session)
    {
        return res.send(result);
    }
    let hash = session.toHash();
    result[req.params.sid] = hash.subscriptions;
    return res.send(result);
});

/**
 * List subscriptions for a given exchange in a given session
 */
app.get('/sessions/:sid/subscriptions/:exchange', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    let result = {};
    // session does not exist
    if (null === session)
    {
        return res.send(result);
    }
    let hash = session.toHash();
    result[req.params.sid] = {};
    if (undefined !== hash.subscriptions[req.params.exchange])
    {
        result[req.params.sid][req.params.exchange] = hash.subscriptions[req.params.exchange];
    }
    return res.send(result);
});

/**
 * List connections for a given session
 */
app.get('/sessions/:sid/connections', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    let result = {};
    // session does not exist
    if (null === session)
    {
        return res.send(result);
    }
    let hash = session.toHash();
    result[req.params.sid] = hash.connections;
    return res.send(result);
});

/**
 * Cancel all subscriptions for a given session
 */
app.delete('/sessions/:sid/subscriptions', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    session.unsubscribe({remove:true});
    return res.send({});
});

/**
 * Cancel all subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    session.unsubscribe({remove:true,exchangeId:req.params.exchange});
    return res.send({});
});

/**
 * Create ticker subscription for a given pair, on a given exchange, in a given session
 *
 * NB: if session does not exist, it will be created automatically
 */
app.post('/sessions/:sid/subscriptions/:exchange/tickers/:pair', (req, res) => {
    // check exchange & pair
    checkExchangeAndPair(req, res, ['wsTickers']).then((result) => {
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.getSession(req.params.sid);
        // session does not exist
        if (null === session)
        {
            // creates session
            session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
            session.disableExpiry();
        }
        // create subscription
        session.subscribeToTickers(req.params.exchange, [req.params.pair], false, false);
        return res.send({});
    });
});

/**
 * Cancel all tickers subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/tickers', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromAllTickers(req.params.exchange);
    return res.send({});
});

/**
 * Cancel ticker subscription for a given pair, on a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/tickers/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromTickers(req.params.exchange, [req.params.pair]);
    return res.send({});
});

/**
 * Create order book subscription for a given pair, on a given exchange, in a given session
 *
 * NB: if session does not exist, it will be created automatically
 */
app.post('/sessions/:sid/subscriptions/:exchange/orderBooks/:pair', (req, res) => {
    // check exchange & pair
    checkExchangeAndPair(req, res, ['wsOrderBooks']).then((result) => {
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.getSession(req.params.sid);
        // session does not exist
        if (null === session)
        {
            // creates session
            session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
            session.disableExpiry();
        }
        // create subscription
        session.subscribeToOrderBooks(req.params.exchange, [req.params.pair], false, false);
        return res.send({});
    });
});

/**
 * Resync order book subscription for a given pair, on a given exchange, in a given session
 */
app.patch('/sessions/:sid/subscriptions/:exchange/orderBooks/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.resyncOrderBooks(req.params.exchange, [req.params.pair], false);
    return res.send({});
});

/**
 * Cancel all order books subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/orderBooks', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromAllOrderBooks(req.params.exchange);
    return res.send({});
});

/**
 * Cancel order book subscription for a given pair, on a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/orderBooks/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromOrderBooks(req.params.exchange, [req.params.pair]);
    return res.send({});
});

/**
 * Create trades subscription for a given pair, on a given exchange, in a given session
 *
 * NB: if session does not exist, it will be created automatically
 */
app.post('/sessions/:sid/subscriptions/:exchange/trades/:pair', (req, res) => {
    // check exchange & pair
    checkExchangeAndPair(req, res, ['wsTrades']).then((result) => {
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.getSession(req.params.sid);
        // session does not exist
        if (null === session)
        {
            // creates session
            session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
            session.disableExpiry();
        }
        // create subscription
        session.subscribeToTrades(req.params.exchange, [req.params.pair], false, false);
        return res.send({});
    });
});

/**
 * Cancel all trades subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/trades', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromAllTrades(req.params.exchange);
    return res.send({});
});

/**
 * Cancel trades subscription for a given pair, on a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/trades/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromTrades(req.params.exchange, [req.params.pair]);
    return res.send({});
});

/*
 * Create klines subscription for a given pair, on a given exchange, in a given session
 */
(function(){
    const schemas = {};

    /**
     * Create klines subscription for a given pair, on a given exchange, in a given session
     *
     * @param {string} interval kline interval (optional)
     *
     * NB: if session does not exist, it will be created automatically
     */
    app.post('/sessions/:sid/subscriptions/:exchange/klines/:pair', (req, res) => {
        // check exchange & pair
        checkExchangeAndPair(req, res, ['wsKlines']).then((result) => {
            if (!result)
            {
                return;
            }
            let exchange = serviceRegistry.getExchange(req.params.exchange);
            let schema = schemas[exchange.getId()];
            if (undefined === schema)
            {
                schemas[exchange.getId()] = Joi.object({
                    interval: Joi.string().default(exchange.getDefaultKlinesInterval())
                });
            }
            const params = JoiHelper.validate(schema, req, {query:true});
            if (null !== params.error)
            {
                return sendError(res, params.error);
            }
            if (!exchange.isKlinesIntervalSupported(params.value.interval))
            {
                let err = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval(exchange.getId(), params.value.interval);
                return sendError(res, err);
            }
            let session = sessionRegistry.getSession(req.params.sid);
            // session does not exist
            if (null === session)
            {
                // creates session
                session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
                session.disableExpiry();
            }
            // create subscription
            session.subscribeToKlines(req.params.exchange, [req.params.pair], params.value.interval, false, false);
            return res.send({});
        });
    });
})();

/**
 * Cancel all klines subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/klines', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    session.unsubscribeFromAllKlines(req.params.exchange);
    return res.send({});
});

/**
 * Cancel klines subscription for a given pair, on a given exchange, in a given session
 *
 * @param {string} interval used to cancel subscription only for a given kline interval (optional)
 */
app.delete('/sessions/:sid/subscriptions/:exchange/klines/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        return res.send({});
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        return res.send({});
    }
    let interval = undefined;
    let int = RequestHelper.getParam(req, 'interval');
    if (undefined != int && '' != int)
    {
        interval = int;
    }
    session.unsubscribeFromKlines(req.params.exchange, [req.params.pair], interval);
    return res.send({});
});

};
