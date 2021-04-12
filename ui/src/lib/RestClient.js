import axios from 'axios';
import serviceRegistry from './ServiceRegistry';

class RestClient {

constructor() {
    this._exchangeCache = {
        pairs: {
            cachePeriod:300,
            exchanges:{}
        }
    };
    this._marketCapCache = {
        symbols: {
            cachePeriod:300,
            data:undefined
        }
    };
    this._apiKey = null;
}

initialize(endpoint) {
    this._apiEndpoint = endpoint;
}

hasApiKey() {
    return null !== this._apiKey;
}

getApiKey() {
    return this._apiKey;
}

setApiKey(apiKey) {
    this._apiKey = apiKey;
}


/**
 * @param {string} exchange exchange identifier
 * @param {string} key to check
 * @return {object} cached data of undefined if value does not exist in cache or is expired
 */
_getExchangeCachedData(exchange, key) {
    // unsupported key
    if (undefined === this._exchangeCache[key]) {
        return;
    }
    // we don't have data for this exchange yet
    if (undefined === this._exchangeCache[key].exchanges[exchange]) {
        return;
    }
    let timestamp = new Date().getTime();
    // cache does not expire
    if (0 == this._exchangeCache[key].cachePeriod) {
        return this._exchangeCache[key].exchanges[exchange].data;
    }
    // cached data is not expired
    if (timestamp < this._exchangeCache[key].exchanges[exchange].expireAt) {
        return this._exchangeCache[key].exchanges[exchange].data;
    }
}

/**
* @param {string} exchange exchange identifier
* @param {string} key to cache value for
* @param {object} data data to cache
* @return {boolean} true if data was successfully cached, false otherwise
*/
_cacheExchangeData(exchange, key, data) {
    // unsupported key
    if (undefined === this._exchangeCache[key]) {
        return false;
    }
    let timestamp = new Date().getTime();
    // we don't have data for this exchange yet
    if (undefined === this._exchangeCache[key].exchanges[exchange]) {
        this._exchangeCache[key].exchanges[exchange] = {};
    }
    this._exchangeCache[key].exchanges[exchange].expireAt = timestamp + this._exchangeCache[key].cachePeriod * 1000;
    this._exchangeCache[key].exchanges[exchange].data = data;
    return true;
}

/**
 * @param {string} key to check
 * @return {object} cached data of undefined if value does not exist in cache or is expired
 */
_getMarketCapCachedData(key) {
    // unsupported key
    if (undefined === this._marketCapCache[key]) {
        return;
    }
    // we don't have data for this exchange yet
    if (undefined === this._marketCapCache[key].data) {
        return;
    }
    let timestamp = new Date().getTime();
    // cache does not expire
    if (0 == this._marketCapCache[key].cachePeriod) {
        return this._marketCapCache[key].data;
    }
    // cached data is not expired
    if (timestamp < this._marketCapCache[key].expireAt){
        return this._marketCapCache[key].data;
    }
}

/**
* @param {string} key to cache value for
* @param {object} data data to cache
* @return {boolean} true if data was successfully cached, false otherwise
*/
_cacheMarketCapData(key, data) {
    // unsupported key
    if (undefined === this._marketCapCache[key]) {
        return false;
    }
    let timestamp = new Date().getTime();
    this._marketCapCache[key].expireAt = timestamp + this._marketCapCache[key].cachePeriod * 1000;
    this._marketCapCache[key].data = data;
    return true;
}

/**
 * @param {string} path (relative or absolute)
 * @return {string} endpoint with trailing '/'
 */
_getUrl(path) {
    let p = path;
    // remove initial '/'
    if ('/' == path.substr(0, 1)) {
        p =  p.substr(1);
    }
    let endpoint = this._apiEndpoint + p;
    // add trailing '/' ?
    if ('/' != endpoint.substr(-1, 1)) {
        endpoint += '/';
    }
    return endpoint;
}

_getExchangeUrl(exchange, path) {
    let p = '/exchanges/' + exchange + '/';
    // remove initial '/'
    if ('/' == path.substr(0, 1)) {
        p += path.substr(1);
    }
    else {
        p += path;
    }
    return this._getUrl(p);
}

/**
 * @param {string} method http method
 * @param {string} url url to call
 * @param {object} data query params / body
 * @param {object} data.params query params (optional)
 * @param {object} data.body body (optional)
 * @param {object} cb callback to call after fetching results (optional)
 */
_sendRequest(method, url, data, cb) {
    let p = {
        method:method,
        url:url,
        headers:{}
    }
    if (null !== this._apiKey) {
        p.headers['apikey'] = this._apiKey;
    }
    let callback;
    if (undefined !== data) {
        if ('function' != typeof data) {
            if (undefined !== data.params) {
                p.params = data.params;
            }
            if (undefined !== data.body) {
                p.data = data.body;
            }
            if (undefined !== cb) {
                callback = cb;
            }
        }
        // we have a callback as third argument
        else {
            callback = data;
        }
    }
    return new Promise((resolve, reject) => {
        axios(p).then((response) => {
            if (undefined !== callback) {
                callback(response.data);
            }
            resolve(response.data);
        }).catch((err) => {
            if (undefined !== err.response) {
                return reject(err.response.data);
            }
            return reject(err);
        });
    });
}

//-- Server status
getServerStatus() {
    let path = '/server/uptime';
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

//-- Server config
getServerConfig() {
    let path = '/server/cfg';
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

//-- Services
getServices() {
    let path = '/server/services';
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

//-- Exchanges

getPairs(exchange) {
    // check cache
    let data = this._getExchangeCachedData(exchange, 'pairs');
    if (undefined !== data) {
        return new Promise((resolve, reject) => {
            resolve(data);
        });
    }
    let path = '/pairs';
    let params = {useCache:true};
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params}, (data) => {
        this._cacheExchangeData(exchange, 'pairs', data)
    });
}

getOpenOrders(exchange, pairs) {
    let path = '/openOrders';
    let params = {};
    if (undefined !== pairs) {
        // if list of requested pairs is empty, resolve to an empty dict (used in case there are no starred pairs)
        if (0 == pairs.length) {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        }
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params}, (data) => {
    });
}

getClosedOrders(exchange, pairs) {
    let path = '/closedOrders';
    let params = {};
    if (undefined !== pairs) {
        // if list of requested pairs is empty, resolve to an empty dict (used in case there are no starred pairs)
        if (0 == pairs.length) {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        }
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params}, (data) => {
    });
}

