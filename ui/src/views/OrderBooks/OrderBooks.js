import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import OrderBook from '../../components/OrderBook';
import LastTrades from '../../components/LastTrades';

class OrderBooks extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this.state = {
       exchange:this.props.data.exchange,
       pairs:{
           loaded:false,
           err:null,
           data:null
       },
       orderBook:{
           loaded:false,
           isRefreshing:false,
           loadedTimestamp:0,
           err:null,
           data:null
       },
       trades:{
           loaded:false,
           isRefreshing:false,
           loadedTimestamp:0,
           err:null,
           data:null
       },
       pair:undefined === this.props.match.params.pair ? null : this.props.match.params.pair
   };
   this._components = {
       buyOrderBook:{firstRender:true, page:1},
       sellOrderBook:{firstRender:true, page:1},
       trades:{firstRender:true, page:1}
   }
   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._handleRefreshOrderBook = this._handleRefreshOrderBook.bind(this);
   this._handleSelectOrderBookPage = this._handleSelectOrderBookPage.bind(this);
   this._handleRefreshTrades = this._handleRefreshTrades.bind(this);
   this._handleSelectTradesPage = this._handleSelectTradesPage.bind(this);
}

_handleSelectPair(pair)
{
    this._components = {
        buyOrderBook:{firstRender:true, page:1},
        sellOrderBook:{firstRender:true, page:1},
        trades:{firstRender:true, page:1}
    }
    this.setState((prevState, props) => {
      return {
          pair:pair,
          orderBook:{loaded:false,isRefreshing:false,loadedTimestamp:0,err:null,data:null},
          trades:{loaded:false,isRefreshing:false,loadedTimestamp:0,err:null,data:null}
      };
    }, function(){
        if (null !== pair)
        {
            this._loadOrderBook();
            this._loadTrades();
        }
    });
}

_handleRefreshOrderBook()
{
    this.setState((prevState, props) => {
        let obj = prevState.orderBook;
        obj.isRefreshing = true;
        return {orderBook:obj}
    },function(){
        this._loadOrderBook();
    });
}

_handleSelectOrderBookPage(orderType, page)
{
    switch (orderType)
    {
        case 'buy':
            this._components.buyOrderBook.page = page;
            break;
        case 'sell':
            this._components.sellOrderBook.page = page;
            break;
    }
}

_handleRefreshTrades()
{
    this.setState((prevState, props) => {
        let obj = prevState.trades;
        obj.isRefreshing = true;
        return {trades:obj}
    },function(){
        this._loadTrades();
    });
}

