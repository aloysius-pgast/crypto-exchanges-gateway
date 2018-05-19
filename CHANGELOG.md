# Change Log

## [v1.6.0]
### Gateway
* Refactoring of code related to exchanges & services
* Support for retrieving history from Coin Market Cap (see [here](doc/coinmarketcap) for documentation and changes)
* Support for multiple instances of same exchange (might not be supported for all exchanges)
* Better error handling (see [here](doc/errors.adoc) for documentation)
* Indicate _fees_ when listing closed orders
* Support for klines retrieval on _Binance_, _Bittrex_ and _Poloniex_
* New route to test order creation and ensure _quantity_, _rate_ & _price_ match exchange filters (ie: min values, precision, step...)
* New route to retrieve a single order (open or closed using its order number)
* Support for alerts based on _price_, _volume_ using _Ticker Monitor_ module
* Unit tests (see [here](doc/unitTests.adoc) for documentation)
### UI
* Use modal to display confirmation form when creating new orders
* Indicate gateway version in _Home_ view
* _My Orders_ view will now display orders for a single currency
* _All My Orders_ view will display orders for all currencies

## [v1.5.0]
### Gateway
* New route _/portfolio_ to retrieve portfolio across all exchanges
* Use _Binance_ WS to provide real-time tickers instead of REST API
* _BNB_ pairs were not returned by _/pairs_ route on _Binance_
* Provide informations regarding limits for _rate_, _quantity_ & _price_ in _/pairs_ route
### UI
* Display portfolio (table + chart)
* Display informations regarding limits for _rate_, _quantity_ & _price_ in _newOrder_ view and try to ensure we only submit order if all limits are respected
* Possibility to choose a % of balance when placing orders

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
