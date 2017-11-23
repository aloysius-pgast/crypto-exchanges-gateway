"use strict";
const _ = require('lodash');
const util = require('util');
const debug = require('debug')('CEG:Session');
const logger = require('winston');
const WebSocket = require('ws');
const EventEmitter = require('events');

const internalConfig = require('./internal-config');
const serviceRegistry = require('./service-registry');
const RpcHelper = require('./rpc-helper');
const storage = require('./storage');

// how long should we wait to close the connection if client does not answer to ping
// connection will be closed if we don't receive pong after timeout
const PING_TIMEOUT = internalConfig.get('keepalive').clients;

// how many seconds should we wait before destroying a session without WS connection (10 min)
const SESSION_TIMEOUT = 600;
//const SESSION_TIMEOUT = 30 ;

/**
 * Class which handles subscriptions related to multiple exchanges for a single session (same session id can be used by multiple WS client connections)
 *
 * It can emit following events (some events might not exist on all exchanges):
 *
 * - ticker (ticker update for a single pair)
 * - orderBook (full order book for a single pair)
 * - orderBookUpdate (order book update for a single pair)
 * - trades (new trades for a single pair)
 */

class Session extends EventEmitter
{

/**
 * Constructor
 *
 * @param {string} sid, session identifier
 * @param {boolean} isRpc, whether or not session is an RPC session
 * @param {boolean} isNew, whether or not session is a new session (optional, default = true)
 */
constructor(sid, isRpc, isNew)
{
    super();
    this._sid = sid;
    this._isRpc = isRpc;

    // list of client web sockets
    this._sockets = {};
    // number of connected sockets
    this._socketsCount = 0;
    // used to provide a uniq id for each socket
    this._nextSocketId = 1;

    // mark session as new
    this._isNew = true;
    if (false === isNew)
    {
        this._isNew = false;
    }

    //-- session expiry
    // creation timestamp
    this._timestamp = (new Date().getTime()) / 1000.0;

    // whether or not session can expires
    this._expires = true;
    // how many seconds to wait after last WS has disconnected, before destroying the session
    this._timeout = SESSION_TIMEOUT;
    // expiry timestamp
    this._expiresAt = null;
    this._expiryTimer = null;
    // whether or not session has been destroyed
    this._destroyed = false;

    // subscriptions per exchange
    this._exchanges = {}
}

/**
 * Restore a session from database
 *
 * @param {object} object loaded from database
 */
restore(obj)
{
    this._timestamp = obj.creationTimestamp;
    this._expires = obj.expires;
    this._timeout = obj.timeout;
    let store = false;
    _.forEach(obj.subscriptions, (subscriptions, exchangeId) => {
        let exchange = this._getExchange(exchangeId);
        if (null === exchange)
        {
            logger.warn("Exchange '%s' is not supported anymore. Subscriptions for this exchange will be ignored", exchangeId);
            store = true;
            return;
        }
        _.forEach(subscriptions, (entry, entity) => {
            this._exchanges[exchangeId].subscriptions[entity] = {
                timestamp:entry.timestamp,
                pairs:entry.pairs
            }
        });
    });
    // we need to store session again
    if (store)
    {
        this._store();
    }
    // start timer if session can expire
    if (this._expires)
    {
        this._startExpiryTimer();
    }
    if (debug.enabled)
    {
        debug("Session '%s' successfully restored", this._sid);
    }
}

_store()
{
    // only store RPC sessions
    if (!this._isRpc)
    {
        return;
    }
    // do not store deleted sessions
    if (this._destroyed)
    {
        return;
    }
    let obj = this._toHash();
    obj.subscriptions = this.getSubscriptions();
    storage.storeSession(this._sid, obj);
}

/**
 * Whether or not session is an RPC session
 */
isRpc()
{
    return this._isRpc;
}

isDestroyed()
{
    return this._destroyed;
}

getSockets()
{
    return this._sockets;
}

/**
 * Whether or not session can expire
 */
canExpire()
{
    return this._expires;
}

/**
 * @return {integer} after how many seconds session will expire when all ws sockets have been closed
 */
getTimeout()
{
    return this._expiry;
}

/**
 * @return {float} timestamp when session will be destroyed (will be null if there are sockets connected)
 */
getExpiryTimestamp()
{
    return this._expiresAt;
}

/**
 * List existing subscriptions
 *
 * @return {object} {tickers:{},orderBooks:{},trades:{}}
 */
getSubscriptions()
{
    let entities = ['tickers','orderBooks','trades'];
    let subscriptions = {};
    _.forEach(this._exchanges, (exchange, exchangeId) => {
        let exchangeSubscriptions = {};
        _.forEach(entities, (entity) => {
            if (undefined !== exchange.subscriptions[entity] && null !== exchange.subscriptions[entity].timestamp)
            {
                exchangeSubscriptions[entity] = {
                    timestamp:exchange.subscriptions[entity].timestamp,
                    pairs:{}
                };
                _.forEach(exchange.subscriptions[entity].pairs, (entry, pair) => {
                    exchangeSubscriptions[entity].pairs[pair] = {timestamp:entry.timestamp};
                });
            }
        });
        if (!_.isEmpty(exchangeSubscriptions))
        {
            subscriptions[exchangeId] = exchangeSubscriptions;
        }
    });
    return subscriptions;
}

/**
 * Enable session expiry
 *
 * @param {integer} timeout, new session timeout (optional, current value will be used if not set)
 * @return {boolean} true if expiry was disabled, false otherwise
 */
enableExpiry(timeout)
{
    // expiry cannot be changed for non-rpc sessions
    if (!this._isRpc)
    {
        return false;
    }
    if (undefined === timeout)
    {
        timeout = this._timeout;
    }
    let store = false;
    if (this._expires && timeout != this._timeout)
    {
        // nothing to do
        return true;
    }
    this._expires = true;
    this._timeout = timeout;
    if (_.isEmpty(this._sockets))
    {
        this._startExpiryTimer();
    }
    if (debug.enabled)
    {
        debug(`Expiry changed to ${timeout}s for session '${this._sid}'`);
    }
    this._store();
    return true;
}

/**
 * Disable session expiry
 *
 * @return {boolean} true if expiry was disabled, false otherwise
 */
disableExpiry()
{
    // expiry cannot be disabled for non-rpc sessions
    if (!this._isRpc)
    {
        return false;
    }
    let store = false;
    if (this._expires)
    {
        store = true;
    }
    this._expires = false;
    this._expiresAt = null;
    if (null !== this._expiryTimer)
    {
        clearTimeout(this._expiryTimer);
    }
    if (store)
    {
        this._store();
    }
    return true;
}

/**
 * @return {string} session id
 */
getSid()
{
    return this._sid;
}

/**
 * @return {float} creation timestamp
 */
getTimestamp()
{
    return this._timestamp;
}

toHash()
{
    let obj = this._toHash();
    obj.subscriptions = this.getSubscriptions();
    obj.connections = [];
    _.forEach(this._sockets, (ws, id) => {
        obj.connections.push({
            id:id,
            openTimestamp:ws._timestamp,
            ipaddr:ws._clientIpaddr
        });
    });
    return obj;
}

/**
 * Export simple properties
 */
_toHash()
{
    let obj = {
        sid:this._sid,
        isRpc:this._isRpc,
        creationTimestamp:this._timestamp,
        expires:this._expires,
        timeout:0,
        expiryTimestamp:this._expiresAt
    }
    if (obj.expires)
    {
        obj.timeout = this._timeout;
    }
    return obj;
}

/*
 * Registers a new WS client connection. Destroy timer will be cancelled.
 *
 * @param {object} ws WebSocket object
 * @param {string} path route path (only defined if session is not RPC)
 */
registerSocket(ws, path)
{
    let firstSocket = 1 == this._nextSocketId;
    if (undefined !== ws._socketId)
    {
        if (undefined !== this._sockets[ws._socketId])
        {
            return true;
        }
        // this should not happen
        logger.error("Trying to re-register unknown socket '%d' for session '%s'", ws._socketId, this._sid);
        ws.terminate();
        return false;
    }
    if (!this._isRpc)
    {
        if (!firstSocket)
        {
            logger.error("Cannot register multiple sockets for non-RPC session : sid = '%s'", this._sid);
            ws.terminate();
            return false;
        }
    }
    ws._socketId = this._nextSocketId++;
    if (!firstSocket)
    {
        this._isNew = false;
    }
    if (this._isRpc)
    {
        let msg = `Got new connection for RPC session '${this._sid}' : ipaddr = '${ws._clientIpaddr}'`;
        logger.info(msg);
        if (debug.enabled)
        {
            debug(msg);
        }
    }
    else
    {
        let msg = `Got new connection for non-RPC session '${this._sid}' (${path}) : ipaddr = '${ws._clientIpaddr}'`;
        logger.info(msg);
        if (debug.enabled)
        {
            debug(msg);
        }
    }

    this._sockets[ws._socketId] = ws;
    this._socketsCount = Object.keys(this._sockets).length;
    let self = this;

    // define a timer to detect disconnection
    ws._isAlive = false;
    const timer = setInterval(function() {
        if (WebSocket.OPEN != ws.readyState)
        {
            clearTimeout(timer);
            return;
        }
        if (!ws._isAlive)
        {
            if ('debug' == logger.level)
            {
                logger.debug("Got timeout for WS %s/%d", self._sid, ws._socketId);
            }
            clearTimeout(timer);
            ws.terminate();
            return;
        }
        ws._isAlive = false;
        ws.ping('', false, true);
    }, PING_TIMEOUT);

    // ping / pong
    ws.on('pong', function(){
        this._isAlive = true;
    });

    ws.on('ping', function(){
        this.pong('', false, true);
    });

    // handle disconnection
    ws.on('close', function(code, reason){
        self._unregisterSocket.call(self, this);
    });

    // initial ping
    ws.ping('', false, true);

    // process message, send hello & disable expiry
    if (this._isRpc)
    {
        ws._messageId = {};

        // remove expiry timer
        if (null !== this._expiryTimer)
        {
            this._expiresAt = null;
            clearTimeout(this._expiryTimer);
        }

        ws.on('message', function(msg) {
            self._processMessage.call(self, ws, msg);
        });

        // send hello message
        RpcHelper.sendHello(ws, this._sid, this._isNew);
    }
    this._subscribe();
    return true;
}

/**
 * Called when a WS client connection is closed. Unregistering the last WS connection of a session will trigger the destroy timer (unless session is supposed to never expire)
 *
 * @param {object} ws WebSocket object
 */
_unregisterSocket(ws)
{
    if (undefined === this._sockets[ws._socketId])
    {
        return;
    }
    delete this._sockets[ws._socketId];
    this._socketsCount = Object.keys(this._sockets).length;
    if (debug.enabled)
    {
        debug(`Unregistering socket '${ws._socketId}' (${ws._clientIpaddr}) from session '${this._sid}' : ${this._socketsCount} sockets remaining`);
    }
    // destroy session immediately
    if (!this._isRpc)
    {
        if (debug.enabled)
        {
            debug(`Session '${this._sid}' will be destroyed immediately`);
        }
        this.destroy();
        return;
    }
    // no more sockets ?
    if (0 == this._socketsCount)
    {
        // cancel subscriptions on exchange (they will be automatically recreated on next connection)
        this.unsubscribe();
        // only if session is supposed to expire
        if (this._expires)
        {
            if (null !== this._expiryTimer)
            {
                clearTimeout(this._expiryTimer);
            }
            let timestamp = (new Date().getTime()) / 1000.0;
            this._expiresAt = timestamp + this._timeout * 1000;
            let self = this;
            if (debug.enabled)
            {
                debug(`Session '${this._sid}' will be destroyed in ${this._timeout}s`)
            }
            // start timer
            this._expiryTimer = this._startExpiryTimer(this._timeout);
        }
    }
}

_startExpiryTimer()
{
    let self = this;
    if (null !== this._expiryTimer)
    {
        clearTimeout(this._expiryTimer);
    }
    this._expiryTimer = setTimeout(function(){
        if (debug.enabled)
        {
            debug(`Session '${self._sid}' will be destroyed now`);
        }
        self.destroy.call(self);
    }, this._timeout * 1000);
}

/**
 * Forwards an event to all connected ws
 *
 * @param {string} name event name
 * @param {object} evt event to forward
 */
_forwardEvent(name, evt)
{
    _.forEach(this._sockets, (ws, id) => {
        RpcHelper.sendNotification(ws, name, evt);
    });
}

/**
 * Destroy session
 *
 * Subscriptions will be automatically cancelled
 */
destroy()
{
    this._destroyed = true;
    this._removeListeners();
    this.unsubscribe();
    // close sockets
    _.forEach(this._sockets, (ws, id) => {
        ws.terminate();
    });
    // remove session from storage
    storage.removeSession(this._sid);
    // emit event so that SessionRegistry can remove us from the list
    this.emit('destroyed');
}

_processMessage(ws, msg)
{
    let obj = RpcHelper.parse(ws, msg);
    // parse error or invalid request
    if (null === obj)
    {
        return false;
    }
    try
    {
        // if we already received same id previously, return an error
        if (null !== obj.i)
        {
            if (undefined !== ws._messageId[obj.i])
            {
                RpcHelper.replyErrorInvalidRequest(ws, obj, `Same id already exists for another message received at '${ws._messageId[obj.i]}'`);
                return;
            }
            let timestamp = (new Date().getTime()) / 1000.0;
            ws._messageId[obj.i] = timestamp;
        }
        // process message
        switch (obj.m)
        {
            case 'getpairs':
                return this._handleGetPairs(obj, ws);
            case 'subscribetotickers':
                return this._handleSubscribeToTickers(obj, ws);
            case 'unsubscribefromtickers':
                return this._handleUnsubscribeFromTickers(obj, ws);
            case 'unsubscribefromalltickers':
                return this._handleUnsubscribeFromAllTickers(obj, ws);
            case 'subscribetoorderbooks':
                return this._handleSubscribeToOrderBooks(obj, ws);
            case 'unsubscribefromorderbooks':
                return this._handleUnsubscribeFromOrderBooks(obj, ws);
            case 'unsubscribefromallorderbooks':
                return this._handleUnsubscribeFromAllOrderBooks(obj, ws);
            case 'resyncorderbooks':
                return this._handleResyncOrderBooks(obj, ws);
            case 'subscribetotrades':
                return this._handleSubscribeToTrades(obj, ws);
            case 'unsubscribefromtrades':
                return this._handleUnsubscribeFromTrades(obj, ws);
            case 'unsubscribefromalltrades':
                return this._handleUnsubscribeFromAllTrades(obj, ws);
            default:
                let msg = `RPC method '${obj.m}' does not exist`
                logger.warn(msg);
                RpcHelper.replyErrorInvalidMethod(ws, obj, msg);
                return false;
        }
    }
    catch (e)
    {
        logger.error(e.stack);
        RpcHelper.replyErrorInternal(ws, obj, 'An error occured');
        return false;
    }
}

/**
 * Ensures requested exchange exists and has requested features enabled
 *
 * In case exchange does not exist or has as missing feature, an error will be sent to websocket
 *
 * @param {object} obj message received on socket
 * @param {object} ws client websocket
 * @param {array} features exchange features
 * @return {boolean} true if exchange exists and has all features, false otherwise
 */
_checkExchange(obj, ws, features)
{
    if (undefined === obj.p.exchange)
    {
        RpcHelper.replyErrorInvalidParams(ws, obj, "Missing 'exchange' parameter");
        return false;
    }
    let exchange = serviceRegistry.getExchange(obj.p.exchange);
    // exchange does not exist
    if (null === exchange)
    {
        RpcHelper.replyErrorInvalidParams(ws, obj, `'${obj.p.exchange}' exchange is not supported`);
        return false;
    }
    obj._exchange = exchange;
    let result = true;
    if (undefined !== features)
    {
        _.forEach(features, (f) => {
            if (undefined === obj._exchange.features[f])
            {
                result = false;
                RpcHelper.replyErrorInvalidParams(ws, obj, `Feature '${f}' is not supported by '${obj.p.exchange}' exchange`);
                return false;
            }
        });
    }
    return result;
}

/**
 * Ensures all requested pairs exist
 *
 * In case one of the pairs does not exist, an error will be sent to websocket and promise will resolve to false
 *
 * @param {object} obj message received on socket
 * @param {object} ws client websocket
 * @return {Promise} Promise will resolve to 'true' on success and 'false' on error (it will never reject)
 */
_checkPairs(obj, ws)
{
    return new Promise((resolve, reject) => {
        if (undefined === obj.p.pairs)
        {
            RpcHelper.replyErrorInvalidParams(ws, obj, "Missing 'pairs' parameter");
            resolve(false);
            return;
        }
        if (!Array.isArray(obj.p.pairs))
        {
            RpcHelper.replyErrorInvalidParams(ws, obj, "Parameter 'pairs' should be an array");
            resolve(false);
            return;
        }
        let self = this;
        obj._exchange.instance.pairs({useCache:true}).then(function(data){
            let result = true;
            _.forEach(obj.p.pairs, (pair, index) => {
                if ('string' != typeof pair)
                {
                    result = false;
                    RpcHelper.replyErrorInvalidParams(ws, obj, `Parameter 'pairs[${index}]' should be a string`);
                    return false;
                }
                if (undefined === data[pair])
                {
                    result = false;
                    RpcHelper.replyErrorInvalidParams(ws, obj, `Pair '${pair}' is not supported by '${obj.p.exchange}' exchange`);
                    return false;
                }
            });
            resolve(result);
        }).catch (function(err){
            RpcHelper.replyErrorInternal(ws, obj, undefined, err);
            resolve(false);
        });
    });
}

/**
 * Ensures exchange and all requested pairs exist
 *
 * In case of error, an error will be sent to websocket and promise will resolve to false
 *
 * @param {object} obj message received on socket
 * @param {object} ws client websocket
 * @param {array} features exchange features
 * @return {Promise} Promise will resolve to 'true' on success and 'false' on error (it will never reject)
 */
_checkExchangeAndPairs(obj, ws, features)
{
    if (!this._checkExchange(obj, ws, features))
    {
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
    return this._checkPairs(obj, ws);
}

//-- Management of subscriptions (methods will be triggered by message handlers & REST API)

/**
 * Returns an object describing exchange subscriptions
 */
_getExchange(exchangeId)
{
    // initialize subscriptions for this exchange
    if (undefined === this._exchanges[exchangeId])
    {
        let self = this;
        let obj = serviceRegistry.getExchange(exchangeId);
        if (null === obj)
        {
            return null;
        }
        let manager = obj.instance.getSubscriptionManager();
        let exchange = {
            manager:manager,
            listeners:{},
            subscriptions:{
                tickers:{
                    pairs:{},
                    timestamp:null
                },
                orderBooks:{
                    pairs:{},
                    timestamp:null
                },
                trades:{
                    pairs:{},
                    timestamp:null
                }
            }
        }
        //-- define event callbacks
        // ticker callback
        exchange.listeners['ticker'] = function(evt){
            // ignore if we don't support this pair
            if (undefined === exchange.subscriptions.tickers.pairs[evt.pair])
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Received 'ticker' event from exchange '${evt.exchange}' for pair '${evt.pair}' : ${JSON.stringify(evt.data)}`)
            }
            self._forwardEvent.call(self, 'ticker', evt);
        };
        manager.addListener('ticker', exchange.listeners['ticker']);

        // orderBook callback
        exchange.listeners['orderBook'] = function(evt){
            // ignore if we don't support this pair
            if (undefined === exchange.subscriptions.orderBooks.pairs[evt.pair])
            {
                return;
            }
            if (debug.enabled)
            {
                let obj = {
                    cseq:evt.cseq,
                    buySize:evt.data.buy.length,
                    sellSize:evt.data.sell.length
                }
                debug(`Received 'orderBook' event from exchange '${evt.exchange}' for pair '${evt.pair}' : ${JSON.stringify(obj)}`);
            }
            self._forwardEvent.call(self, 'orderBook', evt);
        };
        manager.addListener('orderBook', exchange.listeners['orderBook']);

        // orderBookUpdate callback
        exchange.listeners['orderBookUpdate'] = function(evt){
            // ignore if we don't support this pair
            if (undefined === exchange.subscriptions.orderBooks.pairs[evt.pair])
            {
                return;
            }
            if (debug.enabled)
            {
                let obj = {
                    cseq:evt.cseq,
                    buySize:evt.data.buy.length,
                    sellSize:evt.data.sell.length
                }
                debug(`Received 'orderBookUpdate' event from exchange '${evt.exchange}' for pair '${evt.pair}' : ${JSON.stringify(obj)}`);
            }
            self._forwardEvent.call(self, 'orderBookUpdate', evt);
        };
        manager.addListener('orderBookUpdate', exchange.listeners['orderBookUpdate']);

        // trades callback
        exchange.listeners['trades'] = function(evt){
            // ignore if we don't support this pair
            if (undefined === exchange.subscriptions.trades.pairs[evt.pair])
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Received 'trades' event from exchange '${evt.exchange}' for pair '${evt.pair}' : ${evt.data.length} trades`);
            }
            self._forwardEvent.call(self, 'trades', evt);
        };
        manager.addListener('trades', exchange.listeners['trades']);

        this._exchanges[exchangeId] = exchange;
    }
    return this._exchanges[exchangeId];
}

