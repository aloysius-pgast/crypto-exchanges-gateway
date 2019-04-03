import _ from 'lodash';

/**
 * Used to persist context for IOS standalone apps
 */

class StandaloneContext
{

constructor()
{
    this._ctx = {};
    this._isSupported = false;
    this._pairs = {};
    this._route = undefined;
}

isSupported()
{
    return this._isSupported;
}

getExchangesPairs()
{
    return this._pairs;
}

setExchangePair(exchange, pair)
{
    if (!this._isSupported) {
        return;
    }
    if (this._pairs[exchange] === pair)
    {
        return;
    }
    this._pairs[exchange] = pair;
    const key = `standalone:${exchange}:pair`;
    const value = {exchange:exchange,pair:pair};
    window.localStorage.setItem(key, JSON.stringify(value));
}

/**
 * @param {string} route new route
 * @param {object} opt (optional, only defined for an exchange route)
 * @param {string} opt.exchange exchange name
 * @param {boolean} opt.supportsPair whether or not route supports an exchange pair
 */
setRoute(route, opt)
{
    if (!this._isSupported)
    {
        return;
    }
    this._route = {route:route};
    if (undefined !== opt)
    {
        this._route.exchange = opt.exchange;
        this._route.supportsPair = opt.supportsPair;
    }
    const key = 'standalone:route';
    window.localStorage.setItem(key, JSON.stringify(this._route));
}

getRoute()
{
    if (undefined === this._route)
    {
        return undefined;
    }
    return this._route.route;
}

load()
{
    if (true !== window.navigator.standalone || !window.ctx.hasLocalStorage)
    {
        return false;
    }
    this._isSupported = true;
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('standalone:'))
        {
            continue;
        }
        let value = window.localStorage.getItem(key);
        // entry was removed (not supposed to happen)
        if (null === value)
        {
            continue;
        }
        let obj = JSON.parse(value);
        // this is the route
        if (undefined !== obj.route)
        {
            this._route = obj;
        }
        // this is a pair
        else if (undefined !== obj.pair)
        {
            this._pairs[obj.exchange] = obj.pair;
        }
    }
    // update DataStore
    return true;
}

}

export default new StandaloneContext();
