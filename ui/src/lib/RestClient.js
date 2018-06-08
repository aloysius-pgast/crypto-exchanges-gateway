import axios from 'axios';

class RestClient
{

constructor()
{
    this._exchangeCache = {
        pairs: {
            cachePeriod:300,
            exchanges:{}
        }
    }
    this._apiKey = null;
}

initialize(endpoint)
{
    this._apiEndpoint = endpoint;
}

hasApiKey()
{
    return null !== this._apiKey;
}

getApiKey()
{
    return this._apiKey;
}

setApiKey(apiKey)
{
    this._apiKey = apiKey;
}


/**
 * @param {string} exchange exchange identifier
 * @param {string} key to check
 * @return {object} cached data of undefined if value does not exist in cache or is expired
 */
_getExchangeCachedData(exchange, key)
{
    // unsupported key
    if (undefined === this._exchangeCache[key])
    {
        return;
    }
    // we don't have data for this exchange yet
    if (undefined === this._exchangeCache[key].exchanges[exchange])
    {
        return;
    }
    let timestamp = new Date().getTime();
    // cache does not expire
    if (0 == this._exchangeCache[key].cachePeriod)
    {
        return this._exchangeCache[key].exchanges[exchange].data;
    }
    // cached data is not expired
    if (timestamp < this._exchangeCache[key].exchanges[exchange].expireAt)
    {
        return this._exchangeCache[key].exchanges[exchange].data;
    }
}

/**
* @param {string} exchange exchange identifier
* @param {string} key to cache value for
* @param {object} data data to cache
* @return {boolean} true if data was successfully cached, false otherwise
*/
_cacheExchangeData(exchange, key, data)
{
    // unsupported key
    if (undefined === this._exchangeCache[key])
    {
        return false;
    }
    let timestamp = new Date().getTime();
    // we don't have data for this exchange yet
    if (undefined === this._exchangeCache[key].exchanges[exchange])
    {
        this._exchangeCache[key].exchanges[exchange] = {};
    }
    this._exchangeCache[key].exchanges[exchange].expireAt = timestamp + this._exchangeCache[key].cachePeriod * 1000;
    this._exchangeCache[key].exchanges[exchange].data = data;
    return true;
}

/**
 * @param {string} path (relative or absolute)
 * @return {string} endpoint with trailing '/'
 */
_getUrl(path)
{
    let p = path;
    // remove initial '/'
    if ('/' == path.substr(0, 1))
    {
        p =  p.substr(1);
    }
    let endpoint = this._apiEndpoint + p;
    // add trailing '/' ?
    if ('/' != endpoint.substr(-1, 1))
    {
        endpoint += '/';
    }
    return endpoint;
}

_getExchangeUrl(exchange, path)
{
    let p = '/exchanges/' + exchange + '/';
    // remove initial '/'
    if ('/' == path.substr(0, 1))
    {
        p += path.substr(1);
    }
    else
    {
        p += path;
    }
    return this._getUrl(p);
}

/**
 * @param {string} method http method
 * @param {string} url url to call
 * @param {object} params query params (optional)
 * @param {object} cb callback to call after fetching results (optional)
 */
_sendRequest(method, url, params, cb)
{
    let p = {
        method:method,
        url:url,
        headers:{}
    }
    if (null !== this._apiKey)
    {
        p.headers['apikey'] = this._apiKey;
    }
    let callback;
    if (undefined !== params)
    {
        if ('function' != typeof params)
        {
            p.params = params;
            if (undefined !== cb)
            {
                callback = cb;
            }
        }
        // we have a callbacl at third argument
        else
        {
            callback = params;
        }
    }
    return new Promise((resolve, reject) => {
        axios(p).then(function(response) {
            if (undefined !== callback)
            {
                callback(response.data);
            }
            resolve(response.data);
        }).catch(function(err){
            if (undefined !== err.response)
            {
                return reject(err.response.data);
            }
            return reject(err);
        });
    });
}

//-- Server status
getServerStatus()
{
    let path = '/server/uptime';
    let url = this._getUrl(path);
    let self = this;
    return this._sendRequest('get', url);
}

//-- Services
getServices()
{
    let path = '/server/services';
    let url = this._getUrl(path);
    let self = this;
    return this._sendRequest('get', url);
}

//-- Exchanges

getPairs(exchange)
{
    // check cache
    let data = this._getExchangeCachedData(exchange, 'pairs');
    if (undefined !== data)
    {
        return new Promise((resolve, reject) => {
            resolve(data);
        });
    }
    let path = '/pairs';
    let url = this._getExchangeUrl(exchange, path);
    let self = this;
    return this._sendRequest('get', url, function(data){
        self._cacheExchangeData(exchange, 'pairs', data)
    });
}

getOpenOrders(exchange, pairs)
{
    let path = '/openOrders';
    let params = {};
    if (undefined !== pairs)
    {
        // if list of requested pairs is empty, resolve to an empty dict (used in case there are no starred pairs)
        if (0 == pairs.length)
        {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        }
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    let self = this;
    return this._sendRequest('get', url, params, function(data){
    });
}

getOpenOrder(exchange, orderNumber)
{
    let path = `/openOrders/${orderNumber}`;
    let url = this._getExchangeUrl(exchange, path);
    let self = this;
    return this._sendRequest('get', url, params, function(data){
    });
}

getClosedOrders(exchange, pairs)
{
    let path = '/closedOrders';
    let params = {};
    if (undefined !== pairs)
    {
        // if list of requested pairs is empty, resolve to an empty dict (used in case there are no starred pairs)
        if (0 == pairs.length)
        {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        }
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    let self = this;
    return this._sendRequest('get', url, params, function(data){
    });
}

getClosedOrder(exchange, orderNumber)
{
    let path = `/closedOrders/${orderNumber}`;
    let params = {};
    let url = this._getExchangeUrl(exchange, path);
    let self = this;
    return this._sendRequest('get', url, {}, function(data){
    });
}

getKlines(exchange, pair, interval)
{
    let path = '/klines/' + pair;
    let params = {};
    if (undefined !== interval)
    {
        params.interval = interval;
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, params);
}

getTickers(exchange, pairs)
{
    let path = '/tickers';
    let params = {};
    if (undefined !== pairs)
    {
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, params);
}

getBalances(exchange, currencies)
{
    let params = {};
    if (undefined !== currencies)
    {
        params.currencies = currencies.join(',');
    }
    let path = '/balances';
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, params);
}

getOrderBook(exchange, pair)
{
    let path = '/orderBooks/' + pair;
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url);
}

getTrades(exchange, pair)
{
    let path = '/trades/' + pair;
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url);
}

