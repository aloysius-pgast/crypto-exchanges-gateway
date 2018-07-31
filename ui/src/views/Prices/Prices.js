import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import tradingViewHelper from '../../lib/TradingViewHelper';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import PairChooser from '../../components/PairChooser';
import Ticker from '../../components/Ticker';
import TradindViewCandleSticks from '../../components/TradingViewCandleSticks';
import ReactStockChartsCandleSticks from '../../components/ReactStockChartsCandleSticks';
import serviceRegistry from '../../lib/ServiceRegistry';
import dataStore from '../../lib/DataStore';

class TickerComponent extends Component {

constructor(props) {
    super(props);
}

render() {
    if (null === this.props.pair)
    {
        return null
    }
    return (
        <div className="animated fadeIn">
          <br/>
          <h6>TICKER</h6>
          <Ticker exchange={this.props.exchange} pair={this.props.pair}/>
        </div>
    )
}

}

const parseData = (data, interval) => {
    let arr = [];
    let lastDay = null;
    for (var i = 0; i < data.length ; ++i)
    {
        let obj = {
            date:new Date(data[i].timestamp * 1000),
            open:data[i].open,
            high:data[i].high,
            low:data[i].low,
            close:data[i].close,
            volume:data[i].volume
        }
        arr.push(obj);
        let currentDay = obj.date.getDate();
        switch (interval)
        {
            case '1d':
            case '3d':
            case '1w':
                obj.day = true;
                break;
            case '1M':
                obj.month = true;
                break;
            default:
                if (null === lastDay || currentDay !== lastDay)
                {
                    lastDay = currentDay;
                    obj.day = true;
                }
        }
        if (obj.day)
        {
            switch (interval)
            {
                case '3d':
                    if (currentDay <= 3)
                    {
                        obj.month = true;
                    }
                    break;
                case '1w':
                    if (currentDay <= 7)
                    {
                        obj.month = true;
                    }
                    break;
                default:
                    if (1 === currentDay)
                    {
                        obj.month = true;
                    }
                    break;
            }
        }
        if (obj.month)
        {
            if (0 === obj.date.getMonth())
            {
                obj.year = true;
            }
        }
    }
    return arr;
}

const computeRefreshInterval = (klinesInterval) => {
    // refresh interval in seconds
    let interval = 30;
    switch (klinesInterval)
    {
        case '1m':
            interval = 20;
            break;
        case '15m':
        case '30m':
            interval = 60;
            break;
        case '1h':
        case '2h':
        case '4h':
            interval = 300;
            break;
        case '6h':
        case '8h':
        case '12h':
            interval = 600;
            break;
        case '1d':
        case '3d':
        case '1w':
            interval = 1800;
            break;
        case '1M':
            interval = 3600;
            break;
    }
    return interval * 1000;
}

class Prices extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   let exchangeInstance = serviceRegistry.getExchange(this.props.data.exchange);
   let pair = undefined === this.props.match.params.pair ? null : this.props.match.params.pair;
   if (null === pair)
   {
       pair = dataStore.getExchangeData(this.props.data.exchange, 'pair');
   }

   // update klines interval
   let klinesIntervals = null;
   let klinesInterval = null;
   if (undefined !== exchangeInstance.features['klines'] && true === exchangeInstance.features['klines'].enabled)
   {
       klinesIntervals = exchangeInstance.features['klines'].intervals;
       klinesInterval = exchangeInstance.features['klines'].defaultInterval;
   }
   if (undefined !== this.props.match.params.interval)
   {
       if (-1 != klinesIntervals.indexOf(this.props.match.params.interval))
       {
           klinesInterval = this.props.match.params.interval;
       }
   }

   this.state = {
       exchange:this.props.data.exchange,
       exchangeType:exchangeInstance.type,
       exchangeName:exchangeInstance.name,
       klinesIntervals:klinesIntervals,
       klinesInterval:klinesInterval,
       loaded:false,
       err: null,
       data:null,
       pair:pair
   };
   this._handleSelectPair = this._handleSelectPair.bind(this);
   this._handleLoadKlines = this._handleLoadKlines.bind(this);
   this._handleSelectKlinesInterval = this._handleSelectKlinesInterval.bind(this);
}

