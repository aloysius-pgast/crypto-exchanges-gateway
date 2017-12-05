import React, { Component } from 'react';
import Big from 'big.js';
import restClient from '../../lib/RestClient';
import wsClient from '../../lib/WsClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import OrderBook from '../../components/OrderBook';
import LastTrades from '../../components/LastTrades';
import dateTimeHelper from '../../lib/DateTimeHelper';

class OrderBooks extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;

   this._wsFeatures = {
       orderBook:false,
       trades:false
   }
   this.state = this._initializeState(this.props.data.exchange, this.props.match.params.pair);
   this._initializeData();

   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._handleRefreshOrderBook = this._handleRefreshOrderBook.bind(this);
   this._handleSelectOrderBookPage = this._handleSelectOrderBookPage.bind(this);
   this._handleRefreshTrades = this._handleRefreshTrades.bind(this);
   this._handleSelectTradesPage = this._handleSelectTradesPage.bind(this);
}

_initializeState(exchange, pair, pairs)
{
    let state = {
        exchange:exchange,
        pairs:pairs,
        orderBook:{
            loaded:false,
            isRefreshing:false,
            err:null,
            buy:{
                data:null,
                updateTimestamp:0
            },
            sell:{
                data:null,
                updateTimestamp:0
            }
        },
        trades:{
            loaded:false,
            isRefreshing:false,
            updateTimestamp:0,
            err:null,
            data:null
        },
        pair:undefined === pair ? null : pair
    };
    if (undefined === state.pairs)
    {
        state.pairs= {
            loaded:false,
            err:null,
            data:null
        }
    }
    return state;
}

_initializeData()
{
    this._orderBook = {
        cseq:0,
        loaded:false,
        err:null,
        isFirstLoad:true,
        isRefreshing:false,
        buy:{
            updateTimestamp:0,
            data:null,
            sortedKeys:null,
            currentData:null,
            pages:0,
            page:1
        },
        sell:{
            updateTimestamp:0,
            data:null,
            sortedKeys:null,
            currentData:null,
            pages:0,
            page:1
        },
        maxPages:10,
        pageSize:15
    };
    this._orderBook.maxLength = this._orderBook.maxPages * this._orderBook.pageSize
    this._trades = {
         loaded:false,
         err:null,
         isFirstLoad:true,
         isRefreshing:false,
         updateTimestamp:0,
         data:null,
         currentData:null,
         pages:0,
         page:1,
         maxPages:10,
         pageSize:15
    };
    this._trades.maxLength = this._trades.maxPages * this._trades.pageSize
}

_handleSelectPair(pair)
{
    this._initializeData();
    if (null === pair)
    {
        wsClient.unsubscribe();
    }
    this.setState((prevState, props) => {
      return this._initializeState(prevState.exchange, pair, prevState.pairs);
    }, function(){
        if (null !== pair)
        {
            this._setupWsListeners(this.state.exchange, pair);
            this._loadOrderBook();
            this._loadTrades();
        }
    });
}

_handleRefreshOrderBook()
{
    this.setState((prevState, props) => {
        let newState = {
            orderBook:prevState.orderBook
        }
        newState.orderBook.isRefreshing = true;
        return newState;
    },function(){
        this._loadOrderBook();
    });
}

_handleSelectOrderBookPage(orderType, page)
{
    switch (orderType)
    {
        case 'buy':
            this._orderBook.buy.page = page;
            this._updateOrderBook(true, false);
            break;
        case 'sell':
            this._orderBook.sell.page = page;
            this._updateOrderBook(false, true);
            break;
    }
    this._updateState();
}

_handleRefreshTrades()
{
    this.setState((prevState, props) => {
        let newState = {
            trades:prevState.trades
        }
        newState.trades.isRefreshing = true;
        return newState;
    },function(){
        this._loadTrades();
    });
}

_handleSelectTradesPage(page)
{
    this._trades.page = page;
    this._updateTrades();
    this._updateState();
}

_loadTrades()
{
    let self = this;
    restClient.getTrades(this.state.exchange, this.state.pair).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        if (self._trades.loaded)
        {
            self._trades.isFirstLoad = false;
        }
        self._trades.loaded = true;
        self._trades.isRefreshing = false;
        self._trades.data = data;
        self._trades.err = null;
        self._trades.updateTimestamp = timestamp;
        self._updateTrades.call(self);
        self._updateState.call(self);
        if (self._wsFeatures.trades)
        {
            wsClient.subscribe(self.state.exchange, 'trades', self.state.pair);
        }
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        if (self._trades.loaded)
        {
            self._trades.isFirstLoad = false;
        }
        self._trades.loaded = true;
        self._trades.isRefreshing = false;
        self._trades.updateTimestamp = timestamp;
        self._trades.err = err;
        self._updateTrades.call(self);
        self._updateState.call(self);
    });
}

