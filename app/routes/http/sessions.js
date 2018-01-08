"use strict";
const _ = require('lodash');
const RequestHelper = require('../../request-helper');
const serviceRegistry = require('../../service-registry');
const sessionRegistry = require('../../session-registry');

module.exports = function(app, bodyParser, config) {

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
        res.status(400).send({origin:"gateway",error:`'${req.params.exchange}' exchange is not supported`});
        return null;
    }
    let exchangeInstance = exchange.instance;
    if (undefined !== features)
    {
        _.forEach(features, (f) => {
            if (undefined === exchange.features[f] || !exchange.features[f].enabled)
            {
                exchangeInstance = null;
                res.status(400).send({origin:"gateway",error:`Feature '${f}' is not supported by '${req.params.exchange}' exchange`});
                return false;
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
        exchange.pairs({useCache:true}).then(function(data){
            if (undefined === data[req.params.pair])
            {
                res.status(400).send({origin:"gateway",error:`Pair '${req.params.pair}' is not supported by '${req.params.exchange}' exchange`});
                resolve(false);
                return;
            }
            resolve(true);
        }).catch (function(err){
            res.status(503).send({origin:"remote",error:err});
            resolve(false);
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
    if (null === exchange)
    {
        return Promise.resolve(false);
    }
    return checkPair(exchange, req, res);
}

/**
 * List existing sessions
 *
 * @param {boolean} rpc if true, only RPC sessions will be retrieved. If false only non-rpc sessions will be retrieved. If not set, all sessions will be retrieved
 */
app.get('/sessions', (req, res) => {
    let opt = {};
    if (undefined !== req.query.rpc && '' != req.query.rpc)
    {
        if ('true' === req.query.rpc || '1' === req.query.rpc)
        {
            opt.rpc = true;
        }
        else if ('false' === req.query.rpc || '0' === req.query.rpc)
        {
            opt.rpc = false;
        }
    }
    let sessions = sessionRegistry.getSessions(opt);
    let list = {};
    _.forEach(sessions, (session, sid) => {
        list[sid] = session.toHash()
    });
    res.send(list);
});

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
    res.send(list);
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
app.post(`/sessions/:sid`, bodyParser, (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    let opt = {expires:false};
    let value = RequestHelper.getParam(req, 'expires');
    if (undefined !== value && '' !== value)
    {
        if ('true' === value || '1' === value)
        {
            opt.expires = true;
        }
        else if ('false' === value || '0' === value)
        {
            opt.expires = false;
        }
        else
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'expires' should be a boolean"});
            return;
        }
    }
    if (undefined !== opt.expires && opt.expires)
    {
        value = RequestHelper.getParam(req, 'timeout');
        if (undefined !== value && '' !== value)
        {
            opt.timeout = parseInt(value);
            if (isNaN(opt.timeout) || opt.timeout < 0)
            {
                res.status(400).send({origin:"gateway",error:"Parameter 'timeout' should be an integer >= 0"});
                return;
            }
        }
    }
    // session already exists
    if (null !== session)
    {
        if (!session.isRpc())
        {
            res.status(400).send({origin:"gateway",error:`Session '${req.params.sid}' is a non RPC session`});
            return;
        }
    }
    else
    {
        // create a new session
        session = sessionRegistry.registerRpcSession(req.params.sid, undefined, false);
    }
    // update expiry ?
    if (undefined !== opt.expires)
    {
        if (!opt.expires)
        {
            session.disableExpiry();
        }
        else
        {
            session.enableExpiry(opt.timeout);
        }
    }
    res.send({});
});

/**
 * Updates expiry for a given RPC session
 *
 * @param {sid} session identifier
 * @param {boolean} expires whether or not session will expire after all client connections have been closed
 * @param {integer} timeout number of second to wait before destroying session all client connections have been closed (optional, default = 600) (will be ignored if expires is false)
 */
app.patch(`/sessions/:sid/expiry`, bodyParser, (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.status(400).send({origin:"gateway",error:`Session '${req.params.sid} does not exist'`});
        return;
    }
    // session is not an RPC session
    if (!session.isRpc())
    {
        res.status(400).send({origin:"gateway",error:"Expiry cannot be changed for a non-RPC session"});
        return;
    }
    let expires = RequestHelper.getParam(req, 'expires');
    if (undefined === expires || '' === expires)
    {
        res.status(400).send({origin:"gateway",error:"Missing parameter 'expires'"});
        return;
    }
    if ('true' === expires || '1' === expires)
    {
        expires = true;
    }
    else if ('false' === expires || '0' === expires)
    {
        expires = false;
    }
    else
    {
        res.status(400).send({origin:"gateway",error:"Parameter 'expires' should be a boolean"});
        return;
    }
    if (!expires)
    {
        session.disableExpiry();
        res.send({});
        return;
    }
    let timeout = undefined;
    let value = RequestHelper.getParam(req, 'timeout');
    if (undefined !== value && '' !== value)
    {
        value = parseInt(value);
        if (isNaN(value) || value < 0)
        {
            res.status(400).send({origin:"gateway",error:"Parameter 'timeout' should be an integer >= 0"});
            return;
        }
        timeout = value;
    }
    session.enableExpiry(timeout);
    res.send({});
});

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
        res.send({});
        return;
    }
    session.destroy();
    res.send({});
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
        res.send(result);
        return;
    }
    let hash = session.toHash();
    result[req.params.sid] = hash.subscriptions;
    res.send(result);
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
        res.send(result);
        return;
    }
    let hash = session.toHash();
    result[req.params.sid] = {};
    if (undefined !== hash.subscriptions[req.params.exchange])
    {
        result[req.params.sid][req.params.exchange] = hash.subscriptions[req.params.exchange];
    }
    res.send(result);
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
        res.send(result);
        return;
    }
    let hash = session.toHash();
    result[req.params.sid] = hash.connections;
    res.send(result);
});