/**
 * Remove all defined listeners, for all exchanges
 */
_removeListeners()
{
    _.forEach(this._exchanges, (exchange, id) => {
        _.forEach(exchange.listeners, (cb, eventName) => {
            exchange.manager.removeListener(eventName, cb);
        })
    });
}

/**
 * Used to ensure we unsubscribe from exchanges when session is destroyed
 *
 * @param {string} opt.exchangeId used to unsubscribe only for a given exchange (optional)
 * @param {boolean} opt.remove if true subscription will be removed (optional, default = false)
 */
unsubscribe(opt)
{
    let options = {remove:false}
    if (undefined !== opt)
    {
        if (undefined !== opt && true === opt.remove)
        {
            options.remove = true;
        }
        if (undefined !== opt.exchangeId)
        {
            options.exchangeId = opt.exchangeId;
        }
    }
    _.forEach(this._exchanges, (exchange, id) => {
        if (undefined !== options.exchangeId)
        {
            if (options.exchangeId != id)
            {
                return;
            }
        }
        let timestamp = (new Date().getTime()) / 1000.0;
        _.forEach(exchange.subscriptions, (entry, entity) => {
            let pairs = Object.keys(entry.pairs);
            // no pairs, do nothing
            if (0 == pairs.length)
            {
                return;
            }
            switch (entity)
            {
                case 'tickers':
                    exchange.manager.updateTickersSubscriptions(this._sid, [], pairs, false);
                    if (options.remove)
                    {
                        entry.pairs = {};
                        entry.timestamp = timestamp;
                    }
                    break;
                case 'orderBooks':
                    exchange.manager.updateOrderBooksSubscriptions(this._sid, [], pairs, false);
                    if (options.remove)
                    {
                        entry.pairs = {};
                        entry.timestamp = timestamp;
                    }
                    break;
                case 'trades':
                    exchange.manager.updateTradesSubscriptions(this._sid, [], pairs, false);
                    if (options.remove)
                    {
                        entry.pairs = {};
                        entry.timestamp = timestamp;
                    }
                    break;
            }
        })
    });
}