_updateTrades()
{
    if (null === this._trades.err)
    {
        if (this._trades.data.length > this._trades.maxLength)
        {
            this._trades.data = this._trades.data.slice(0, this._trades.maxLength);
        }
        if (0 == this._trades.data.length)
        {
            this._trades.currentData = null;
        }
        else
        {
            try
            {
                let title = this._trades.data[0].rate.toFixed(8) + ' / ' + this.state.pair;
                document.title = title;
            }
            catch (e)
            {
                // just ignore
            }
            this._trades.pages = parseInt(this._trades.data.length / this._trades.pageSize);
            if (0 != this._trades.data.length % this._trades.pageSize)
            {
                ++this._trades.pages;
            }
            let firstItemIndex = (this._trades.page - 1) * this._trades.pageSize;
            if (firstItemIndex >= this._trades.data.length)
            {
                this._trades.page = 1;
                firstItemIndex = 0;
            }
            let maxItemIndex = firstItemIndex + this._trades.pageSize;
            this._trades.currentData =  this._trades.data.slice(firstItemIndex, maxItemIndex);
        }
    }
}

_loadOrderBook()
{
    let self = this;
    restClient.getOrderBook(this.state.exchange, this.state.pair).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        if (self._orderBook.loaded)
        {
            self._orderBook.isFirstLoad = false;
        }
        self._orderBook.loaded = true;
        self._orderBook.isRefreshing = false;
        self._orderBook.cseq = data.cseq;
        self._orderBook.err = null;
        self._orderBook.buy.data = new Map();
        self._orderBook.buy.updateTimestamp = timestamp;
        self._orderBook.sell.data = new Map();
        self._orderBook.sell.updateTimestamp = timestamp;
        _.forEach(data.buy, (item, index) => {
            self._orderBook.buy.data.set(item.rate, item);
        });
        _.forEach(data.sell, (item, index) => {
            self._orderBook.sell.data.set(item.rate, item);
        });
        self._updateOrderBook.call(self, true, true);
        self._updateState.call(self);
        // subscribe
        if (self._wsFeatures.orderBook)
        {
            wsClient.subscribe(self.state.exchange, 'orderBook', self.state.pair);
        }
    }).catch (function(err){
        console.log(err);
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        if (self._orderBook.loaded)
        {
            self._orderBook.isFirstLoad = false;
        }
        self._orderBook.loaded = true;
        self._orderBook.isRefreshing = false;
        self._orderBook.buy.updateTimestamp = timestamp;
        self._orderBook.sell.updateTimestamp = timestamp;
        self._orderBook.err = err;
        self._updateOrderBook.call(self, true, true);
        self._updateState.call(self);
    });
}

_updateOrderBook(updateBuy, updateSell)
{
    if (null === this._orderBook.err)
    {
        if (updateBuy)
        {
            this._orderBook.buy.sortedKeys = Array.from(this._orderBook.buy.data.keys()).sort(function(a,b){
                return b - a;
            });
            this._finalizeOrderBook(this._orderBook.buy);
        }
        if (updateSell)
        {
            this._orderBook.sell.sortedKeys = Array.from(this._orderBook.sell.data.keys()).sort(function(a,b){
                return a - b;
            });
            this._finalizeOrderBook(this._orderBook.sell);
        }
    }
}

_finalizeOrderBook(orderBook)
{
    if (orderBook.sortedKeys.length > this._orderBook.maxLength)
    {
        for (var i = this._orderBook.maxLength; i < orderBook.sortedKeys.length; ++i)
        {
            orderBook.data.delete(orderBook.sortedKeys[i]);
            orderBook.sortedKeys = orderBook.sortedKeys.slice(0, this._orderBook.maxLength);
        }
    }
    if (0 == orderBook.sortedKeys.length)
    {
        orderBook.currentData = null;
    }
    else
    {
        orderBook.pages = parseInt(orderBook.sortedKeys.length / this._orderBook.pageSize);
        if (0 != orderBook.sortedKeys.length % this._orderBook.pageSize)
        {
            ++orderBook.pages;
        }
        let firstItemIndex = (orderBook.page - 1) * this._orderBook.pageSize;
        if (firstItemIndex >= orderBook.sortedKeys.length)
        {
            orderBook.page = 1;
            firstItemIndex = 0;
        }
        let lastItemIndex = firstItemIndex + this._orderBook.pageSize - 1;
        if (lastItemIndex >= orderBook.sortedKeys.length)
        {
            lastItemIndex = orderBook.sortedKeys.length - 1;
        }
        orderBook.currentData = [];
        let sum = new Big(0);
        let item;
        for (var i = 0; i <= lastItemIndex; ++i)
        {
            item = orderBook.data.get(orderBook.sortedKeys[i]);
            item.price = new Big(item.rate).times(item.quantity);
            sum = sum.plus(item.price);
            if (i >= firstItemIndex)
            {
                item.sum = sum;
                orderBook.currentData.push(item);
            }
        }
    }
}