getClosedOrder(exchange, orderNumber) {
    let path = `/closedOrders/${orderNumber}`;
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {}, (data) => {
    });
}

getKlines(exchange, pair, interval) {
    let path = '/klines/' + pair;
    let params = {};
    if (undefined !== interval) {
        params.interval = interval;
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params});
}

getTickers(exchange, pairs) {
    let path = '/tickers';
    let params = {};
    if (undefined !== pairs) {
        params.pairs = pairs.join(',');
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params});
}

getBalances(exchange, currencies) {
    let params = {};
    if (undefined !== currencies)
    {
        params.currencies = currencies.join(',');
    }
    let path = '/balances';
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url, {params:params});
}

getOrderBook(exchange, pair) {
    let path = '/orderBooks/' + pair;
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url);
}

getTrades(exchange, pair) {
    let path = '/trades/' + pair;
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('get', url);
}

cancelOrder(exchange, orderNumber, pair) {
    let path = '/openOrders/' + orderNumber;
    let params = {pair:pair};
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('delete', url, {params:params});
}

createOrder(exchange, pair, orderType, quantity, rate) {
    let path = '/openOrders';
    let params = {
        pair:pair,
        orderType:orderType,
        quantity:quantity,
        targetRate:rate
    }
    let url = this._getExchangeUrl(exchange, path);
    return this._sendRequest('post', url, {params:params});
}

//-- MyAlerts

getAlerts(name) {
    let path = 'tickerMonitor';
    let params = {};
    if (undefined != name) {
        params.name = name;
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, {params:params});
}