/**
 * Subscribe to exchanges (will be call for each new websocket)
 */
_subscribe()
{
    _.forEach(this._exchanges, (exchange, id) => {
        _.forEach(exchange.subscriptions, (entry, entity) => {
            let pairs = Object.keys(entry.pairs);
            // no pairs, do nothing
            if (0 == pairs.length)
            {
                return;
            }
            switch (entity)
            {
                case 'tickers':
                    exchange.manager.updateTickersSubscriptions(this._sid, pairs, [], true);
                    break;
                case 'orderBooks':
                    exchange.manager.updateOrderBooksSubscriptions(this._sid, pairs, [], pairs, true);
                    break;
                case 'trades':
                    exchange.manager.updateTradesSubscriptions(this._sid, pairs, [], true);
                    break;
            }
        })
    });
}

/*
 * The result of being lazy
 */
_debugChanges(entity, changes)
{
    try
    {
        let stack = new Error().stack;
        let line = stack.split('\n')[2];
        let method = line.replace(/^.* at [a-zA-Z0-9_.][a-zA-Z0-9_]*\.([a-zA-Z0-9_]+).*$/, '$1');
        debug(`Method '${method}' will trigger following '${entity}' changes : ${JSON.stringify(changes)}`);
    }
    catch (e)
    {
        return;
    }
}