_updateState()
{
    let newState = {
        trades:{
            loaded:this._trades.loaded,
            isRefreshing:this._trades.isRefreshing,
            isFirstLoad:this._trades.isFirstLoad,
            updateTimestamp:this._trades.updateTimestamp,
            err:this._trades.err,
            data: this._trades.currentData,
        },
        orderBook:{
            loaded:this._orderBook.loaded,
            isRefreshing:this._orderBook.isRefreshing,
            isFirstLoad:this._orderBook.isFirstLoad,
            err:this._orderBook.err,
            buy:{
                data:this._orderBook.buy.currentData,
                updateTimestamp:this._orderBook.buy.updateTimestamp
            },
            sell:{
                data:this._orderBook.sell.currentData,
                updateTimestamp:this._orderBook.sell.updateTimestamp
            }
        }
    };
    this.setState(newState);
}

_loadPairs()
{
    let self = this;
    restClient.getPairs(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          return {pairs:{loaded:true, err:null, data: data}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
            return {pairs:{loaded:true, err:err, data: null}};
        });
    });
}

componentWillReceiveProps(nextProps)
{
    let newState = this._initializeState(nextProps.data.exchange, nextProps.match.params.pair);
    this._initializeData();
    this.setState(function(prevState, props){
        return newState;
    }, function(){
        this._loadPairs();
        // we already have a pair => load data
        if (null !== this.state.pair)
        {
            this._setupWsListeners(this.state.exchange, this.state.pair);
            this._loadOrderBook();
            this._loadTrades();
        }
    });
}

_setupWsListeners(exchange, pair)
{
    wsClient.unsubscribe();
    this._wsFeatures = {
        orderBook:serviceRegistry.checkExchangeFeatures(exchange, ['wsOrderBooks'], false),
        trades:serviceRegistry.checkExchangeFeatures(exchange, ['wsTrades'], false)
    }
    if (!this._wsFeatures.orderBook && !this._wsFeatures.trades)
    {
        return;
    }
    let self = this;
    if (this._wsFeatures.orderBook)
    {
        wsClient.on('orderBook', function(e){
            if (!self._isMounted || self.state.exchange != e.exchange || self.state.pair != e.pair)
            {
                return;
            }
            let timestamp = new Date().getTime();
            self._orderBook.cseq = e.cseq;
            self._orderBook.buy.data = new Map();
            self._orderBook.buy.updateTimestamp = timestamp;
            let count = 0;
            _.forEach(e.data.buy, (entry) => {
                self._orderBook.buy.data.set(entry.rate, entry);
                ++count;
                if (count >= self._orderBook.maxLength)
                {
                    return false;
                }
            });
            count = 0;
            self._orderBook.sell.updateTimestamp = timestamp;
            self._orderBook.sell.data = new Map();
            _.forEach(e.data.sell, (entry) => {
                self._orderBook.sell.data.set(entry.rate, entry);
                ++count;
                if (count >= self._orderBook.maxLength)
                {
                    return false;
                }
            });
        });
        wsClient.on('orderBookUpdate', function(e){
            if (!self._isMounted || self.state.exchange != e.exchange || self.state.pair != e.pair)
            {
                return;
            }
            if (0 == e.data.buy.length && 0 == e.data.sell.length)
            {
                return;
            }
            let timestamp = new Date().getTime();
            self._orderBook.cseq = e.cseq;
            if (0 != e.data.buy.length)
            {
                self._orderBook.buy.updateTimestamp = timestamp;
                _.forEach(e.data.buy, (entry) => {
                    if ('remove' == entry.action)
                    {
                        self._orderBook.buy.data.delete(entry.rate);
                    }
                    else
                    {
                        self._orderBook.buy.data.set(entry.rate, entry);
                    }
                });
            }
            if (0 != e.data.sell.length)
            {
                self._orderBook.sell.updateTimestamp = timestamp;
                _.forEach(e.data.sell, (entry) => {
                    if ('remove' == entry.action)
                    {
                        self._orderBook.sell.data.delete(entry.rate);
                    }
                    else
                    {
                        self._orderBook.sell.data.set(entry.rate, entry);
                    }
                });
            }
        });
    }
    if (this._wsFeatures.trades)
    {
        wsClient.on('trades', function(e){
            if (!self._isMounted || self.state.exchange != e.exchange || self.state.pair != e.pair)
            {
                return;
            }
            if (0 == e.data.length)
            {
                return;
            }
            let timestamp = new Date().getTime();
            self._trades.updateTimestamp = timestamp;
            _.forEach(e.data, (entry) => {
                self._trades.data.unshift(entry);
            });
        });
    }
    let wsWorkerConfig = {
        exchange:exchange,
        pair:pair,
        timestamp:new Date().getTime(),
        delay:3000
    }
    let wsWorker = function(){
        if (!self._isMounted || self.state.exchange != wsWorkerConfig.exchange || self.state.pair != wsWorkerConfig.pair)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self._updateData.call(self, wsWorkerConfig.timestamp);
        wsWorkerConfig.timestamp = timestamp;
        setTimeout(function(){
            wsWorker();
        }, wsWorkerConfig.delay);
    }
    setTimeout(function(){
        wsWorker();
    }, wsWorkerConfig.delay);
}

