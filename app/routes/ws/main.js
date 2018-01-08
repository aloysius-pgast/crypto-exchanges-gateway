"use strict";
const util = require('util');
const _ = require('lodash');
const url = require('url');
const logger = require('winston');
const uuidGenerator = require('uuid/v4');
const sessionRegistry = require('../../session-registry');
const serviceRegistry = require('../../service-registry');

module.exports = function(app, config) {

const updateWs = (ws, req) => {
    let ipaddr = req.connection.remoteAddress;
    if (undefined !== req.headers['x-forwarded-for'])
    {
        ipaddr = req.headers['x-forwarded-for'];
    }
    ws._timestamp = (new Date().getTime()) / 1000.0;
    ws._clientIpaddr = ipaddr;
}

/**
 * Ensures exchange and pair exist
 *
 * @param {object} ws client websocket
 * @param {string} exchangeId exchange identifier to check
 * @param {string} pair pair to check
 * @param {array} features exchange features
 * @return {Promise} promise which will resolve to boolean (no reject)
 */
const checkExchangeAndPair = (ws, exchangeId, pair, features) => {
    //-- check if exchange is supported
    let exchange = serviceRegistry.getExchange(exchangeId);
    // exchange is not supported
    if (null === exchange)
    {
        logger.warn("Exchange '%s' is not supported", exchangeId);
        ws.terminate();
        return Promise.resolve(false);
    }
    //-- check requested features
    if (undefined !== features)
    {
        let result = true;
        _.forEach(features, (f) => {
            if (undefined === exchange.features[f] || !exchange.features[f].enabled)
            {
                result = false;
                logger.warn("Feature '%s' is not supported by exchange '%s'", f, exchangeId);
            }
        });
        // at least one feature is not supported
        if (!result)
        {
            ws.terminate();
            return Promise.resolve(false);
        }
    }
    //-- check pair
    return new Promise((resolve, reject) => {
        exchange.instance.pairs({useCache:true}).then(function(data){
            if (undefined === data[pair])
            {
                logger.warn("Pair '%s' is not supported by exchange '%s'", pair, exchangeId);
                ws.terminate();
                resolve(false);
            }
            else
            {
                resolve(true);
            }
        }).catch (function(err){
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
            else
            {
                logger.error(err);
            }
            ws.terminate();
            resolve(false)
        });
    });
}

//-- rpc route
app.ws('/', function(ws, req) {
    let sid = null;
    // in case session id has been provided
    if (undefined !== req.query && undefined !== req.query.sid)
    {
        let value = req.query.sid.trim();
        if ('' != value)
        {
            sid = value;
        }
    }
    updateWs(ws, req);
    let opt = {};
    // did client ask for a specific expiry value ?
    if (undefined !== req.query)
    {
        if (undefined !== req.query.expires && '' !== req.query.expires)
        {
            if ('true' === req.query.expires || '1' === req.query.expires)
            {
                opt.expires = true;
            }
            else if ('false' === req.query.expires || '0' === req.query.expires)
            {
                opt.expires = false;
            }
            else
            {
                logger.warn("Received invalid boolean value for parameter 'expires' : client = '%s', expires = '%s'", ws._clientIpaddr, req.query.expires);
                ws.terminate();
                return;
            }
            if (opt.expires)
            {
                if (undefined !== req.query.timeout && '' !== req.query.timeout)
                {
                    opt.timeout = parseInt(req.query.timeout);
                    if (isNaN(opt.timeout) || opt.timeout < 0)
                    {
                        logger.warn("Received invalid integer value for parameter 'timeout' : client = '%s', expires = '%s'", ws._clientIpaddr, req.query.timeout);
                        ws.terminate();
                        return;
                    }
                }
            }
        }
    }
    let session = sessionRegistry.registerRpcSession(sid, ws);
    if (null === session)
    {
        return;
    }
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
});

//-- tickers route
app.ws('/exchanges/:exchange/tickers/:pair', function(ws, req) {
    updateWs(ws, req);
    let u = url.parse(req.url);
    // remove .websocket
    let pathname = u.pathname.replace('.websocket', '');
    checkExchangeAndPair(ws, req.params.exchange, req.params.pair, ['wsTickers']).then(function(result){
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            session.subscribeToTickers(req.params.exchange, [req.params.pair]);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
});

//-- order books route
app.ws('/exchanges/:exchange/orderBooks/:pair', function(ws, req) {
    updateWs(ws, req);
    let u = url.parse(req.url);
    // remove .websocket
    let pathname = u.pathname.replace('.websocket', '');
    checkExchangeAndPair(ws, req.params.exchange, req.params.pair, ['wsOrderBooks']).then(function(result){
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            // ensure we get full order book by using {resync:true}
            session.subscribeToOrderBooks(req.params.exchange, [{pair:req.params.pair,resync:true}]);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
});

//-- trades route
app.ws('/exchanges/:exchange/trades/:pair', function(ws, req) {
    updateWs(ws, req);
    let u = url.parse(req.url);
    // remove .websocket
    let pathname = u.pathname.replace('.websocket', '');
    checkExchangeAndPair(ws, req.params.exchange, req.params.pair, ['wsTrades']).then(function(result){
        if (!result)
        {
            return;
        }
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            session.subscribeToTrades(req.params.exchange, [req.params.pair]);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
});

//-- klines route
app.ws('/exchanges/:exchange/klines/:pair', function(ws, req) {
    updateWs(ws, req);
    let u = url.parse(req.url);
    // remove .websocket
    let pathname = u.pathname.replace('.websocket', '');
    checkExchangeAndPair(ws, req.params.exchange, req.params.pair, ['wsKlines']).then(function(result){
        if (!result)
        {
            return;
        }
        let exchange = serviceRegistry.getExchange(req.params.exchange);
        let interval = exchange.instance.getDefaultKlinesInterval();
        if (undefined !== req.params.interval)
        {
            if (!exchange.instance.isKlinesIntervalSupported(req.params.interval))
            {
                logger.warn("Kline interval '%s' is not supported on exchange '%s'", req.params.interval, req.params.exchange);
                ws.terminate();
            }
            interval = req.params.interval;
        }
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            session.subscribeToKlines(req.params.exchange, [req.params.pair], interval);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
});

};
