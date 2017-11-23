"use strict";
const _ = require('lodash');
const debug = require('debug')('CEG:ExchangeSubscriptionManager:Dummy');
const AbstractExchangeSubscriptionManagerClass = require('../../abstract-exchange-subscription-manager');
const StreamClientClass = require('./stream-client');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

class SubscriptionManager extends AbstractExchangeSubscriptionManagerClass
{

/**
 * Constructor
 */
constructor(exchange, config)
{
    let exchangeId = exchange.getId();
    let options = {marketsSubscription:true,globalTickersSubscription:true};
    if (false === config.exchanges[exchangeId].globalTickersSubscription)
    {
        options.globalTickersSubscription = false;
    }
    if (false === config.exchanges[exchangeId].marketsSubscription)
    {
        options.marketsSubscription = false;
    }
    super(exchange, options);
    this._baseUri = config.exchanges[exchangeId].baseWsUri;
    // whether or not we have a single WS which handles RPC
    this._isRpc = true;
    if (false === config.exchanges[exchangeId].rpc)
    {
        this._isRpc = false;
    }
    this._clients = {
        rpc:null,
        tickers:{},
        markets:{},
        orderBooks:{},
        trades:{}
    }
}

_registerRpcClient()
{
    if (null !== this._clients.rpc)
    {
        return;
    }
    let self = this;
    let client = new StreamClientClass(this._exchangeId, this._baseUri);
    client.on('connected', function(){
        self._registerConnection('rpc', {uri:client.getUri()});
        self._processSubscriptions.call(self);
    });
    client.on('disconnected', function(){
        self._unregisterConnection('rpc');
        // nothing to do, reconnection will be automatic
    });
    // no more retry left, we need to reconnect
    client.on('terminated', function(){
        self._unregisterConnection('rpc');
        client.reconnect(false);
    });
    client.on('ticker', function(evt){
        // ignore if we don't support this pair
        if (undefined === self._subscriptions.tickers.pairs[evt.pair])
        {
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
    this._clients.rpc = client;
    client.connect();
}

_unregisterRpcClient()
{
    if (null === this._clients.rpc)
    {
        return;
    }
    let client = this._clients.rpc;
    this._clients.rpc = null;
    this._unregisterConnection('rpc');
    client.disconnect();
}

_registerTickerClient(pair)
{
    if (undefined === pair)
    {
        pair = 'global';
    }
    if (undefined !== this._clients.tickers[pair])
    {
        return;
    }
    let uri = this._baseUri + '/tickers';
    if ('global' != pair)
    {
        uri += '/' + pair;
    }
    let self = this;
    let client = new StreamClientClass(this._exchangeId, uri);
    let descriptor = {client:client}
    if ('global' == pair)
    {
        descriptor.entity = 'tickers';
    }
    else
    {
        descriptor.entity = 'ticker';
        descriptor.pair = pair;
    }
    client.on('connected', function(){
        self._registerConnection(`ticker-${pair}`, {uri:client.getUri()});
        self._processSubscriptions.call(self, descriptor);
    });
    client.on('disconnected', function(){
        self._unregisterConnection(`ticker-${pair}`);
        // nothing to do, reconnection will be automatic
    });
    // no more retry left, we need to reconnect
    client.on('terminated', function(){
        self._unregisterConnection(`ticker-${pair}`);
        client.reconnect(false);
    });
    client.on('ticker', function(evt){
        // ignore if we don't support this pair
        if ('global' != pair && undefined === self._subscriptions.tickers.pairs[evt.pair])
        {
            return;
        }
        evt.exchange = self._exchangeId;
        self.emit('ticker', evt);
    });
    this._clients.tickers[pair] = client;
    client.connect();
}

_unregisterTickerClient(pair)
{
    if (undefined === this._clients.tickers[pair])
    {
        return;
    }
    this._unregisterConnection(`ticker-${pair}`);
    this._clients.tickers[pair].disconnect();
}

_registerMarketClient(pair)
{
    if (undefined !== this._clients.markets[pair])
    {
        return;
    }
    let uri = this._baseUri + '/markets/' + pair;
    let self = this;
    let client = new StreamClientClass(this._exchangeId, uri);
    let descriptor = {entity:'market',pair:pair,client:client}
    client.on('connected', function(){
        self._registerConnection(`market-${pair}`, {uri:client.getUri()});
        self._processSubscriptions.call(self, descriptor);
    });
    client.on('disconnected', function(){
        self._unregisterConnection(`market-${pair}`);
        // nothing to do, reconnection will be automatic
    });
    // no more retry left, we need to reconnect
    client.on('terminated', function(){
        self._unregisterConnection(`market-${pair}`);
        client.reconnect(false);
    });
    client.on('orderBook', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('orderBookUpdate', evt);
    });
    client.on('trades', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('trades', evt);
    });
    client.connect();
}

_unregisterMarketClient(pair)
{
    if (undefined === this._clients.markets[pair])
    {
        return;
    }
    self._unregisterConnection(`market-${pair}`);
    this._clients.markets[pair].disconnect();
}

_registerOrderBookClient(pair)
{
    if (undefined !== this._clients.orderBooks[pair])
    {
        return;
    }
    let uri = this._baseUri + '/orderBooks/' + pair;
    let self = this;
    let client = new StreamClientClass(this._exchangeId, uri);
    let descriptor = {entity:'orderBook',pair:pair,client:client}
    client.on('connected', function(){
        self._registerConnection(`orderBook-${pair}`, {uri:client.getUri()});
        self._processSubscriptions.call(self, descriptor);
    });
    client.on('disconnected', function(){
        self._unregisterConnection(`orderBook-${pair}`);
        // nothing to do, reconnection will be automatic
    });
    // no more retry left, we need a new client
    client.on('terminated', function(){
        self._unregisterConnection(`orderBook-${pair}`);
        client.reconnect(false);
    });
    client.on('orderBook', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('orderBook', evt);
    });
    client.on('orderBookUpdate', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('orderBookUpdate', evt);
    });
    this._clients.orderBooks[pair] = client;
    client.connect();
}

