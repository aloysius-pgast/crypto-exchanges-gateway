# Change Log

## [v1.10.0]
### Gateway
* Update ccxt to version `1.50.8`

## [v1.9.1]
### Gateway
* New optional config parameter `sessions.hideIpaddr` to hide ip addresses when listing sessions
* Accept _true_ & _false_ for boolean environment variables
### UI
* Fix alerts refreshing when an alert is being edited (*My Alerts*)

## [v1.9.0]
### Gateway
* Replace https://api.exchangeratesapi.io with https://api.ratesapi.io for `/fxConverter` endpoint (previous one requires an API key)
### UI
* Possibility to create custom alerts (see *My Alerts* menu entry)

## [v1.8.2]
### Gateway
* Update dependencies

## [v1.8.1]
### Gateway
* Update dependencies
* Fix sorting in `marketCap` endpoint
### UI
* Return TOP 30 currencies instead of TOP 20 in `marketCap` view

## [v1.8.0]
### Gateway
* Fix a division by zero error for *Bittrex* & *Poloniex* when checking closed orders (see https://github.com/aloysius-pgast/crypto-exchanges-gateway/pull/89)
* *OKex* exchange now requires an extra config parameter (`password`)
* *Bittrex* exchange now supports an extra *optional* parameter (`ignoreRestrictedPairs`, default = `false`)
* Upgrade *ccxt* to version `1.28.5`

## [v1.7.15]
### Gateway
* Fix `getTickers` (*marketCap*) in case alias symbol is not found on *CoinCodex*

## [v1.7.14]
### Gateway
* Implement *OKex* WS API v3
* Filter unsupported pairs when returning *tickers* for *Bittrex* (REST)
* Fix disabling expiry of sessions

## [v1.7.13]
### Gateway
* Ensure RPC sessions are always stored into database

## [v1.7.12]
### Gateway
* Maximum number of listeners in `AbstractExchangeSubscriptionManager` has been increased to `100` to ensure more *non-RPC ws connections* can be supported without warning
* Various dependencies have been updated using `npm audit fix`

## [v1.7.11]
### UI
* `index.html` was updated so that app does not open in *safari* when added to home screen
* let browser cache `bundle.js` & `css` files
* store navigation context in `localStorage` to restore it when using *home screen* apps

## [v1.7.10]
### Gateway
* Fix `Kucoin` price limits
* Update `Kucoin` exchange to allow retrieving *tickers*, *open orders* & *closed orders* without providing the *pair*
* For `Kucoin`, *closed orders* retrieval is now limited to 7 days instead of 3 days
* Update `/exchanges/xxx/testOrder` endpoint to ensure `rate` is increased in case we reach `max(quantity)` with current rate
* Update `orderBooks` test to allow `rate = 0`
* Use `status` property instead of `remaining` property to decide if a `ccxt` error is `closed`
* Use ccxt version `1.18.311`

## [v1.7.9]
### Gateway
* Support for Kucoin API 2.0 (*closedOrders* retrieval is limited to 3 days for now)
* Fix `priceChangePercent` computation in tickers for ccxt exchanges
* Ensure trades returned by ccxt are sorted newest first
* Use ccxt version `1.18.281`

## [v1.7.8]
### Gateway
* Use native WS for Kucoin exchange instead of emulated
* Change fake balances generation for demo mode
* Support `string` value as well as `integer` for `afterTradeId` query parameter in `/exchanges/xxx/trades/yyyy` endpoint
* Support for module _coinmarketcap_ has been removed (replaced by module _marketCap_)
* Ensure we retrieve up-to-date market cap data from CoinCodex by adding current timestamp to request
* Minor fixes & code cleaning
### UI
* Use WS to retrieve klines instead of REST when displaying chart using *react-stockcharts*

## [v1.7.7]
### Gateway
* Fix typo in _tickerMonitor_ module

## [v1.7.6]
### Gateway
* [CoinMarketCap](https://coinmarketcap.com/) support is deprecated and will be removed around mid-december (module _coinmarketcap_ needs to be enabled explicitely)
* Use [Coin Codex](https://coincodex.com/) API instead of [CoinMarketCap](https://coinmarketcap.com/) to provide market cap informations
* New endpoint _/fxConverter_ to convert between fiat currencies usng module *fxConverter*

## [v1.7.5]
### Gateway
* Handle changes in OKex WS API (data is now returned compressed using deflate)

## [v1.7.4]
### Gateway
* Fix closed orders retrieval for _Kucoin_ (trades needed to be merged)
* Fix klines retrieval to handle exchanges outages (in such case some klines entries might be missing)
### UI
* Support for _klines_ subscriptions in _My Streams_ view
* Klines interval can be defined in url when opening _Prices_ view (ex: _/#/exchanges/binance/prices/BTC-NEO/5m_)

## [v1.7.3]
### Gateway
* Fix an error when doing klines subscriptions through REST API

## [v1.7.2]
### Gateway
* Add _closed_ & _remainingTime_ attributes to _klines_ entries
* Provide default _wsKlines_ implementation for exchanges which do not support klines over ws by querying REST endpoint periodically
* Enable _wsKlines_ emulation by default for _Kucoin_, _Bittrex_ & _Poloniex_
### UI
* Possibility to choose klines period (ie: to automatically select the best interval to get klines for the last 3 days for example)


## [v1.7.1]
### Gateway
* Support for _OKEx_ exchange (REST) through _ccxt_
* Support for _OKEx_ exchange (WS)
* Support for limiting the number of subscriptions allowed for a session
* Support for limiting the duration of a session
* Add _orderType_ when emitting _trades_ event for _Poloniex_ exchange
### UI
* Make _Market Overview_ the default view in case user has some starred pairs
* New view _My Streams_ (can be used to define custom ws streams which multiplex data from various exchanges)

## [v1.7.0]
### Gateway
* Support for Kucoin exchange through _ccxt_
* Provide default _wsTickers_ implementation for exchanges which do not support tickers over ws by querying REST endpoint periodically
* Provide default _wsOrderBooks_ implementation for exchanges which do not support order books over ws by querying REST endpoint periodically
* Provide default _wsTrades_ implementation for exchanges which do not support trades over ws by querying REST endpoint periodically
### UI
* Possibility to import/export settings (ie: _starred pairs_)
* Home-made charting when exchange is not supported by _Trading View_ (*react-stockcharts is AMAZING*)

## [v1.6.4]
### Gateway
* Support for conversion to others currencies in _/portfolio_ route
### UI
* Support for conversion to a currency != _USD_ in _My Portfolio_ view
* Support to choose a specific currency in _Coin Market Cap_ view

## [v1.6.3]
### Gateway
* Support for new _limit_ parameter in _/exchanges/{exchange}/klines_ route
* Support for new error _ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.UnknownError_
* Added mapping _XRB_ <=> _NANO_ in _/portfolio_ route
### UI
* Fix pair caching

## [v1.6.2]
### UI
* Ensure cancelled orders are displayed correctly when listing completed orders
* Changing _pair_ in the url was not not working in _My Orders_ view

## [v1.6.1]
### UI
* Changing _pair_ in the url was not not working in _Prices_ view

## [v1.6.0]
### Gateway
* Refactoring of code related to exchanges & services
* Support for retrieving history from Coin Market Cap (see [here](doc/coinmarketcap) for documentation and changes) (enabled by default)
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
