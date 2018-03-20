"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:Bittrex');
const SignalRClient = require('bittrex-signalr-client');
const logger = require('winston');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const internalConfig = require('../../internal-config');

// how long should we wait before trying to reconnect upon disconnection
const RETRY_DELAY = 10 * 1000;

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 */
constructor(exchange)
{
    super(exchange, {globalTickersSubscription:false, marketsSubscription:true});
    this._client = null;
}

_registerClient(connect)
{
    if (null !== this._client)
    {
        if (this._client.isConnected())
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
    let client = new SignalRClient({
        pingTimeout:internalConfig.get('keepalive').exchanges,
        logger:logger,
        reconnectAfterUnsubscribingFromMarkets:{reconnect:false}
    });
    client.on('connected', function(data){
        self._registerConnection('default', {connectionId:data.connectionId});
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
            return;
        }
        // used to round value
        evt.data.priceChangePercent = parseFloat(evt.data.priceChangePercent.toFixed(3));
        evt.exchange = self._exchangeId;
        self.emit('ticker', evt);
    });
    client.on('orderBook', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.orderBooks.pairs[evt.pair])
        {
            return;
        }
        evt.exchange = self._exchangeId;
        self.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.orderBooks.pairs[evt.pair])
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
    this._client = client;
    if (!connect)
    {
        return;
    }
    this._client.connect();
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
    this._registerClient(opt.connect);

    let resyncOrderBooks = [];
    let unsubscribeFromTickers = [];
    let unsubscribeFromMarkets = [];
    let subscribeToTickers = [];
    let subscribeToMarkets = [];

    // check if we need to resync order books
    if (undefined !== changes.resync)
    {
        _.forEach(changes.resync, (entry) => {
            resyncOrderBooks.push(entry.pair);
        });
    }

    // unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'ticker':
                    unsubscribeFromTickers.push(entry.pair);
                    break;
                case 'market':
                    unsubscribeFromMarkets.push(entry.pair);
                    break;
            }
        });
    }

    // subscribe
    if (undefined !== changes.subscribe)
    {
        _.forEach(changes.subscribe, (entry) => {
            switch (entry.entity)
            {
                case 'ticker':
                    subscribeToTickers.push(entry.pair);
                    break;
                case 'market':
                    subscribeToMarkets.push(entry.pair);
                    break;
            }
        });
    }
    // build message list
    if (0 !== resyncOrderBooks.length)
    {
        this._client.resyncOrderBooks(resyncOrderBooks);
    }
    if (0 !== unsubscribeFromTickers.length)
    {
        this._client.unsubscribeFromTickers(unsubscribeFromTickers);
    }
    if (0 !== unsubscribeFromMarkets.length)
    {
        this._client.unsubscribeFromMarkets(unsubscribeFromMarkets);
    }
    if (0 !== subscribeToTickers.length)
    {
        this._client.subscribeToTickers(subscribeToTickers, false, false);
    }
    if (0 !== subscribeToMarkets.length)
    {
        this._client.subscribeToMarkets(subscribeToMarkets, false, false);
    }

    // do we need to disconnect client ?
    if (!this.hasSubscriptions())
    {
        if (this._client.isConnected())
        {
            this._unregisterConnection('default');
            this._client.disconnect();
            return;
        }
    }
}

}

module.exports = SubscriptionManager;