_initializeTickersPair(timestamp)
{
    return {timestamp:timestamp};
}

/**
 * Subscribe to tickers stream for a list of pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 * @param {array} pairs array of pairs (X-Y) to subscribe to
 * @param {boolean} reset if true, all existing subscription will be discarded and replaced by new ones (optional, default = false)
 * @param {boolean} connect whether or not connection with exchange should be established if necessary (optional, default = true)
 */
subscribeToTickers(exchangeId, pairs, reset, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    // ensure connection is made if we have at least one connected client
    if (!connect && 0 != this._socketsCount)
    {
        connect = true;
    }
    let exchange = this._getExchange(exchangeId);
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    }
    let updated = false;
    if (true === reset)
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            if (undefined !== exchange.subscriptions.tickers.pairs[p])
            {
                pairDict[p] = exchange.subscriptions.tickers.pairs[p];
            }
            else
            {
                pairDict[p] = this._initializeTickersPair(timestamp);
                changes.subscribe.push(p);
                updated = true;
            }
        });
        // check if we have to unsubscribe
        _.forEach(exchange.subscriptions.tickers.pairs, (entry, p) => {
            if (undefined === pairDict[p])
            {
                changes.unsubscribe.push(p)
                updated = true;
            }
        });
        exchange.subscriptions.tickers.pairs = pairDict;
    }
    else
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            if (undefined !== exchange.subscriptions.tickers.pairs[p])
            {
                pairDict[p] = exchange.subscriptions.tickers.pairs[p];
            }
            else
            {
                pairDict[p] = this._initializeTickersPair(timestamp);
                changes.subscribe.push(p);
                updated = true;
            }
        });
        // add existing subscriptions
        _.forEach(exchange.subscriptions.tickers.pairs, (entry, p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            pairDict[p] = entry;
        });
        exchange.subscriptions.tickers.pairs = pairDict;
    }
    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges('tickers', changes);
        }
        exchange.subscriptions.tickers.timestamp = timestamp;
        // store session
        this._store();
        exchange.manager.updateTickersSubscriptions(this._sid, changes.subscribe, changes.unsubscribe, connect);
    }
}

