# Change Log

## [v1.5.0]
### Gateway
* New route _/portfolio_ to retrieve portfolio across all exchanges
* Use _Binance_ WS to provide real-time tickers instead of REST API
* _BNB_ pairs were not returned by _/pairs_ route on _Binance_
* Provide informations regarding limits for _rate_, _quantity_ & _price_ in _/pairs_ route
### UI
* Display portfolio (table + chart)
* Display informations regarding limits for _rate_, _quantity_ & _price_ in _newOrder_ view and try to ensure we only submit order if all limits are respected

## [v1.4.0]
### Gateway
* Support for Klines (chart data) on Binance exchange (REST + WS)

### UI
* Restrict orders retrieval to starred pairs for Binance exchange (for performance reasons)
* TradingView charts for Binance

## [v1.3.1]
* Fix Binance tickers (last price returned by 'ticker24hr' API was not reflecting current 'last price')
* Display TradingView drawing toolbar on tablets & desktop
* Support for same favorite pair on multiple exchanges

## [v1.3.0]
* Support for real-time data over websocket (new config parameter _listenWs_ is necessary) :
  * Support for tickers retrieval
  * Support for order books retrieval (full & update)
  * Support for trades retrieval

## [v1.2.1]
* Fix errors in UI when exchanges' _api keys_ & _secrets_ are not defined

## [v1.2.0]
* Use _float_ instead of _integer_ for timestamp related information (_tickers_, _openOrders_, _closedOrders_)
* Add order type (_buy_ or _sell_) in _trades_ API
* Fix authentication using _ApiKey_ header
* Support for Binance recvWindow parameter in config.json (to account for clock skew)
* Bittrex module changed from _node.bittrex.api_ to _node-bittrex-api_ module (version 0.7.6)
* Poloniex module updated to version 1.6.2
* Minor UI navigation changes
