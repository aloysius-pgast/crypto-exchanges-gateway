"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:Poloniex');
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
    this._client = null;
    this._waitingForFullOrderBooks = {};
}

/**
 * Convert pair from exchange format Y_X to custom format X-Y
 *
 * @param {string} pair pair in exchange format (Y_X)
 * @return {string} pair in custom format (X-Y)
 */
_toCustomPair(pair)
{
    let arr = pair.split('_');
    return arr[1] + '-' + arr[0];
}


/**
 * Convert pair from custom format X-Y to exchange format Y_X
 * @param {string} pair pair in custom format (X-Y)
 * @return {string} pair in exchange format (Y_X)
 */
_toExchangePair(pair)
{
    let arr = pair.split('-');
    return arr[1] + '_' + arr[0];
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
        this._waitingForFullOrderBooks[pair] = {fullOrderBookCseq:0};
    }
    this._waitingForFullOrderBooks[pair].waiting = true;
}

/**
 * Called once full order book has been retrieved, to unblock order book updates
 *
 * @param {string} pair pair for which we want to block order book updates while we're retrieving order book
 * @param {integer} cseq new full order book cseq
 */
_doneWaitingForFullOrderBook(pair, cseq)
{
    if (undefined === this._waitingForFullOrderBooks[pair])
    {
        this._waitingForFullOrderBooks[pair] = {};
    }
    this._waitingForFullOrderBooks[pair].fullOrderBookCseq = cseq;
    this._waitingForFullOrderBooks[pair].waiting = false;
}

/**
 * Indicates whether or not an update should be ignore (if we're waiting for full order book or cseq is too old)
 *
 *  @param {string} pair pair to check
 *  @param {integer} updateCseq the cseq received in order book update
 *
 *  @return {boolean} true if we're waiting for full order book, false otherwise
 */
_shouldIgnoreOrderBookUpdate(pair, updateCseq)
{
    // not waiting for full order book
    if (undefined === this._waitingForFullOrderBooks[pair])
    {
        return false;
    }
    // order book not retrieve yet
    if (this._waitingForFullOrderBooks[pair].waiting)
    {
        return true;
    }
    // we're not interested in this update, it's too old
    if (updateCseq <= this._waitingForFullOrderBooks[pair].fullOrderBookCseq)
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
        this._doneWaitingForFullOrderBook(evt.pair, evt.cseq);
        evt.exchange = this._exchangeId;
        this.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', (evt) => {
        // ignore if we don't support this pair
        if (undefined === this._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        // check if update should to be ignored (ie: if we're waiting for full order book or cseq is too old)
        if (this._shouldIgnoreOrderBookUpdate(evt.pair, evt.cseq))
        {
            return;
        }
        evt.exchange = this._exchangeId;
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
    this._registerClient(opt.connect);

    //-- this is where we will forward subscriptions
    let messages = [];

    // unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'ticker':
                    messages.push({event:'unsubscribe',channel:['ticker'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
                case 'orderBook':
                    messages.push({event:'unsubscribe',channel:['book_lv2'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
                case 'trades':
                    messages.push({event:'unsubscribe',channel:['trades'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
            }
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
        this._waitForFullOrderBook(pair);
        const p = this._toExchangePair(pair);
        messages.push({event:'unsubscribe',channel:['book_lv2'],symbols:[p]});
        messages.push({event:'subscribe',channel:['book_lv2'],symbols:[p]});
    });

    // subscribe
    if (undefined !== changes.subscribe)
    {
        _.forEach(changes.subscribe, (entry) => {
            switch (entry.entity)
            {
                case 'ticker':
                    messages.push({event:'subscribe',channel:['ticker'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
                case 'orderBook':
                    // only if we didn't already ask for a resync
                    if (undefined !== resyncOrderBooks[entry.pair])
                    {
                        return;
                    }
                    messages.push({event:'subscribe',channel:['book_lv2'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
                case 'trades':
                    messages.push({event:'subscribe',channel:['trades'],symbols:[this._toExchangePair(entry.pair)]});
                    break;
            }
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