/**
 * Unsubscribe from tickers stream for a list of pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 * @param {array} pairs array of pairs (X-Y) to unsubscribe from
 */
 unsubscribeFromTickers(exchangeId, pairs)
 {
     let exchange = this._getExchange(exchangeId);
     let timestamp = (new Date().getTime()) / 1000.0;
     let changes = {
         unsubscribe:[]
     };
     let updated = false;
     // check if we have to unsubscribe
     let pairDict = {};
     _.forEach(pairs, (p) => {
         if (undefined !== pairDict[p])
         {
             return;
         }
         pairDict[p] = true;
         if (undefined !== exchange.subscriptions.tickers.pairs[p])
         {
             changes.unsubscribe.push(p);
             updated = true;
             delete exchange.subscriptions.tickers.pairs[p];
         }
     });
     if (updated)
     {
         if (debug.enabled)
         {
             this._debugChanges('tickers', changes);
         }
         exchange.subscriptions.tickers.timestamp = timestamp;
         // store session
         this._store();
         exchange.manager.updateTickersSubscriptions(this._sid, [], changes.unsubscribe, false);
     }
 }

/**
 * Unsubscribe from tickers stream for all currently subscribed pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 */
unsubscribeFromAllTickers(exchangeId)
{
    let exchange = this._getExchange(exchangeId);
    let pairs = Object.keys(exchange.subscriptions.tickers.pairs);
    this.unsubscribeFromTickers(exchangeId, pairs);
}

