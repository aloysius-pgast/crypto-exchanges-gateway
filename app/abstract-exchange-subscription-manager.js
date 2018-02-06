"use strict";
const _ = require('lodash');
const EventEmitter = require('events');
const debug = require('debug')('CEG:ExchangeSubscriptionManager');
const AbstractExchangeClass = require('./abstract-exchange');

/**
 * Class which handles subscriptions to a single exchange
 *
 * It can emit following events (some events might not be available for all exchanges):
 *
 * - ticker (ticker update for a single pair)
 * - orderBook (full order book for a single pair)
 * - orderBookUpdate (order book update for a single pair)
 * - trades (new trades for a single pair)
 */

class AbstractExchangeSubscriptionManager extends EventEmitter
{

/**
 * Constructor
 *
 * @param {object} exchange Exchange instance
 * @param {boolean} opt.marketsSubscription indicates exchange support market subscription (ie: orderbook & trades at the same time) (optional, default = true)
 * @param {boolean} opt.globalTickersSubscription indicates exchange support a single subscription for all tickers (optional, default = true)
 */
constructor(exchange, options)
{
    if (!(exchange instanceof AbstractExchangeClass))
    {
        throw new Error("Parameter 'exchange' should be an 'AbstractExchange' instance")
    }
    super();
    this._globalTickersSubscription = true;
    this._marketsSubscription = true;
    if (undefined !== options)
    {
        if (undefined !== options.marketsSubscription && false === options.marketsSubscription)
        {
            this._marketsSubscription = false;
        }
        if (undefined !== options.globalTickersSubscription && false === options.globalTickersSubscription)
        {
            this._globalTickersSubscription = false;
        }
    }
    this._exchangeInstance = exchange;
    this._exchangeId = exchange.getId();
    this._subscriptions = {
        tickers:{
            timestamp:null,
            // indicates whether or not we're subscribed to global tickers
            subscribed:false,
            pairs:{},
            count:0
        },
        markets:{
            pairs:{},
            count:0
        },
        orderBooks:{
            timestamp:null,
            pairs:{},
            count:0
        },
        trades:{
            timestamp:null,
            pairs:{},
            count:0
        },
        klines:{
            timestamp:null,
            pairs:{},
            count:0
        }
    }
    // keep track of established connections
    this._connections = {}
}

toHash()
{
    let obj = this._toHash();
    obj.subscriptions = this.getSubscriptions();
    obj.connections = this.getConnections();
    return obj;
}

_toHash()
{
    let obj = {
        exchange:this._exchangeId
    }
    return obj;
}

/**
 * Called when a connection to the exchange has been successfully established
 *
 * @param {string} name connection name
 * @param {object} data connection data
 */
_registerConnection(name, data)
{
    if (undefined === data)
    {
        data = {};
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    this._connections[name] = {timestamp:timestamp,data:data};
}

/**
 * Called when a connection to the exchange has been closed
 *
 * @param {string} connection name
 */
_unregisterConnection(name)
{
    delete this._connections[name];
}

hasSubscriptions()
{
    return 0 != this._subscriptions.tickers.count || 0 != this._subscriptions.orderBooks.count ||
        0 != this._subscriptions.trades.count;
}

/*
 * The result of being lazy
 */
_debugChanges(changes)
{
    try
    {
        let stack = new Error().stack;
        let line = stack.split('\n')[2];
        let method = line.replace(/^.* at [a-zA-Z0-9_.][a-zA-Z0-9_]*\.([a-zA-Z0-9_]+).*$/, '$1');
        debug(`Method '${method}' will trigger following changes for '${this._exchangeId}' : ${JSON.stringify(changes)}`);
    }
    catch (e)
    {
        return;
    }
}

/**
 * Initialize tickers subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeTickersPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe/unsubscribe to tickers stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateTickersSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.tickers.pairs[p])
        {
            this._subscriptions.tickers.pairs[p] = this._initializeTickersPair(sessionId, timestamp);
            if (!this._globalTickersSubscription)
            {
                changes.subscribe.push({entity:'ticker',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.tickers.pairs[p].sessions[sessionId])
            {
                this._subscriptions.tickers.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.tickers.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.tickers.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.tickers.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.tickers.pairs[p].sessions))
        {
            delete this._subscriptions.tickers.pairs[p];
            if (!this._globalTickersSubscription)
            {
                changes.unsubscribe.push({entity:'ticker',pair:p});
            }
            updated = true;
        }
    });
    if (updated)
    {
        if (this._globalTickersSubscription)
        {
            // no more subscribed pairs ?
            if (_.isEmpty(this._subscriptions.tickers.pairs))
            {
                if (this._subscriptions.tickers.subscribed)
                {
                    this._subscriptions.tickers.subscribed = false;
                    changes.unsubscribe.push({entity:'tickers'})
                }
            }
            else
            {
                if (!this._subscriptions.tickers.subscribed)
                {
                    this._subscriptions.tickers.subscribed = true;
                    changes.subscribe.push({entity:'tickers'})
                }
            }
        }
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.tickers.timestamp = timestamp;
        this._subscriptions.tickers.count = Object.keys(this._subscriptions.tickers.pairs).length;
        this._processChanges(changes, {connect:connect});
    }
}

/**
 * Initialize order books subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeOrderBooksPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to order books stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {array} resync list of pairs to resync
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateOrderBooksSubscriptions(sessionId, subscribe, unsubscribe, resync, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[],
        resync:[]
    };
    let updated = false;

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.orderBooks.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.orderBooks.pairs[p].sessions))
        {
            delete this._subscriptions.orderBooks.pairs[p];
            if (this._marketsSubscription)
            {
                if (this._unsubscribeFromMarket(p))
                {
                    changes.unsubscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.unsubscribe.push({entity:'orderBook',pair:p});
            }
            updated = true;
        }
    });

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            this._subscriptions.orderBooks.pairs[p] = this._initializeOrderBooksPair(sessionId, timestamp);
            if (this._marketsSubscription)
            {
                if (this._subscribeToMarket(p, timestamp))
                {
                    changes.subscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.subscribe.push({entity:'orderBook',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
            {
                this._subscriptions.orderBooks.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process resync
    _.forEach(resync, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
        {
            return;
        }
        changes.resync.push({entity:'orderBook',pair:p});
    });

    if (updated || 0 != changes.resync.length)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        if (updated)
        {
            this._subscriptions.orderBooks.timestamp = timestamp;
        }
        this._subscriptions.orderBooks.count = Object.keys(this._subscriptions.orderBooks.pairs).length;
        this._subscriptions.markets.count = Object.keys(this._subscriptions.markets.pairs).length;
        this._processChanges(changes, {connect:connect});
    }
}

/**
 * Initialize trades subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeTradesPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to order books stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateTradesSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.trades.pairs[p])
        {
            this._subscriptions.trades.pairs[p] = this._initializeTradesPair(sessionId, timestamp);
            if (this._marketsSubscription)
            {
                if (this._subscribeToMarket(p, timestamp))
                {
                    changes.subscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.subscribe.push({entity:'trades',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.trades.pairs[p].sessions[sessionId])
            {
                this._subscriptions.trades.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.trades.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.trades.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.trades.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.trades.pairs[p].sessions))
        {
            delete this._subscriptions.trades.pairs[p];
            if (this._marketsSubscription)
            {
                if (this._unsubscribeFromMarket(p))
                {
                    changes.unsubscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.unsubscribe.push({entity:'trades',pair:p});
            }
            updated = true;
        }
    });

    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.trades.timestamp = timestamp;
        this._subscriptions.trades.count = Object.keys(this._subscriptions.trades.pairs).length;
        this._subscriptions.markets.count = Object.keys(this._subscriptions.markets.pairs).length;
        this._processChanges(changes, {connect:connect});
    }
}

/**
 * Initialize klines subscription
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeKlinesPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to klines stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs/intervals to subscribe to {pair:string,interval:string}
 * @param {array} unsubscribe list of pairs/intervals to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateKlinesSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (e) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.klines.pairs[e.pair])
        {
            this._subscriptions.klines.pairs[e.pair] = {};
        }
        // no subscription for this interval
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval])
        {
            this._subscriptions.klines.pairs[e.pair][e.interval] = this._initializeKlinesPair(sessionId, timestamp);
            changes.subscribe.push({entity:'klines',pair:e.pair,interval:e.interval});
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId])
            {
                this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (e) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.klines.pairs[e.pair])
        {
            return;
        }
        // no subscription for this interval
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.klines.pairs[e.pair][e.interval].sessions))
        {
            changes.unsubscribe.push({entity:'klines',pair:e.pair,interval:e.interval});
            delete this._subscriptions.klines.pairs[e.pair][e.interval];
            if (_.isEmpty(this._subscriptions.klines.pairs[e.pair]))
            {
                delete this._subscriptions.klines.pairs[e.pair];
            }
            updated = true;
        }
    });

    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.klines.timestamp = timestamp;
        this._subscriptions.klines.count = 0;
        _.forEach(this._subscriptions.klines.pairs, (e, p) => {
            this._subscriptions.klines.count += Object.keys(e).length
        });
        this._processChanges(changes, {connect:connect});
    }
}

/**
 * Returns true if a new subscription to this market should be setup (ie: if there is no existing subscription for orderBook or trades)
 */
_subscribeToMarket(pair, timestamp)
{
    // if exchange does not support market subscriptions, do nothing
    if (!this._marketsSubscription)
    {
        return false;
    }
    if (undefined !== this._subscriptions.markets.pairs[pair])
    {
        return false;
    }
    this._subscriptions.markets.pairs[pair] = {timestamp:timestamp};
    return true;
}

/**
 * Returns true if subscription to this market should be cancelled (ie: if no subscription for orderBook or trades exists)
 */
_unsubscribeFromMarket(pair)
{
    // if exchange does not support market subscriptions, do nothing
    if (!this._marketsSubscription)
    {
        return false;
    }
    // we still have one subscription
    if (undefined !== this._subscriptions.orderBooks.pairs[pair] || undefined !== this._subscriptions.trades.pairs[pair])
    {
        return false;
    }
    delete this._subscriptions.markets.pairs[pair];
    return true;
}

/**
 * List existing connections (ie: established connections to exchange)
 *
 * NB : 'data' property format is exchange dependant
 *
 * @return {object} {"name":{timestamp:float,data:{}}
 */
getConnections()
{
    let connections = {};
    _.forEach(this._connections, (entry, name) => {
        connections[name] = {timestamp:entry.timestamp,data:entry.data}
    });
    return connections;
}

/**
 * List existing subscriptions
 *
 * @return {object} {tickers:{},orderBooks:{},trades:{},klines:{}}
 */
getSubscriptions()
{
    let entities = ['tickers','orderBooks','trades','klines'];
    let subscriptions = {};
    _.forEach(entities, (entity) => {
        if (undefined !== this._subscriptions[entity] && null !== this._subscriptions[entity].timestamp)
        {
            subscriptions[entity] = {
                timestamp:this._subscriptions[entity].timestamp,
                pairs:{}
            }
            _.forEach(this._subscriptions[entity].pairs, (entry, pair) => {
                if ('klines' == entity)
                {
                    _.forEach(entry, (obj, interval) => {
                        if (undefined === subscriptions[entity].pairs[pair])
                        {
                            subscriptions[entity].pairs[pair] = {};
                        }
                        subscriptions[entity].pairs[pair][interval] = {timestamp:obj.timestamp};
                    });
                }
                else
                {
                    subscriptions[entity].pairs[pair] = {timestamp:entry.timestamp};
                }
            });
        }
    });
    return subscriptions;
}

/**
 * Process subscription changes
 *
 * Method should be overriden in children
 *
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 * @param {object} opt.client {entity:string,pair:string,client:object} (optional, only useful if exchange requires multiple stream clients) (will only be set upon WS connection/reconnection)
 *
 *  Each property (subscribe,unsubscribe,resync) is optional
 *  Entity can be (ticker,tickers,orderBook,trades,market)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...],
 *    "resync":[{"entity":"","pair":""},...]
 * }
 */
_processChanges(changes, opt)
{
    throw new Error('Override !');
}

/**
 * This method will be called upon reconnection and will call _processChanges
 *
 * @param {object} streamClientDescriptor {entity:string,pair:string,client:object} (optional, only useful if exchange requires multiple stream clients)
 */
_processSubscriptions(streamClientDescriptor)
{
    let changes = {
        subscribe:[]
    };
    _.forEach(this._subscriptions, (obj, entity) => {
        let key = entity;
        switch (entity)
        {
            case 'tickers':
                key = 'ticker';
                break;
            case 'orderBooks':
                key = 'orderBook';
                break;
            case 'markets':
                if (!this._marketsSubscription)
                {
                    return;
                }
                key = 'market';
                break;
        }
        _.forEach(obj.pairs, (entry, p) => {
            if ('klines' == key)
            {
                _.forEach(entry, (obj, interval) => {
                    changes.subscribe.push({entity:key,pair:p,interval:interval});
                });
            }
            else
            {
                changes.subscribe.push({entity:key,pair:p});
            }
        });
    });
    if (this._globalTickersSubscription)
    {
        if (this._subscriptions.tickers.subscribed)
        {
            changes.subscribe.push({entity:'tickers'});
        }
    }
    if (0 == changes.subscribe.length)
    {
        return;
    }
    this._processChanges(changes, {connect:true, client:streamClientDescriptor});
}

}

module.exports = AbstractExchangeSubscriptionManager;