cancelOrder(exchange, orderNumber, pair)
{
    let path = '/openOrders/' + orderNumber;
    let params = {pair:pair};
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('delete', url, params);
}

createOrder(exchange, pair, orderType, quantity, rate)
{
    let path = '/openOrders';
    let params = {
        pair:pair,
        orderType:orderType,
        quantity:quantity,
        targetRate:rate
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('post', url, params);
}

getAlerts(name)
{
    let path = 'tickerMonitor';
    let params = {};
    if (undefined != name)
    {
        params.name = name;
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, params);
}

//-- CoinMarketCap
getCoinMarketCapTickers(limit, symbols)
{
    let path = '/coinmarketcap/tickers';
    let params = {};
    if (undefined !== symbols && 0 != symbols.length)
    {
        params.symbols = symbols;
    }
    else
    {
        if (undefined != limit)
        {
            params.limit = limit;
        }
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, params);
}

/**
 * Retrieves the symbols supported on CMC
 */
getCoinMarketCapSymbols()
{
    let path = '/coinmarketcap/symbols';
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

/**
 * Retrieves the list of all possible currencies on CMC (fiat & symbols)
 */
getCoinMarketCapCurrencies()
{
    return new Promise((resolve, reject) => {
        let list = ['USD'];
        let arr = [];
        let self = this;
        // retrieve symbols
        arr.push(new Promise((resolve, reject) => {
            let path = '/coinmarketcap/symbols';
            let url = self._getUrl.call(self, path);
            self._sendRequest.call(self, 'get', url).then(function(data){
                return resolve({data:data,success:true});
            }).catch (function(err){
                return resolve({data:null,success:false,err:err});
            });
        }));
        // retrieve fiat currencies
        arr.push(new Promise((resolve, reject) => {
            let path = '/coinmarketcap/fiatCurrencies';
            let url = self._getUrl.call(self, path);
            self._sendRequest.call(self, 'get', url).then(function(data){
                return resolve({data:data,success:true});
            }).catch (function(err){
                return resolve({data:null,success:false,err:err});
            });
        }));
        Promise.all(arr).then(function(values){
            _.forEach(values, (entry) => {
                if (!entry.success)
                {
                    return;
                }
                _.forEach(entry.data, (c) => {
                    list.push(c);
                });
            });
            return resolve(list.sort());
        });
    });
}

//-- Portfolio
/**
 * Loads portfolio
 * @param {string} exchangeId exchange id, if not null, overall portfolio will be retrieved
 * @param {string} currency currency used to compute portfolio value
 */
portfolio(exchangeId, currency)
{
    let path = '/portfolio';
    let params = {};
    if (null !== exchangeId)
    {
        params.exchanges = exchangeId;
    }
    if ('USD' != currency)
    {
        params.convertTo = [currency];
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, params);
}

}

export default new RestClient();