_unregisterOrderBookClient(pair)
{
    if (undefined === this._clients.orderBooks[pair])
    {
        return;
    }
    this._unregisterConnection(`orderBook-${pair}`);
    this._clients.orderBooks[pair].disconnect();
}

_registerTradesClient(pair)
{
    if (undefined !== this._clients.trades[pair])
    {
        return;
    }
    let uri = this._baseUri + '/trades/' + pair;
    let self = this;
    let client = new StreamClientClass(this._exchangeId, uri);
    let descriptor = {entity:'trades',pair:pair,client:client}
    client.on('connected', function(){
        self._registerConnection(`trades-${pair}`, {uri:client.getUri()});
        self._processSubscriptions.call(self, descriptor);
    });
    client.on('disconnected', function(){
        self._unregisterConnection(`trades-${pair}`);
        // nothing to do, reconnection will be automatic
    });
    // no more retry left, we need to reconnect
    client.on('terminated', function(){
        self._unregisterConnection(`trades-${pair}`);
        client.reconnect(false);
    });
    client.on('trades', function(evt){
        evt.exchange = self._exchangeId;
        self.emit('trades', evt);
    });
    this._clients.trades[pair] = client;
    client.connect();
}

_unregisterTradesClient(pair)
{
    if (undefined === this._clients.trades[pair])
    {
        return;
    }
    this._unregisterConnection(`trades-${pair}`);
    this._clients.trades[pair].disconnect();
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
    if (this._isRpc)
    {
        this._processChangesForRpc(changes, opt);
        return;
    }

    // check if we need to resync order books
    if (undefined !== changes.resync)
    {
        _.forEach(changes.resync, (entry) => {
            if (this._marketsSubscription)
            {
                this._registerMarketClient(entry.pair);
            }
            else
            {
                this._registerOrderBookClient(entry.pair);
            }
        });
    }

    // check if we need to unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'tickers':
                    this._unregisterTickerClient();
                    break;
                case 'ticker':
                    this._unregisterTickerClient(entry.pair);
                    break;
                case 'market':
                    this._unregisterMarketClient(entry.pair);
                    break;
                case 'orderBook':
                    this._unregisterOrderBookClient(entry.pair);
                    break;
                case 'trades':
                    this._unregisterTradesClient(entry.pair);
                    break;
            }
        });
    }

    // check if we need to subscribe
    if (undefined !== changes.subscribe)
    {
        // only if we'be been asked to connect to exchange streams
        if (opt.connect)
        {
            _.forEach(changes.unsubscribe, (entry) => {
                switch (entry.entity)
                {
                    case 'tickers':
                        this._registerTickerClient();
                        break;
                    case 'ticker':
                        this._registerTickerClient(entry.pair);
                        break;
                    case 'market':
                        this._registerMarketClient(entry.pair);
                        break;
                    case 'orderBook':
                        this._registerOrderBookClient(entry.pair);
                        break;
                    case 'trades':
                        this._registerTradesClient(entry.pair);
                        break;
                }
            });
        }
    }
}

