import _ from 'lodash';
import standaloneContext from './StandaloneContext';

class DataStore
{

constructor()
{
    this._store = {
        global:{},
        exchanges:{}
    }
}

getExchangeData(exchange, key)
{
    if (undefined === this._store.exchanges[exchange])
    {
        return null;
    }
    if (undefined === this._store.exchanges[exchange][key])
    {
        return null;
    }
    return this._store.exchanges[exchange][key];
}

/**
 * @param {string} exchange exchange name
 * @param {string} key
 * @param {string} value
 */
setExchangeData(exchange, key, value)
{
    if (undefined === this._store.exchanges[exchange])
    {
        this._store.exchanges[exchange] = {};
    }
    if ('pair' === key)
    {
        if (value !== this._store.exchanges[exchange][key])
        {
            standaloneContext.setExchangePair(exchange, value);
        }
    }
    this._store.exchanges[exchange][key] = value;
}

getData(key)
{
    if (undefined === this._store.global[key])
    {
        return null;
    }
    return this._store.global[key];
}

setData(key, value)
{
    this._store.global[key] = value;
}

updateFromStandaloneContext()
{
    if (!standaloneContext.isSupported())
    {
        return;
    }
    const pairs = standaloneContext.getExchangesPairs();
    _.forEach(pairs, (pair, exchange) => {
        if (undefined === this._store.exchanges[exchange])
        {
            this._store.exchanges[exchange] = {};
        }
        this._store.exchanges[exchange]['pair'] = pair;
    });
}

}

export default new DataStore();