_initializeOrderBooksPair(timestamp)
{
    return {timestamp:timestamp};
}

/**
 * Subscribe to order books stream for a list of pairs
 *
 * @param {string} exchangeId exchange id (method assumes exchange exists, pairs & necessary features are supported)
 * @param {array} pairs array of pairs (X-Y) or objects {pair:string,resync:boolean} to subscribe to
 * @param {boolean} reset if true, all existing subscription will be discarded and replaced by new ones (optional, default = false)
 * @param {boolean} connect whether or not connection with exchange should be established if necessary (optional, default = true)
 */
subscribeToOrderBooks(exchangeId, pairs, reset, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    // ensure connection is made if we have at least one connected client
    if (!connect && 0 != this._socketsCount)
    {
        connect = true;
    }
    let exchange = this._getExchange(exchangeId);
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[],
        resync:[]
    }
    let updated = false;
    if (true === reset)
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            let pair = p;
            let resync = false;
            if ('object' == typeof p)
            {
                if (undefined === p.pair)
                {
                    return;
                }
                pair = p.pair;
                if (undefined !== p.resync && true === p.resync)
                {
                    resync = true;
                }
            }
            if (undefined !== pairDict[pair])
            {
                return;
            }
            // no subscription for this pair yet
            if (undefined === exchange.subscriptions.orderBooks.pairs[pair])
            {
                pairDict[pair] = this._initializeOrderBooksPair(timestamp);
                changes.subscribe.push(pair);
                changes.resync.push(pair);
                updated = true;
            }
            else
            {
                pairDict[pair] = exchange.subscriptions.orderBooks.pairs[pair];
                if (resync)
                {
                    changes.resync.push(pair);
                }
            }
        });
        // check if we have to unsubscribe
        _.forEach(exchange.subscriptions.orderBooks.pairs, (entry, p) => {
            if (undefined === pairDict[p])
            {
                changes.unsubscribe.push(p)
                updated = true;
            }
        });
        exchange.subscriptions.orderBooks.pairs = pairDict;
    }
    else
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            let pair = p;
            let resync = false;
            if ('object' == typeof p)
            {
                if (undefined === p.pair)
                {
                    return;
                }
                pair = p.pair;
                if (undefined !== p.resync && true === p.resync)
                {
                    resync = true;
                }
            }
            if (undefined !== pairDict[pair])
            {
                return;
            }
            // no subscription for this pair yet
            if (undefined === exchange.subscriptions.orderBooks.pairs[pair])
            {
                pairDict[pair] = this._initializeOrderBooksPair(timestamp);
                changes.subscribe.push(pair);
                if (connect)
                {
                    changes.resync.push(pair);
                }
                updated = true;
            }
            else
            {
                pairDict[pair] = exchange.subscriptions.orderBooks.pairs[pair];
                if (resync && connect)
                {
                    changes.resync.push(pair);
                }
            }
        });
        // add existing subscriptions
        _.forEach(exchange.subscriptions.orderBooks.pairs, (entry, p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            pairDict[p] = entry;
        });
        exchange.subscriptions.orderBooks.pairs = pairDict;
    }
    if (updated || 0 != changes.resync.length)
    {
        if (debug.enabled)
        {
            this._debugChanges('orderBooks', changes);
        }
        if (updated)
        {
            exchange.subscriptions.orderBooks.timestamp = timestamp;
            // store session
            this._store();
        }
        exchange.manager.updateOrderBooksSubscriptions(this._sid, changes.subscribe, changes.unsubscribe, changes.resync, connect);
    }
}

