"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:Kucoin');
const logger = require('winston');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const StreamClientClass = require('./stream-client');

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 *
 * @param {object} exchange exchange instance
 */
constructor(exchange)
{
    super(exchange, {globalTickersSubscription:false, marketsSubscription:false});
    // Kucoin WS only provides access to order books update through WS, we need to use REST API to retrieve full order book
    this._waitingForFullOrderBooks = {};
    // keep track of last orderbook update
    this._orderBooksUpdates = {};
    this._client = null;
}

/**
 * Used to retrieve full order book and block order book updates until order book has been successfull retrieved
 *
 * @param {string} pair pair for which we want to block order book updates while we're retrieving order book
 */
_waitForFullOrderBook(pair)
{
    if (undefined === this._waitingForFullOrderBooks[pair])
    {
        this._waitingForFullOrderBooks[pair] = {requestId:0,timestamp:0,waiting:true,evt:null};
    }
    let requestId = ++this._waitingForFullOrderBooks[pair].requestId;
    this._waitingForFullOrderBooks[pair].waiting = true;
    this._waitingForFullOrderBooks[pair].evt = null;
    this._exchangeInstance.getOrderBook(pair, {custom:{includeTimestamp:true}}).then((data) => {
        // we have another pending request
        if (requestId != this._waitingForFullOrderBooks[pair].requestId)
        {
            return;
        }
        // if we already emitted an orderBookUpdate event which is newer, retrieve full order book again
        if (undefined !== this._orderBooksUpdates[pair] && data.timestamp <= this._orderBooksUpdates[pair])
        {
            this._waitForFullOrderBook(pair);
            return;
        }
        let evt = {
            exchange:this._exchangeId,
            pair:pair,
            data:{
                buy:data.buy,
                sell:data.sell
            }
        }
        this._waitingForFullOrderBooks[pair].timestamp = data.timestamp;
        this._waitingForFullOrderBooks[pair].waiting = false;
        this._waitingForFullOrderBooks[pair].evt = evt;
    }).catch ((err) => {
        logger.warn("Could not retrieve Kucoin order book for pair '%s' : err = '%s'", pair, err);
        // we have another pending request
        if (requestId != this._waitingForFullOrderBooks[pair].requestId)
        {
            return;
        }
        this._waitingForFullOrderBooks[pair].waiting = false;
    });
}

/*
 * This will be called automatically once markets have been retrieved
 */
_registerClient(connect)
{
    if (null !== this._client)
    {
        if (this._client.isConnected() || this._client.isConnecting())
        {
            return;
        }
        if (!connect)
        {
            return;
        }
        this._client.connect();
        return;
    }
    let client = new StreamClientClass(this._exchangeId);
    client.on('connected', () => {
        this._registerConnection('default', {uri:client.getUri()});
        this._processSubscriptions();
    });
    client.on('disconnected', () => {
        this._unregisterConnection('default');
        // nothing to do, reconnection will be automatic
    });
    // no more retry, we need to reconnect
    client.on('terminated', () => {
        this._unregisterConnection('default');
        client.reconnect(false);
    });
    client.on('ticker', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.tickers.pairs[evt.pair])
        {
            return;
        }
        evt.exchange = this._exchangeId;
        this.emit('ticker', evt);
    });
    client.on('orderBookUpdate', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        // whether or not full order book should be emitted first
        let emitFullOrderBook = false;
        // check if update should be ignored (ie: if we're waiting for full order book)
        if (undefined !== this._waitingForFullOrderBooks[evt.pair])
        {
            // order book not retrieved yet
            if (this._waitingForFullOrderBooks[evt.pair].waiting)
            {
                return;
            }
            // we're not interested in this update, it's too old
            if (evt.timestamp <= this._waitingForFullOrderBooks[evt.pair].timestamp)
            {
                return;
            }
            if (null !== this._waitingForFullOrderBooks[evt.pair].evt)
            {
                emitFullOrderBook = true;
            }
        }
        evt.exchange = this._exchangeId;
        this._orderBooksUpdates[evt.pair] = evt.timestamp;
        delete evt.timestamp;
        // check if we need to emit full orderbook first
        if (emitFullOrderBook)
        {
            this._waitingForFullOrderBooks[evt.pair].evt.cseq = evt.cseq - 1;
            this.emit('orderBook', this._waitingForFullOrderBooks[evt.pair].evt);
            this._waitingForFullOrderBooks[evt.pair].evt = null;
        }
        this.emit('orderBookUpdate', evt);
    });
    client.on('trades', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.trades.pairs[evt.pair])
        {
            return;
        }
        evt.exchange = this._exchangeId;
        this.emit('trades', evt);
    });
    if (connect)
    {
        client.connect();
    }
    this._client = client;
}

/**
 * Process subscription changes
 *
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 * @param {object} opt.client {entity:string,pair:string,client:object} (optional, only useful if exchange requires multiple stream clients) (will only be set upon WS connection/reconnection)
 *
 *  Each property (subscribe,unsubscribe,resync) is optional
 *  Entity can be (ticker,orderBook,trades)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...],
 *    "resync":[{"entity":"","pair":""},...]
 * }
 */
_processChanges(changes, opt)
{
    this._registerClient(opt.connect);

    //-- this is where we will forward subscriptions
    let messages = [];

    // unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            let message = this._client.getUnsubscribeMessage({type:entry.entity, pair:entry.pair});
            if (null === message)
            {
                return;
            }
            messages.push(message);
        });
    }

    // check if we need to resync order books
    let resyncOrderBooks = {};
    if (undefined !== changes.resync)
    {
        _.forEach(changes.resync, (entry) => {
            resyncOrderBooks[entry.pair] = true;
        });
    }
    _.forEach(Object.keys(resyncOrderBooks), (pair) => {
        let message = this._client.getSubscribeMessage({type:'orderBook', pair:pair});
        if (null === message)
        {
            return;
        }
        this._waitForFullOrderBook(pair);
        messages.push(message);
    });

    // subscribe
    if (undefined !== changes.subscribe)
    {
        _.forEach(changes.subscribe, (entry) => {
            let message = this._client.getSubscribeMessage({type:entry.entity, pair:entry.pair});
            if (null === message)
            {
                return;
            }
            messages.push(message);
        });
    }

    // do we need to disconnect client ?
    if (!this.hasSubscriptions())
    {
        if (this._client.isConnected() || this._client.isConnecting())
        {
            this._unregisterConnection('default');
            this._client.disconnect();
            return;
        }
    }
    else
    {
        if (opt.connect)
        {
            this._client.send(messages);
        }
    }
}

}

module.exports = SubscriptionManager;