getAlert(id) {
    let path = `tickerMonitor/${id}`;
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

createAlert(alert) {
    let path = 'tickerMonitor';
    let url = this._getUrl(path);
    return this._sendRequest('post', url, {body:alert});
}

updateAlert(alert, id) {
    let path = `tickerMonitor/${id}`;
    let url = this._getUrl(path);
    return this._sendRequest('patch', url, {body:alert});
}

deleteAlert(id) {
    let path = 'tickerMonitor';
    let params = {};
    if (undefined != name) {
        params.list = [id];
    }
    let url = this._getUrl(path);
    return this._sendRequest('delete', url, {params:params});
}

//-- MarketCap
getMarketCapTickers(limit, symbols) {
    let path = '/marketCap/tickers';
    let params = {};
    if (undefined !== symbols && 0 != symbols.length) {
        params.symbols = symbols;
    }
    else {
        if (undefined != limit) {
            params.limit = limit;
        }
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, {params:params});
}

/**
 * Retrieves the symbols supported by marketCap service
 */
getMarketCapSymbols() {
    // check cache
    let data = this._getMarketCapCachedData('symbols');
    if (undefined !== data) {
        return new Promise((resolve, reject) => {
            resolve(data);
        });
    }
    let path = '/marketCap/symbols';
    let url = this._getUrl(path);
    const params = {includeAliases:true};
    return this._sendRequest('get', url, {params:params}, (data) => {
        this._cacheMarketCapData('symbols', data)
    });

}

/**
 * Retrieves the list of all possible currencies which can be used for portfolio
 */
getPortfolioCurrencies() {
    return new Promise((resolve, reject) => {
        let list = [];
        let arr = [];
        // retrieve symbols
        arr.push(new Promise((resolve, reject) => {
            let path = '/marketCap/symbols';
            let url = this._getUrl(path);
            const params = {includeAliases:true};
            this._sendRequest('get', url, {params:params}).then((data) => {
                return resolve({data:data,success:true});
            }).catch ((err) => {
                return resolve({data:null,success:false,err:err});
            });
        }));
        let service = serviceRegistry.getService('fxConverter');
        if (null !== service) {
            // retrieve fiat currencies
            arr.push(new Promise((resolve, reject) => {
                let path = '/fxConverter/currencies';
                let url = this._getUrl(path);
                this._sendRequest('get', url).then((data) => {
                    return resolve({data:data,success:true});
                }).catch ((err) => {
                    return resolve({data:null,success:false,err:err});
                });
            }));
        }
        Promise.all(arr).then((values) => {
            _.forEach(values, (entry) => {
                if (!entry.success) {
                    return;
                }
                _.forEach(entry.data, (c) => {
                    list.push(c);
                });
            });
            // add USD if it's missing
            if (-1 == list.indexOf('USD')) {
                list.push('USD');
            }
            return resolve(list.sort());
        });
    });
}

//-- sessions management
listSessions() {
    let path = '/sessions';
    let params = {rpc:true,prefix:'mystream.'};
    let url = this._getUrl(path);
    return this._sendRequest('get', url, {params:params});
}

getSession(sid) {
    let path = `/sessions/${sid}`;
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

createSession(sid) {
    let path = `/sessions/${sid}`;
    let url = this._getUrl(path);
    return this._sendRequest('post', url);
}

deleteSession(sid) {
    let path = `/sessions/${sid}`;
    let url = this._getUrl(path);
    return this._sendRequest('delete', url);
}

getSessionSubscriptions(sid) {
    let path = `/sessions/${sid}/subscriptions`;
    let url = this._getUrl(path);
    return this._sendRequest('get', url);
}

addSessionSubscription(sid, exchange, type, pair, klinesInterval) {
    let path = `/sessions/${sid}/subscriptions/${exchange}/${type}/${pair}`;
    let params = {};
    if ('klines' == type) {
        params.interval = klinesInterval;
    }
    let url = this._getUrl(path);
    return this._sendRequest('post', url, {params:params});
}

deleteSessionSubscription(sid, exchange, type, pair, klinesInterval) {
    let path = `/sessions/${sid}/subscriptions/${exchange}/${type}/${pair}`;
    let params = {};
    if ('klines' == type) {
        params.interval = klinesInterval;
    }
    let url = this._getUrl(path);
    return this._sendRequest('delete', url, {params:params});
}

//-- Portfolio
/**
 * Loads portfolio
 * @param {string} exchangeId exchange id, if not null, overall portfolio will be retrieved
 * @param {string} currency currency used to compute portfolio value
 */
portfolio(exchangeId, currency) {
    let path = '/portfolio';
    let params = {};
    if (null !== exchangeId) {
        params.exchanges = exchangeId;
    }
    if ('USD' != currency) {
        params.convertTo = [currency];
    }
    let url = this._getUrl(path);
    return this._sendRequest('get', url, {params:params});
}

}

export default new RestClient();