/**
 * Unsubscribe from order books stream for a list of pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchange exchange id
 * @param {array} pairs array of pairs (X-Y) to unsubscribe from
 */
unsubscribeFromOrderBooks(exchangeId, pairs)
{
    let exchange = this._getExchange(exchangeId);
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        unsubscribe:[]
    };
    let updated = false;
    // check if we have to unsubscribe
    let pairDict = {};
    _.forEach(pairs, (p) => {
        if (undefined !== pairDict[p])
        {
            return;
        }
        pairDict[p] = true;
        if (undefined !== exchange.subscriptions.orderBooks.pairs[p])
        {
            changes.unsubscribe.push(p);
            updated = true;
            delete exchange.subscriptions.orderBooks.pairs[p];
        }
    });
    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges('orderBooks', changes);
        }
        exchange.subscriptions.orderBooks.timestamp = timestamp;
        // store session
        this._store();
        exchange.manager.updateOrderBooksSubscriptions(this._sid, [], changes.unsubscribe, [], false);
    }
}

/**
 * Unsubscribe from order books stream for all currently subscribed pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 */
unsubscribeFromAllOrderBooks(exchangeId)
{
    let exchange = this._getExchange(exchangeId);
    let pairs = Object.keys(exchange.subscriptions.orderBooks.pairs);
    this.unsubscribeFromOrderBooks(exchangeId, pairs);
}

resyncOrderBooks(exchangeId, pairs)
{
    let exchange = this._getExchange(exchangeId);
    let changes = {
        resync:[]
    }
    let updated = false;
    let pairDict = {};
    // check if we have subscriptions
    _.forEach(pairs, (p) => {
        if (undefined !== pairDict[p])
        {
            return;
        }
        // ignore if we don't have any subscription for this pair
        if (undefined === exchange.subscriptions.orderBooks.pairs[p])
        {
            return;
        }
        pairDict[p] = true;
        changes.resync.push(p);
        updated = true;
    });
    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges('orderBooks', changes);
        }
        // do nothing if we don't have any socket
        if (0 != this._socketsCount)
        {
            exchange.manager.resyncOrderBooks(changes.resync);
        }
    }
}

_initializeTradesPair(timestamp)
{
    return {timestamp:timestamp};
}

/**
 * Subscribe to trades stream for a list of pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 * @param {array} pairs array of pairs (X-Y) to subscribe to
 * @param {boolean} reset if true, all existing subscription will be discarded and replaced by new ones (optional, default = false)
 * @param {boolean} connect whether or not connection with exchange should be established if necessary (optional, default = true)
 */
subscribeToTrades(exchangeId, pairs, reset, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    // ensure connection is made if we have at least one connected client
    if (!connect && 0 != this._socketsCount)
    {
        connect = true;
    }
    let exchange = this._getExchange(exchangeId);
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    }
    let updated = false;
    if (true === reset)
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            if (undefined === pairDict[p])
            {
                if (undefined !== exchange.subscriptions.trades.pairs[p])
                {
                    pairDict[p] = exchange.subscriptions.trades.pairs[p];
                }
                else
                {
                    pairDict[p] = this._initializeTradesPair(timestamp);
                    changes.subscribe.push(p);
                    updated = true;
                }
            }
        });
        // check if we have to unsubscribe
        _.forEach(exchange.subscriptions.trades.pairs, (entry, p) => {
            if (undefined === pairDict[p])
            {
                changes.unsubscribe.push(p)
                updated = true;
            }
        });
        exchange.subscriptions.trades.pairs = pairDict;
    }
    else
    {
        let pairDict = {};
        // check if we have to subscribe
        _.forEach(pairs, (p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            if (undefined !== exchange.subscriptions.trades.pairs[p])
            {
                pairDict[p] = exchange.subscriptions.trades.pairs[p];
            }
            else
            {
                pairDict[p] = this._initializeTradesPair(timestamp);
                changes.subscribe.push(p);
                updated = true;
            }
        });
        // add existing subscriptions
        _.forEach(exchange.subscriptions.trades.pairs, (entry, p) => {
            if (undefined !== pairDict[p])
            {
                return;
            }
            pairDict[p] = entry;
        });
        exchange.subscriptions.trades.pairs = pairDict;
    }
    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges('trades', changes);
        }
        exchange.subscriptions.trades.timestamp = timestamp;
        // store session
        this._store();
        exchange.manager.updateTradesSubscriptions(this._sid, changes.subscribe, changes.unsubscribe, connect);
    }
}