_processChangesForRpc(changes)
{
    //-- this is where we will forward subscriptions
    let messages = [];

    let resyncOrderBooks = [];
    let unsubscribeFromTickers = [];
    let unsubscribeFromMarkets = [];
    let unsubscribeFromOrderBooks = [];
    let unsubscribeFromTrades = [];
    let subscribeToTickers = [];
    let subscribeToMarkets = [];
    let subscribeToOrderBooks = [];
    let subscribeToTrades = [];

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
                case 'tickers':
                    messages.push({m:'unsubscribeFromAllTickers'});
                    break;
                case 'ticker':
                    unsubscribeFromTickers.push(entry.pair);
                    break;
                case 'market':
                    unsubscribeFromMarkets.push(entry.pair);
                    break;
                case 'orderBook':
                    unsubscribeFromOrderBooks.push(entry.pair);
                    break;
                case 'trades':
                    unsubscribeFromTrades.push(entry.pair);
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
                case 'tickers':
                    messages.push({m:'subscribeToTickers'});
                    break;
                case 'ticker':
                    subscribeToTickers.push(entry.pair);
                    break;
                case 'market':
                    subscribeToMarkets.push(entry.pair);
                    break;
                case 'orderBook':
                    subscribeToOrderBooks.push(entry.pair);
                    break;
                case 'trades':
                    subscribeToTrades.push(entry.pair);
                    break;
            }
        });
    }
    // build message list
    if (0 !== resyncOrderBooks.length)
    {
        messages.push({m:'resyncOrderBooks',p:{pairs:resyncOrderBooks}});
    }
    if (0 !== unsubscribeFromTickers.length)
    {
        messages.push({m:'unsubscribeFromTickers',p:{pairs:unsubscribeFromTickers}});
    }
    if (0 !== unsubscribeFromMarkets.length)
    {
        messages.push({m:'unsubscribeFromMarkets',p:{pairs:unsubscribeFromMarkets}});
    }
    if (0 !== unsubscribeFromOrderBooks.length)
    {
        messages.push({m:'unsubscribeFromOrderBooks',p:{pairs:unsubscribeFromOrderBooks}});
    }
    if (0 !== unsubscribeFromTrades.length)
    {
        messages.push({m:'unsubscribeFromTrades',p:{pairs:unsubscribeFromTrades}});
    }
    if (0 !== subscribeToTickers.length)
    {
        messages.push({m:'subscribeToTickers',p:{pairs:subscribeToTickers}});
    }
    if (0 !== subscribeToMarkets.length)
    {
        messages.push({m:'subscribeToMarkets',p:{pairs:subscribeToMarkets}});
    }
    if (0 !== subscribeToOrderBooks.length)
    {
        messages.push({m:'subscribeToOrderBooks',p:{pairs:subscribeToOrderBooks}});
    }
    if (0 !== subscribeToTrades.length)
    {
        messages.push({m:'subscribeToTrades',p:{pairs:subscribeToTrades}});
    }
    if (this._shouldUnregisterRpcClient())
    {
        this._unregisterRpcClient();
    }
    else
    {
        // only if we'be been asked to connect to exchange streams
        if (opt.connect)
        {
            this._registerRpcClient();
            this._clients.rpc.send(messages);
        }
    }
}

/**
 * Whether or not we should disconnect RPC socket
 */
_shouldUnregisterRpcClient()
{
    if (0 != this._subscriptions.tickers.count || this._subscriptions.tickers.subscribed)
    {
        return false;
    }
    if (0 != this._subscriptions.orderBooks.count)
    {
        return false;
    }
    if (0 != this._subscriptions.trades.count)
    {
        return false;
    }
    if (0 != this._subscriptions.markets.count)
    {
        return false;
    }
    return true;
}

}

module.exports = SubscriptionManager;