_updateData(timestamp)
{
    let updated = false;
    if (this._trades.updateTimestamp >= timestamp)
    {
        this._updateTrades();
        updated = true;
    }
    if (this._orderBook.buy.updateTimestamp >= timestamp)
    {
        this._updateOrderBook(true, false);
        updated = true;
    }
    if (this._orderBook.sell.updateTimestamp >= timestamp)
    {
        this._updateOrderBook(false, true);
        updated = true;
    }
    if (!updated)
    {
        return;
    }
    this._updateState();
}

componentWillUnmount()
{
    this._isMounted = false;
    wsClient.unsubscribe();
}

componentDidMount()
{
    this._isMounted = true;
    this._loadPairs();
    // we already have a pair => load data
    if (null !== this.state.pair)
    {
        this._setupWsListeners(this.state.exchange, this.state.pair);
        this._loadOrderBook();
        this._loadTrades();
    }
}

render()
{
    if (!this.state.pairs.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }
    if (null !== this.state.pairs.err)
    {
        return null;
    }
    if (null === this.state.pair)
    {
        return (
            <div>
                <br/>
                <PairChooser exchange={this.state.exchange} pairs={this.state.pairs.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            </div>
        )
    }
    let orderBookClassNames = "float-lg-left mr-5";
    if (this.state.orderBook.isFirstLoad)
    {
        orderBookClassNames = "animated fadeIn float-lg-left mr-5";
    }
    let tradesClassNames = 'float-lg-left';
    if (this.state.trades.isFirstLoad)
    {
        tradesClassNames = 'animated fadeIn float-lg-left';
    }
    return (
        <div>
            <br/>
            <PairChooser exchange={this.state.exchange} pairs={this.state.pairs.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            <div className={orderBookClassNames} style={{minWidth:'30%'}}>
              <br/>
                <h6>BUY ORDER BOOK</h6>
                <OrderBook exchange={this.state.exchange} pair={this.state.pair} orderType="buy" page={this._orderBook.buy.page} pages={this._orderBook.buy.pages} pageSize={this._orderBook.pageSize} isRefreshing={this.state.orderBook.isRefreshing} isFirstLoad={this.state.orderBook.isFirstLoad} loaded={this.state.orderBook.loaded} updateTimestamp={this.state.orderBook.buy.updateTimestamp} err={this.state.orderBook.err} data={this.state.orderBook.buy.data} OnRefresh={this._wsFeatures.orderBook ? undefined : this._handleRefreshOrderBook} OnSelectPage={this._handleSelectOrderBookPage}/>
            </div>
            <div className={orderBookClassNames} style={{minWidth:'30%'}} >
              <br/>
                <h6>SELL ORDER BOOK</h6>
                <OrderBook exchange={this.state.exchange} pair={this.state.pair} orderType="sell" page={this._orderBook.sell.page} pages={this._orderBook.buy.pages} pageSize={this._orderBook.pageSize} isRefreshing={this.state.orderBook.isRefreshing} isFirstLoad={this.state.orderBook.isFirstLoad} loaded={this.state.orderBook.loaded} updateTimestamp={this.state.orderBook.sell.updateTimestamp} err={this.state.orderBook.err} data={this.state.orderBook.sell.data} OnRefresh={this._wsFeatures.orderBook ? undefined : this._handleRefreshOrderBook} OnSelectPage={this._handleSelectOrderBookPage}/>
            </div>
            <div className={tradesClassNames} style={{minWidth:'30%'}} >
              <br/>
                <h6>LAST TRADES</h6>
                <LastTrades exchange={this.state.exchange} pair={this.state.pair} page={this._trades.page} pages={this._trades.pages} pageSize={this._trades.pageSize} isRefreshing={this.state.trades.isRefreshing} isFirstLoad={this.state.trades.isFirstLoad} loaded={this.state.trades.loaded} updateTimestamp={this.state.trades.updateTimestamp} err={this.state.trades.err} data={this.state.trades.data} OnRefresh={this._wsFeatures.trades ? undefined : this._handleRefreshTrades} OnSelectPage={this._handleSelectTradesPage}/>
            </div>
        </div>
    );
}

}

export default OrderBooks;