/**
 * Unsubscribe from trades stream for a list of pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchange exchange id
 * @param {array} pairs array of pairs (X-Y) to unsubscribe from
 */
unsubscribeFromTrades(exchangeId, pairs)
{
    let exchange = this._getExchange(exchangeId);
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        unsubscribe:[]
    };
    let updated = false;
    // check if we have to unsubscribe
    let pairDict = {};
    _.forEach(pairs, (p) => {
        if (undefined !== pairDict[p])
        {
            return;
        }
        pairDict[p] = true;
        if (undefined !== exchange.subscriptions.trades.pairs[p])
        {
            changes.unsubscribe.push(p);
            updated = true;
            delete exchange.subscriptions.trades.pairs[p];
        }
    });
    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges('trades', changes);
        }
        exchange.subscriptions.trades.timestamp = timestamp;
        // store session
        this._store();
        // do nothing if we don't have any socket (unless session has been destroyed)
        if (0 != this._socketsCount || this._destroyed)
        {
            exchange.manager.updateTradesSubscriptions(this._sid, [], changes.unsubscribe, false);
        }
    }
}

/**
 * Unsubscribe from trades stream for all currently subscribed pairs (method assumes exchange exists, pairs & necessary features are supported)
 *
 * @param {string} exchangeId exchange id
 */
unsubscribeFromAllTrades(exchangeId)
{
    let exchange = this._getExchange(exchangeId);
    let pairs = Object.keys(exchange.subscriptions.trades.pairs);
    this.unsubscribeFromTrades(exchangeId, pairs);
}

//-- WS message handlers
// pair retrieval
_handleGetPairs(obj, ws)
{
    if (!this._checkExchange(obj, ws))
    {
        return;
    }
    let self = this;
    obj._exchange.instance.pairs({useCache:true}).then(function(data){
        RpcHelper.replySuccess(ws, obj, data)
    }).catch (function(err){
        RpcHelper.replyErrorInternal(ws, obj, undefined, err);
    });
}

// subscribe to tickers
_handleSubscribeToTickers(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        let reset = false;
        if (undefined !== obj.p.reset && true === obj.p.reset)
        {
            reset = true;
        }
        self.subscribeToTickers.call(self, obj.p.exchange, obj.p.pairs, reset, true);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from tickers
_handleUnsubscribeFromTickers(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        self.unsubscribeFromTickers.call(self, obj.p.exchange, obj.p.pairs);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from all tickers
_handleUnsubscribeFromAllTickers(obj, ws)
{
    if (!this._checkExchange(obj, ws))
    {
        return;
    }
    this.unsubscribeFromAllTickers(obj.p.exchange);
    RpcHelper.replySuccess(ws, obj, true);
}

// subscribe to order books
_handleSubscribeToOrderBooks(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        let reset = false;
        if (undefined !== obj.p.reset && true === obj.p.reset)
        {
            reset = true;
        }
        let pairs = [];
        _.forEach(obj.p.pairs, (pair) => {
            pairs.push({pair:pair, resync:true});
        });
        self.subscribeToOrderBooks.call(self, obj.p.exchange, pairs, reset, true);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from order books
_handleUnsubscribeFromOrderBooks(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        self.unsubscribeFromOrderBooks.call(self, obj.p.exchange, obj.p.pairs);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from all order books
_handleUnsubscribeFromAllOrderBooks(obj, ws)
{
    if (!this._checkExchange(obj, ws))
    {
        return;
    }
    this.unsubscribeFromAllOrderBooks(obj.p.exchange);
    RpcHelper.replySuccess(ws, obj, true);
}

_handleResyncOrderBooks(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        self.resyncOrderBooks.call(self, obj.p.exchange, obj.p.pairs);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// subscribe to trades
_handleSubscribeToTrades(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        let reset = false;
        if (undefined !== obj.p.reset && true === obj.p.reset)
        {
            reset = true;
        }
        self.subscribeToTrades.call(self, obj.p.exchange, obj.p.pairs, reset, true);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from trades
_handleUnsubscribeFromTrades(obj, ws)
{
    let self = this;
    this._checkExchangeAndPairs(obj, ws).then(function(result){
        if (!result)
        {
            return;
        }
        self.unsubscribeFromTrades.call(self, obj.p.exchange, obj.p.pairs);
        RpcHelper.replySuccess(ws, obj, true);
    });
}

// unsubscribe from all trades
_handleUnsubscribeFromAllTrades(obj, ws)
{
    if (!this._checkExchange(obj, ws))
    {
        return;
    }
    this.unsubscribeFromAllTrades(obj.p.exchange);
    RpcHelper.replySuccess(ws, obj, true);
}

}

module.exports = Session;
