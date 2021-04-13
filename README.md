# crypto-exchanges-gateway

Your gateway to the world of crypto !

## Disclaimer

This project cannot be considered in any way as trading advice.

Use it at your own risks and be careful with your money ;)

## Faq

* Does it support real-time data ?

Yes, gateway provides a WS endpoint. See [video](https://youtu.be/_LfLLT693AM) explaining how to create custom WS streams

* What about _ccxt_ ?

_ccxt_ is a very nice project which provides a library to connect to multiple exchanges (_php_,_js_,_python_). When I started, I wasn't aware of the project. While _ccxt_ aims at providing a library, I want to offer an http gateway as an independant service to be used by any REST client (so virtually any language).

Btw, _ccxt_ library is now used to interface with some exchanges ;)

* What is the monthly fee for the service ?

There is no monthly fee. It's free since you will be the one running the service on your own server

* Where is your service hosted ?

This is a self-hosted service. You need to install it on your own server

* I saw you are accepting donations. What extra service will I get for a donation ?

Besides the privilege to go to bed, knowing that you did the right thing ? Not much

## What it does

* Provides a unified REST API to various exchanges (can be used to automate trading or build bots)
* Handles authentication so that on client side you can concentrate on what really matters
* Implements rate limiting when forwarding requests to remote exchanges
* Provides a REST API to send push notifications using [PushOver](https://pushover.net/api)
* Provides a basic UI which implements most API calls (see [documentation in _doc_ directory](doc/ui/index.adoc))
* Provides WS access for real-time data (tickers, order books & trades, see [documentation in _doc_ directory](doc/ws/index.adoc) and [video](https://youtu.be/_LfLLT693AM) explaining how to create custom WS streams to multiplex data from multiple exchanges)
* Access to a portfolio portfolio overview across all exchanges with estimated value in USD
* Advanced alerting system

<img src="doc/ui/img/tickers.png" width="400"/>

See a live demo at https://mpe-demo.crazyme.net/ui/

Of course, above demo **does not use any valid _user/token_**. This means the following :

* everything related to _price_ & _order book_ is **populated with real data**
* the list of _open/completed orders_ is **filled with random data**
* the list of _balances_ is **filled with random data**
* _new orders_ **won't be actually executed** ;)

In order to have a full experience, just follow [installation steps](#installation)

## How to use it

[Install](#installation) it wherever you want and start sending requests from your own program

* it can be hosted on a VM in the cloud
* it can be installed at home, on a [Raspberry Pi](https://www.raspberrypi.org/products/raspberry-pi-zero-w/)

Just use you favorite language (_python_, _javascript_, _ruby_, _bash_, ...) to send request to the gateway. Your own service, your own rules !

A _Node.js_ client is available [here](https://github.com/aloysius-pgast/crypto-exchanges-rest-client-nodejs) or as a [npm package](https://www.npmjs.com/package/crypto-exchanges-rest-client)

## Available Exchanges

Currently supports for following exchanges :

* [Binance](https://www.binance.com/) (my favorite)
* [Bittrex](https://www.bittrex.com/)
* [Kucoin](https://www.kucoin.com)
* [OKEx](https://www.okex.com)
* [Poloniex](https://www.poloniex.com) ([**worst support**](https://www.reddit.com/r/PoloniexForum/) ever)
* More to come...

Following API are currently supported :

* Retrieve pairs
* Retrieve tickers
* Retrieve order book
* Retrieve last executed trades
* Retrieve klines (charts data)
* List open orders
* List closed orders
* Retrieve a single order
* Test an order (to ensure quantity and price match exchange filters)
* Create an order
* Retrieve balances

See [documentation in _doc_ directory](doc/exchanges/index.adoc) for an overview of each REST API

See [documentation in _doc_ directory](doc/ws/index.adoc) for a description of the supported _websocket protocol_ (similar to _JSON-RPC_)

See [documentation in _doc_ directory](doc/unitTests.adoc) for informations regarding unit tests

## Alerts

Have you ever wanted to receive an alert in case ALL of the following conditions are met :
* NEO-USDT price in range [120, 135] on Binance
* NEO-BTC price on Bittrex < 0.010
* NEO price in MarketCap module > 125$

Probably not ;) Anyway, you will now be able to define this kind of custom alerts. See [documentation in _doc_ directory](doc/tickerMonitor/index.adoc)

It comes with built-in support for [PushOver](https://pushover.net/) but any other notification system can be easily implemented (through third party applications) since all alert changes are emitted over a websocket endpoint (see [documentation in _doc_ directory](doc/ws/notifications.adoc#tickermonitor-notifications))

## Limitations

* Margin trading is not supported (and is unlikely to be)
* Withdrawal is not supported (and is unlikely to be)
* _Stop loss_ & _trailing stop loss_ are not supported for the moment (although it might be supported at some point)

## Other services

### MarketCap

MarketCap module supports :

* Tickers

See [documentation in _doc_ directory](doc/marketCap/index.adoc) for an overview of each API

### Push Over

[PushOver](https://pushover.net/) module supports :

* Push notifications

See [documentation in _doc_ directory](doc/pushover/index.adoc) for an overview of each API)

## Rate limiting

Rate limiting is implemented when required by exchange thanks to [Bottleneck](https://www.npmjs.com/package/bottleneck)

## Installation

* Install dependencies

```
npm install
```

* Copy sample config

```
cp config/config.sample.json config/config.json
```

Check [documentation in _doc_ directory](doc/config.adoc) for detailed information on each config section

* Start gateway

```
node gateway.js
```

* Build UI

If you want to use the UI, follow these steps to build the UI before starting the gateway:

```
cd ui
npm install && ./rebuild-ui
```

* Check which exchanges are enabled

Open http://127.0.0.1:8000/exchanges/ in your browser. You should see JSON content such as below :

```javascript
["binance","bittrex","poloniex","kucoin"]
```

By default, only public API will be enabled. In order to access trading/private API, you need to update _config.json_ with appropriate _user_ and _secret_ provided by exchange (check [documentation in _doc_ directory](doc/config.adoc) )

* Check BTC & ETH prices using _MarketCap_ module

Open http://127.0.0.1:8000/marketCap/tickers?symbols=BTC,ETH in your browser. You should see JSON content such as below :

```javascript
[
    {
        "symbol":"BTC",
        "name":"Bitcoin",
        "circulating_supply":17372012,
        "price_usd":6406.1049,
        "percent_change_1h":-0.08,
        "percent_change_1d":-0.08,
        "percent_change_7d":-0.15,
        "volume_24h_usd":3120534126.1266,
        "lastUpdated":1542009997,
        "market_cap_usd":111286930723.4185,
        "rank":1,
        "price_btc":1
    },
    {
        "symbol":"ETH",
        "name":"Ethereum",
        "circulating_supply":103150460,
        "price_usd":210.4854,
        "percent_change_1h":-0.39,
        "percent_change_1d":-0.39,
        "percent_change_7d":-0.8,
        "volume_24h_usd":1294093048.2094,
        "lastUpdated":1542009997,
        "market_cap_usd":21711669585.6914,
        "rank":2,
        "price_btc":0.032857
    }
]
```

* Place an order to buy 1 NEO at 0.0040BTC on Bittrex (assuming you have enough funds)

Execute the following in a terminal :

```
curl -X POST 'http://127.0.0.1:8000/exchanges/bittrex/openOrders?pair=BTC-NEO&quantity=1&targetRate=0.0040'
```

You should see JSON content such as below :

```javascript
{"orderNumber":"8bc49a59-1056-4c20-90f2-893fff2be279"}
```

* Cancel above order (assuming order still exists)

Execute the following in a terminal :

```
curl -X DELETE 'http://127.0.0.1:8000/exchanges/bittrex/openOrders/8bc49a59-1056-4c20-90f2-893fff2be279'
```

You should see JSON content such as below in case order is valid :

```javascript
{}
```

## Docker

See this [video](https://youtu.be/SQf3diruc8w) to know how to be ready to trade in less then 3 minutes using Docker & Kitematic

A docker image is available at https://hub.docker.com/r/apendergast/crypto-exchanges-gateway/

* Pull image

```
docker pull apendergast/crypto-exchanges-gateway
```

* Run image

```
docker run --rm -p 8000:8000 -p 8001:8001 --name ceg apendergast/crypto-exchanges-gateway
```

You should then be able to access service on http://127.0.0.1:8000

WS endpoint will be available on _ws://127.0.0.1:8001_

* Check which exchanges are enabled

Open http://127.0.0.1:8000/exchanges/ in your browser. You should see JSON content such as below :

```javascript
["binance","bittrex","kucoin","okex","poloniex"]
```

By default, only public API will be enabled. In order to access trading/private API, you need to pass environment when creating container. Following environment variables are available :

* cfg.logLevel : log level
* cfg.listen.externalEndpoint : used to indicates the external endpoint used to reach http socket, in case gateway is running behing a proxy
* cfg.listenWs.externalEndpoint : used to indicates the external endpoint used to reach ws socket, in case gateway is running behing a proxy
* cfg.sessions.maxSubscriptions : maximum number of subscriptions allowed for a given session (optional, default = _0_, no maximum)
* cfg.sessions.maxDuration : maximum duration in second for a given session (optional, default = _0_, no maximum)
* cfg.auth.apikey : API Key used to protect access
* cfg.ui.enabled : enable/disable UI (value should be set to _1_ to enable UI, _0_ to disable UI)
* cfg.tickerMonitor.enabled : enable/disable Ticker Monitor module (value should be set to _1_ to enable Ticker Monitor, _0_ to disable Ticker Monitor) (default = _1_)
* cfg.marketCap.enabled : enable/disable MarketCap module (value should be set to _1_ to enable MarketCap module, _0_ to disable MarketCap module) (default = _1_)
* cfg.pushover.user : PushOver user key
* cfg.pushover.token : PushOver token
* cfg.exchanges.poloniex.enabled : value should be set to _1_ to enable exchange, _0_ to disable exchange (default = _1_)
* cfg.exchanges.poloniex.key : Poloniex user key
* cfg.exchanges.poloniex.secret : Poloniex secret
* cfg.exchanges.bittrex.enabled : value should be set to _1_ to enable exchange, _0_ to disable exchange (default = _1_)
* cfg.exchanges.bittrex.key : Bittrex user key
* cfg.exchanges.bittrex.secret : Bittrex secret
* cfg.exchanges.binance.enabled : value should be set to _1_ to enable exchange, _0_ to disable exchange (default = _1_)
* cfg.exchanges.binance.requirePair : value should be set to _0_ to allow retrieving tickers/orders for all pairs at once, _1_ to require pair for such operations (default = _0_)
* cfg.exchanges.binance.key : Binance user key
* cfg.exchanges.binance.secret : Binance secret
* cfg.exchanges.kucoin.enabled : value should be set to _1_ to enable exchange, _0_ to disable exchange (default = _1_)
* cfg.exchanges.kucoin.requirePair : value should be set to _0_ to allow retrieving tickers/orders for all pairs at once, _1_ to require pair for such operations (default = _0_)
* cfg.exchanges.kucoin.key : Kucoin user key
* cfg.exchanges.kucoin.secret : Kucoin secret
* cfg.exchanges.okex.enabled : value should be set to _1_ to enable exchange, _0_ to disable exchange (default = _1_)
* cfg.exchanges.okex.requirePair : value should be set to _0_ to allow retrieving tickers/orders for all pairs at once, _1_ to require pair for such operations (default = _0_)
* cfg.exchanges.okex.key : OKEx user key
* cfg.exchanges.okex.secret : OKEx secret

If you don't want to use environment variables or want to customize config for a running container, you can create and edit *custom_config/config.json*

_Examples_ :

Run container with Bittrex user/key environment variables

```
docker run --rm -p 8000:8000 -p 8001:8001 --name ceg -e cfg.exchanges.bittrex.key='abcdefghijkl' -e cfg.exchanges.bittrex.secret='123456789' apendergast/crypto-exchanges-gateway
```

## Dependencies

This project was made possible thanks to following projects :

* [big.js](https://www.npmjs.com/package/big.js)
* [binance](https://www.npmjs.com/package/binance)
* [body-parser](https://www.npmjs.com/package/body-parser)
* [bottleneck](https://www.npmjs.com/package/bottleneck) (for rate limiting)
* [ccxt](https://www.npmjs.com/package/ccxt) (used to interface with some exchanges)
* [chump](https://www.npmjs.com/package/chump) (for PushOver)
* [css-select](https://www.npmjs.com/package/css-select) (for HTML parsing)
* [express](https://www.npmjs.com/package/express)
* [express-ws](https://www.npmjs.com/package/express-ws)
* [htmlparser2](https://www.npmjs.com/package/htmlparser2) (for HTML parsing)
* [joi](https://www.npmjs.com/package/joi) (for JSON schema validation)
* [lodash](https://www.npmjs.com/package/lodash)
* [mocha](https://www.npmjs.com/package/mocha) (for unit tests)
* [node-bittrex-api](https://www.npmjs.com/package/node-bittrex-api)
* [poloniex-api-node](https://www.npmjs.com/package/poloniex-api-node)
* [retry](https://www.npmjs.com/package/retry) (for custom retry strategies upon network failure)
* [request](https://www.npmjs.com/package/request)
* [sqlite3](https://www.npmjs.com/package/sqlite3) (for data storage)
* [uuid](https://www.npmjs.com/package/uuid)
* [winston](https://www.npmjs.com/package/winston) (for logging)
* [ws](https://www.npmjs.com/package/ws)
* [yargs](https://www.npmjs.com/package/yargs) (for CLI commands)

## Donate

This project is a work in progress. If you find it useful, you might consider a little donation ;)

BTC: `163Bu8qMSDoHc1sCatcnyZcpm38Z6PWf6E`

ETH: `0xDEBBEEB9624449D7f2c87497F21722b1731D42a8`

NEO/GAS: `AaQ5xJt4v8GunVchTJXur8WtM8ksprnxRZ`
