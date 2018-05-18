# Display exchange's limits

Script _getLimits_ can be used to display limits

```
./getLimits -h
Options:
  --help, -h      display help                                         [boolean]
  --exchange, -e  exchange identifier                                 [required]
  --pair, -p      pair (X-Y)                                          [required]
  --uri, -u       base gateway uri (http://{host}:{port})
                                              [default: "http://127.0.0.1:8000"]
  --apiKey, -k    API key declared on gateway
```

Example

```
./getLimits -e binance -p USDT-NEO
    FIELD     |    MIN    |   MAX   |   STEP    | PRECISION  |
  targetRate  |   0.000001|   100000|   0.000001|           6|
   quantity   |       0.01|   100000|       0.01|           2|
 targetPrice  |      0.001|         |           |            |
```


# Test order creation

Script _createOrder_ can be used to test order creation

```
./createOrder -e binance -t sell -p BTC-NEO -q 0.6
Please wait while test suite is being built...OK


  Create 'sell' order for 'BTC-NEO' pair on 'binance' exchange
    Create INVALID order
      POST /exchanges/binance/openOrders {"orderType":"sell","pair":"BTC-NEO","targetRate":200000,"quantity":0.6}
        ✓ it should fail with a 400 error (ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition) because :
- 'targetRate' should be <= 100000 (targetRate = 200000.00000000) (309ms)
{
    "origin": "remote",
    "error": "Filter failure: PRICE_FILTER",
    "route": {
        "method": "POST",
        "path": "/exchanges/binance/openOrders"
    },
    "extError": {
        "errorType": "ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate",
        "message": "Filter failure: PRICE_FILTER",
        "data": {
            "exchange": "binance",
            "pair": "BTC-NEO",
            "rate": 200000,
            "error": {
                "code": -1013,
                "msg": "Filter failure: PRICE_FILTER"
            }
        }
    }
}
    Create VALID order
      POST /exchanges/binance/openOrders {"orderType":"sell","pair":"BTC-NEO","targetRate":0.07403,"quantity":0.6}
        ✓ it should successfully create an order (319ms)
{
    "orderNumber": "p0yFvnvKWNuLLmWBuCdJwf"
}


  2 passing (636ms)

Cancelling order 'p0yFvnvKWNuLLmWBuCdJwf'...OK
```