/**
 * Cancel all subscriptions for a given session
 */
app.delete('/sessions/:sid/subscriptions', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    session.unsubscribe({remove:true});
    res.send({});
});

/**
 * Cancel all subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    session.unsubscribe({remove:true,exchangeId:req.params.exchange});
    res.send({});
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
        res.send({});
    });
});

/**
 * Cancel all tickers subscriptions for a given exchange, in a given session
 *
 */
app.delete('/sessions/:sid/subscriptions/:exchange/tickers', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromAllTickers(req.params.exchange);
    res.send({});
});

/**
 * Cancel ticker subscription for a given pair, on a given exchange, in a given session
 *
 * @param {string} pairs pairs to cancel subscriptions for (optional)
 */
app.delete('/sessions/:sid/subscriptions/:exchange/tickers/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromTickers(req.params.exchange, [req.params.pair]);
    res.send({});
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
        res.send({});
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
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.resyncOrderBooks(req.params.exchange, [req.params.pair], false);
    res.send({});
});

/**
 * Cancel all order books subscriptions for a given exchange, in a given session
 *
 */
app.delete('/sessions/:sid/subscriptions/:exchange/orderBooks', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromAllOrderBooks(req.params.exchange);
    res.send({});
});

/**
 * Cancel order book subscription for a given pair, on a given exchange, in a given session
 *
 * @param {string} pairs pairs to cancel subscriptions for (optional)
 */
app.delete('/sessions/:sid/subscriptions/:exchange/orderBooks/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromOrderBooks(req.params.exchange, [req.params.pair]);
    res.send({});
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
        res.send({});
    });
});

/**
 * Cancel all trades subscriptions for a given exchange, in a given session
 *
 */
app.delete('/sessions/:sid/subscriptions/:exchange/trades', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromAllTrades(req.params.exchange);
    res.send({});
});

/**
 * Cancel trades subscription for a given pair, on a given exchange, in a given session
 *
 * @param {string} pairs pairs to cancel subscriptions for (optional)
 */
app.delete('/sessions/:sid/subscriptions/:exchange/trades/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromTrades(req.params.exchange, [req.params.pair]);
    res.send({});
});

/**
 * Create klines subscription for a given pair, on a given exchange, in a given session
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
        let interval = exchange.instance.getDefaultKlinesInterval();
        let int = RequestHelper.getParam(req, 'interval');
        if (undefined != int && '' != int)
        {
            if (!exchange.instance.isKlinesIntervalSupported(int))
            {
                res.status(400).send({origin:"gateway",error:`Parameter 'interval' is not valid : value = '${int}'`});
                return;
            }
            interval = int;
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
        session.subscribeToKlines(req.params.exchange, [req.params.pair], interval, false, false);
        res.send({});
    });
});

/**
 * Cancel all klines subscriptions for a given exchange, in a given session
 */
app.delete('/sessions/:sid/subscriptions/:exchange/klines', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    session.unsubscribeFromAllKlines(req.params.exchange);
    res.send({});
});

/**
 * Cancel klines subscription for a given pair, on a given exchange, in a given session
 *
 * @param {string} pairs pairs to cancel subscriptions for (optional)
 */
app.delete('/sessions/:sid/subscriptions/:exchange/klines/:pair', (req, res) => {
    let session = sessionRegistry.getSession(req.params.sid);
    // session does not exist
    if (null === session)
    {
        res.send({});
        return;
    }
    let exchange = serviceRegistry.getExchange(req.params.exchange);
    // exchange dos not exist, do nothing
    if (null === exchange)
    {
        res.send({});
        return;
    }
    let interval = undefined;
    let int = RequestHelper.getParam(req, 'interval');
    if (undefined != int && '' != int)
    {
        interval = int;
    }
    session.unsubscribeFromKlines(req.params.exchange, [req.params.pair], interval);
    res.send({});
});

};