_handleSelectTradesPage(page)
{
    this._components.trades.page = page;
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
        self.setState((prevState, props) => {
            return {trades:{loaded:true, isFirstLoad:prevState.trades.isFirstLoad, isRefreshing:false, err:null, data: data, loadedTimestamp:timestamp}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
            return {trades:{loaded:true, isFirstLoad:prevState.trades.isFirstLoad, isRefreshing:false, err:err, data: null, loadedTimestamp:timestamp}};
        });
    });
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
        self.setState((prevState, props) => {
            // update price & sum
            let sum = 0;
            _.forEach(data.buy, (item, index) => {
                item.price = item.rate * item.quantity;
                sum += item.price;
                item.sum = sum;
            });
            sum = 0;
            _.forEach(data.sell, (item, index) => {
                item.price = item.rate * item.quantity;
                sum += item.price;
                item.sum = sum;
            });
            return {orderBook:{loaded:true, isFirstLoad:prevState.orderBook.isFirstLoad, isRefreshing:false, err:null, data: data, loadedTimestamp:timestamp}};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        let timestamp = new Date().getTime();
        self.setState((prevState, props) => {
            return {orderBook:{loaded:true, isFirstLoad:prevState.orderBook.isFirstLoad, isRefreshing:false, err:err, data: null, loadedTimestamp:timestamp}};
        });
    });
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
    this._components = {
        buyOrderBook:{firstRender:true, page:1},
        sellOrderBook:{firstRender:true, page:1},
        trades:{firstRender:true, page:1}
    }
    let exchange = nextProps.data.exchange;
    this.setState(function(prevState, props){
        return {
            exchange:exchange,
            pairs:{
                loaded:false,
                err:null,
                data:null
            },
            orderBook:{
                loaded:false,
                isRefreshing:false,
                err:null,
                data:null
            },
            trades:{
                loaded:false,
                isRefreshing:false,
                loadedTimestamp:0,
                err:null,
                data:null
            },
            pair:undefined === nextProps.match.params.pair ? null : nextProps.match.params.pair
        };
    }, function(){
        this._loadPairs();
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    let pair = this.state.pair;
    this._loadPairs();
    // we already have a pair => load order book
    if (null !== pair)
    {
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

    const BuyOrderBookComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        let firstRender = this._components.buyOrderBook.firstRender;
        this._components.buyOrderBook.firstRender = false;
        let classNames = "float-lg-left mr-5";
        if (firstRender)
        {
            classNames = "animated fadeIn float-lg-left mr-5";
        }
        return (
            <div className={classNames} style={{minWidth:'30%'}}>
              <br/>
                <h6>BUY ORDER BOOK</h6>
                <OrderBook exchange={this.state.exchange} orderType="buy" page={this._components.buyOrderBook.page} pageSize={15} isRefreshing={this.state.orderBook.isRefreshing} isFirstLoad={firstRender} pair={this.state.pair} loaded={this.state.orderBook.loaded} loadedTimestamp={this.state.orderBook.loadedTimestamp} err={this.state.orderBook.err} data={null === this.state.orderBook.data ? null : this.state.orderBook.data.buy} OnRefresh={this._handleRefreshOrderBook} OnSelectPage={this._handleSelectOrderBookPage}/>
            </div>
        )
    }

    const SellOrderBookComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        let firstRender = this._components.sellOrderBook.firstRender;
        this._components.sellOrderBook.firstRender = false;
        let classNames = "float-lg-left mr-5";
        if (firstRender)
        {
            classNames = "animated fadeIn float-lg-left mr-5";
        }
        return (
            <div className={classNames} style={{minWidth:'30%'}} >
              <br/>
                <h6>SELL ORDER BOOK</h6>
                <OrderBook exchange={this.state.exchange} orderType="sell" page={this._components.sellOrderBook.page} pageSize={15} isRefreshing={this.state.orderBook.isRefreshing} isFirstLoad={firstRender} pair={this.state.pair} loaded={this.state.orderBook.loaded} loadedTimestamp={this.state.orderBook.loadedTimestamp} err={this.state.orderBook.err} data={null === this.state.orderBook.data ? null : this.state.orderBook.data.sell} OnRefresh={this._handleRefreshOrderBook} OnSelectPage={this._handleSelectOrderBookPage}/>
            </div>
        )
    }

    const LastTradesComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        let firstRender = this._components.trades.firstRender;
        this._components.trades.firstRender = false;
        let classNames = 'float-lg-left';
        if (firstRender)
        {
            classNames = 'animated fadeIn float-lg-left';
        }
        return (
            <div className={classNames} style={{minWidth:'30%'}} >
              <br/>
                <h6>LAST TRADES</h6>
                <LastTrades exchange={this.state.exchange} pageSize={15} page={this._components.trades.page} isRefreshing={this.state.trades.isRefreshing} isFirstLoad={firstRender} pair={this.state.pair} loaded={this.state.trades.loaded} loadedTimestamp={this.state.trades.loadedTimestamp} err={this.state.trades.err} data={this.state.trades.data} OnRefresh={this._handleRefreshTrades} OnSelectPage={this._handleSelectTradesPage}/>
            </div>
        )
    }
    return (
        <div>
            <br/>
            <PairChooser exchange={this.state.exchange} pairs={this.state.pairs.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            <BuyOrderBookComponent/>
            <SellOrderBookComponent/>
            <LastTradesComponent/>
        </div>
    );
}

}

export default OrderBooks;
