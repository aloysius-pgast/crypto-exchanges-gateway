"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:Poloniex');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const StreamClientClass = require('./stream-client');

// use to keep track of whether or not markets id have been retrieved
const MARKETS_STATE_UNKNOWN = 1;
const MARKETS_STATE_RETRIEVING = 2;
const MARKETS_STATE_RETRIEVED = 3;

// how often should we try to fetch markets
const MARKETS_FETCH_PERIOD = 3600 * 1000;
// how long should we wait before retrying to fetch markets in case of failure
const MARKETS_FETCH_FAILURE_PERIOD = 10 * 10000;

// this is the only static channel we're interested in
const CHANNEL_TICKERS = 1002;

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 */
constructor(exchange)
{
    super(exchange, {globalTickersSubscription:true, marketsSubscription:true});
    this._client = null;
    this._waitingForFullOrderBooks = {};
    this._marketsById = {};
    this._marketsState = MARKETS_STATE_UNKNOWN;
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
 * Indicates whether or not we're waiting for full order book for a given pair
 *
 *  @param {string} pair pair to check
 *  @param {integer} updateCseq the cseq received in order book update
 *
 *  @return {boolean} true if we're waiting for full order book, false otherwise
 */
_waitingForFullOrderBook(pair, updateCseq)
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
    let self = this;
    let client = new StreamClientClass(this._exchangeId);
    client.updateMarkets(this._marketsById);
    client.on('connected', function(){
        self._registerConnection('default', {uri:client.getUri()});
        self._processSubscriptions();
    });
    client.on('disconnected', function(){
        self._unregisterConnection('default');
        // nothing to do, reconnection will be automatic
    });
    // no more retry, we need to reconnect
    client.on('terminated', function(){
        self._unregisterConnection('default');
        client.reconnect(false);
    });
    client.on('ticker', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.tickers.pairs[evt.pair])
        {
            // update markets entry to indicate we're not interested in this pair anymore
            if (undefined !== self._subscriptions.tickers.pairs[evt.pair].id)
            {
                self._marketsById[self._subscriptions.tickers.pairs[evt.pair].id].ignore = true;
            }
            return;
        }
        evt.exchange = self._exchangeId;
        self.emit('ticker', evt);
    });
    client.on('orderBook', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        self._doneWaitingForFullOrderBook.call(self, evt.pair, evt.cseq);
        evt.exchange = self._exchangeId;
        self.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        // ignore if we're waiting for full order book
        if (self._waitingForFullOrderBook.call(self, evt.pair, evt.cseq))
        {
            return;
        }
        evt.exchange = self._exchangeId;
        self.emit('orderBookUpdate', evt);
    });
    client.on('trades', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.trades.pairs[evt.pair])
        {
            return;
        }
        evt.exchange = self._exchangeId;
        self.emit('trades', evt);
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
    // markets not retrieved yet
    if (MARKETS_STATE_RETRIEVED != this._marketsState)
    {
        if (MARKETS_STATE_UNKNOWN == this._marketsState)
        {
            this._retrieveMarkets(true, opt.connect);
        }
        return;
    }

    this._registerClient(opt.connect);

    // updates markets to indicate which markets we want to accept
    _.forEach(this._marketsById, (obj, id) => {
        if (undefined !== this._subscriptions.tickers.pairs[obj.pair])
        {
            this._subscriptions.tickers.pairs[obj.pair].id = id;
            obj.ignore = false;
        }
        else
        {
            obj.ignore = true;
        }
    });

    //-- this is where we will forward subscriptions
    let messages = [];

    // unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'tickers':
                    messages.push({command:'unsubscribe',channel:CHANNEL_TICKERS});
                    break;
                case 'market':
                    let p = this._exchangeInstance._toExchangePair(entry.pair);
                    messages.push({command:'unsubscribe',channel:p});
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
        let p = this._exchangeInstance._toExchangePair(pair);
        this._waitForFullOrderBook(pair);
        messages.push({command:'unsubscribe',channel:p});
        messages.push({command:'subscribe',channel:p});
    });

    // subscribe
    if (undefined !== changes.subscribe)
    {
        _.forEach(changes.subscribe, (entry) => {
            switch (entry.entity)
            {
                case 'tickers':
                    messages.push({command:'subscribe',channel:CHANNEL_TICKERS});
                    break;
                case 'market':
                    // only if we didn't already ask for a resync
                    if (undefined !== resyncOrderBooks[entry.pair])
                    {
                        return;
                    }
                    let p = this._exchangeInstance._toExchangePair(entry.pair);
                    messages.push({command:'subscribe',channel:p});
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

/**
 * Once markets have been retrieved, we will try to start WS client
 * Markets will be refreshed periodically
 *
 * @param {boolean} initial whether or not we're doing initial retrieval of market
 * @param {boolean} connect whether or not socket should be connected automatically
 */
_retrieveMarkets(initial, connect)
{
    if (initial)
    {
        this._marketsState = MARKETS_STATE_RETRIEVING;
    }
    let timeout = 0;
    let self = this;
    this._exchangeInstance.getPairsById().then(function(data){
        let marketsById = {};
        _.forEach(data, (entry) => {
            marketsById[entry.id] = {pair:entry.pair, ignore:true};
            if (undefined !== self._subscriptions.tickers.pairs[entry.pair])
            {
                marketsById[entry.id].ignore = false;
            }
        });
        self._marketsById = marketsById;
        if (null !== self._client)
        {
            self._client.updateMarkets(marketsById);
        }
        if (initial)
        {
            self._marketsState = MARKETS_STATE_RETRIEVED;
            initial = false;
            self._registerClient(connect);
        }
        timeout = MARKETS_FETCH_PERIOD;
        setTimeout(function(){
            self._retrieveMarkets(initial);
        }, timeout);
    }).catch(function(err){
        timeout = MARKETS_FETCH_FAILURE_PERIOD;
        setTimeout(function(){
            self._retrieveMarkets(initial);
        }, timeout);
    });
}

}

module.exports = SubscriptionManager;