_handleSelectPair(pair)
{
    this.setState((prevState, props) => {
      return {pair:pair};
    });
}

_handleSelectKlinesInterval(interval)
{
    if (!this._isMounted)
    {
        return;
    }
    this.setState({klinesInterval:interval});
}

_loadData()
{
    let self = this;
    restClient.getPairs(this.state.exchange).then(function(data){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
          let pair = self.state.pair;
          if (undefined === data[pair])
          {
            pair = null;
          }
          return {err:null, loaded:true, data: data, pair:pair};
        });
    }).catch (function(err){
        if (!self._isMounted)
        {
            return;
        }
        alert(err);
        self.setState((prevState, props) => {
          return {loaded:true, err:err};
        });
    });
}

_handleLoadKlines(interval) {
    let self = this;
    let exchange = this.state.exchange;
    let pair = this.state.pair;
    return new Promise((resolve, reject) => {
        restClient.getKlines(exchange, pair, interval).then(function(data){
            let klines = parseData(data, interval);
            let result = {refreshPeriod:computeRefreshInterval(interval), data:klines}
            return resolve(result);
        }).catch (function(err){
            return reject(err);
        });
    });
}

componentWillReceiveProps(nextProps)
{
    let exchangeId = nextProps.data.exchange;
    let exchangeInstance = serviceRegistry.getExchange(exchangeId);

    // update klines interval
    let klinesIntervals = null;
    let klinesInterval = null;

    if (undefined !== exchangeInstance.features['klines'] && true === exchangeInstance.features['klines'].enabled)
    {
        klinesIntervals = exchangeInstance.features['klines'].intervals;
        klinesInterval = exchangeInstance.features['klines'].defaultInterval;
        if (undefined !== nextProps.match.params.interval)
        {
            if (-1 != klinesIntervals.indexOf(nextProps.match.params.interval))
            {
                klinesInterval = nextProps.match.params.interval;
            }
        }

        // same exchange ?
        if (exchangeId === this.state.exchangeId)
        {
            // use current interval
            klinesInterval = this.state.klinesInterval;
        }
    }

    this.setState(function(prevState, props){
        return {
            loaded:false,
            exchange:exchangeId,
            exchangeType:exchangeInstance.type,
            exchangeName:exchangeInstance.name,
            klinesIntervals:klinesIntervals,
            klinesInterval:klinesInterval,
            pair:undefined === nextProps.match.params.pair ? null : nextProps.match.params.pair
        };
    }, function(){
        this._loadData();
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._loadData();
}

render() {
    if (!this.state.loaded)
    {
        return (
            <div className="animated fadeIn">
              <br/>
              <ComponentLoadingSpinner/>
            </div>
        )
    }

    const CandleSticksComponent = () => {
        if (null === this.state.pair)
        {
            return null;
        }
        // use trading view if available
        if (tradingViewHelper.hasChartSupport(this.state.exchangeType))
        {
            return (
                <div className="animated fadeIn" style={{width:'92%'}}>
                  <br/>
                  <h6>CHART</h6>
                  <TradindViewCandleSticks exchange={this.state.exchangeType} pair={this.state.pair} klinesInterval={this.state.klinesInterval}/>
                </div>
            )
        }
        // use home made chart if possible
        else if (null !== this.state.klinesIntervals)
        {
            return (
                <div className="dark animated fadeIn" style={{width:'92%', overflow:'hidden'}}>
                    <br/>
                    <h6>CHART</h6>
                    <ReactStockChartsCandleSticks heightPercent={0.8} exchangeName={this.state.exchangeName} pair={this.state.pair} klinesInterval={this.state.klinesInterval} klinesIntervals={this.state.klinesIntervals} onLoadData={this._handleLoadKlines} onSelectKlinesInterval={this._handleSelectKlinesInterval}/>
                </div>
            );
        }
        return null;
    }

    return (
        <div className="animated fadeIn">
            <br/>
            <PairChooser exchange={this.state.exchange} pairs={this.state.data} pair={this.state.pair} OnSelectPair={this._handleSelectPair}/>
            <TickerComponent exchange={this.state.exchange} pair={this.state.pair}/>
            <CandleSticksComponent/>
        </div>
    );
}

}

export default Prices;
