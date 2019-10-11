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
        ws.close(4400, 'UNSUPPORTED_EXCHANGE');
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
            ws.close(4400, 'UNSUPPORTED_EXCHANGE');
            return Promise.resolve(false);
        }
    }
    //-- check pair
    return new Promise((resolve, reject) => {
        exchange.instance.getPairs(true).then(function(data){
            if (undefined === data[pair])
            {
                logger.warn("Pair '%s' is not supported by exchange '%s'", pair, exchangeId);
                ws.close(4400, 'UNSUPPORTED_PAIR');
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
                ws.close(4400, 'INVALID_PARAMETER');
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
                        ws.close(4400, 'INVALID_PARAMETER');
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
            session.disableExpiry({store:true});
        }
        else
        {
            session.enableExpiry({timeout:opt.timeout,store:true});
        }
    }
    else
    {
        session.enableExpiry({store:true});
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
        if (undefined !== req.query)
        {
            if (undefined !== req.query.interval)
            {
                if (!exchange.instance.isKlinesIntervalSupported(req.query.interval))
                {
                    logger.warn("Kline interval '%s' is not supported on exchange '%s'", req.query.interval, req.params.exchange);
                    ws.close(4400, 'INVALID_PARAMETER');
                    return;
                }
                interval = req.query.interval;
            }
        }
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            session.subscribeToKlines(req.params.exchange, [{pair:req.params.pair,resync:true}], interval);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
});

//-- tickerMonitor route
if (config.tickerMonitor.enabled)
{
    app.ws('/tickerMonitor', function(ws, req) {
        let types = {active:true,inactive:false};
        // whether or not we should send an event for all active|inactive entries upon connection
        let emit = false;
        if (undefined !== req.query)
        {
            if (undefined !== req.query.types && '' != req.query.types)
            {
                types = {active:false,inactive:false};
                let value;
                if (Array.isArray(req.query.types))
                {
                    value = req.query.types;
                }
                else
                {
                    value = req.query.types.split(',');
                }
                for (var i = 0; i < value.length; ++i)
                {
                    switch (value[i])
                    {
                        case 'active':
                            types.active = true;
                            break;
                        case 'inactive':
                            types.inactive = true;
                            break;
                    }
                }
            }
            if ('true' === req.query.emit || '1' === req.query.emit)
            {
                emit = true;
            }
        }
        updateWs(ws, req);
        let u = url.parse(req.url);
        // remove .websocket
        let pathname = u.pathname.replace('.websocket', '');
        let session = sessionRegistry.registerNonRpcSession(ws, pathname);
        if (null === session)
        {
            return;
        }
        try
        {
            session.subscribeToTickerMonitor(types, emit);
        }
        catch (e)
        {
            logger.error(e.stack);
            ws.terminate();
        }
    });
}

};
