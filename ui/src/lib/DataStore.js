import _ from 'lodash';

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

setExchangeData(exchange, key, value)
{
    if (undefined === this._store.exchanges[exchange])
    {
        this._store.exchanges[exchange] = {};
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

}

export default new DataStore();
