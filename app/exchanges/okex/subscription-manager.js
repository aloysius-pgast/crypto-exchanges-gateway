"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:OKEx');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const StreamClientClass = require('./stream-client');

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 */
constructor(exchange)
{
    super(exchange, {globalTickersSubscription:false, marketsSubscription:false});
    this._orderBooksCseq = {};
    this._lastTrades = {};
    this._client = null;
}

_initializeLastTrade(pair)
{
    if (undefined === this._lastTrades[pair])
    {
        this._lastTrades[pair] = {id:0};
    }
}

_resetLastTrade(pair)
{
    delete this._lastTrades[pair];
}

_initializeOrderBookCseq(pair)
{
    if (undefined === this._orderBooksCseq[pair])
    {
        this._orderBooksCseq[pair] = {lastCseq:0,waiting:false};
    }
}

_resetOrderBookCseq(pair)
{
    delete this._orderBooksCseq[pair];
}

/**
 * Used to retrieve full order book and block order book updates until order book has been successfull retrieved
 *
 * @param {string} pair pair for which we want to block order book updates while we're retrieving order book
 */
_waitForFullOrderBook(pair)
{
    this._orderBooksCseq[pair].waiting = true;
}

/**
 * Called once full order book has been retrieved, to unblock order book updates
 *
 * @param {string} pair pair for which we want to block order book updates while we're retrieving order book
 * @param {integer} cseq new full order book cseq
 */
_doneWaitingForFullOrderBook(pair, cseq)
{
    this._orderBooksCseq[pair].lastCseq = cseq;
    this._orderBooksCseq[pair].waiting = false;
}

/**
 * Indicates whether or not an order book update should be ignored
 *
 *  @param {string} pair pair to check
 *
 *  @return {boolean} true if we're waiting for full order book, false otherwise
 */
_shouldIgnoreOrderBookUpdate(pair)
{
    // order book not retrieve yet
    if (this._orderBooksCseq[pair].waiting)
    {
        return true;
    }
    return false;
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
    client.on('orderBook', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        let cseq = this._orderBooksCseq[evt.pair].lastCseq;
        if (0 == cseq)
        {
            cseq = Date.now();
        }
        else
        {
            ++cseq;
        }
        this._doneWaitingForFullOrderBook(evt.pair, cseq);
        evt.cseq = cseq;
        evt.exchange = this._exchangeId;
        this.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        let cseq = this._orderBooksCseq[evt.pair].lastCseq;
        if (0 == cseq)
        {
            cseq = Date.now();
        }
        else
        {
            ++cseq;
        }
        // check if update should to be ignored (ie: if we're waiting for full order book)
        if (this._shouldIgnoreOrderBookUpdate(evt.pair))
        {
            return;
        }
        this._orderBooksCseq[evt.pair].lastCseq = cseq;
        evt.cseq = cseq;
        evt.exchange = this._exchangeId;
        this.emit('orderBookUpdate', evt);
    });
    client.on('trades', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.trades.pairs[evt.pair])
        {
            return;
        }
        let minTimestamp = 0;
        let minTradeId = this._lastTrades[evt.pair].id;
        // if we don't have previous trade id, use subscription timestamp
        if (0 == minTradeId)
        {
            minTimestamp = this._subscriptions.trades.pairs[evt.pair].timestamp;
        }
        if (0 != evt.data.length)
        {
            // if oldest entry is <= last(trade).id or is < timestamp(subscription), we need to do some filtering
            if (evt.data[evt.data.length - 1].id <= minTradeId || evt.data[evt.data.length - 1].timestamp < minTimestamp)
            {
                let data = [];
                _.forEach(evt.data, (e) => {
                    if (e.id <= minTradeId || e.timestamp < minTimestamp)
                    {
                        return false;
                    }
                    data.push(e);
                });
                evt.data = data;
            }
        }
        evt.exchange = this._exchangeId;
        if (0 !== evt.data.length)
        {
            // update last trade id
            this._lastTrades[evt.pair].id = evt.data[0].id;
            this.emit('trades', evt);
        }
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
            switch (entry.entity)
            {
                case 'orderBook':
                    this._resetOrderBookCseq(entry.pair);
                    break;
                case 'trades':
                    this._resetLastTrade(entry.pair);
                    break;
            }
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
        this._initializeOrderBookCseq(pair);
        this._waitForFullOrderBook(pair);
        let message = this._client.getSubscribeMessage({type:'orderBook', pair:pair});
        if (null === message)
        {
            return;
        }
        messages.push(message);
    });

    // subscribe
    if (undefined !== changes.subscribe)
    {
        _.forEach(changes.subscribe, (entry) => {
            switch (entry.entity)
            {
                case 'orderBook':
                    this._initializeOrderBookCseq(entry.pair);
                    break;
                case 'trades':
                    this._initializeLastTrade(entry.pair);
                    break;
            }
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
