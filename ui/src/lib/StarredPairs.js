import _ from 'lodash';

class StarredPairs
{

constructor()
{
    this._list = {};
    this._isSupported = false;
    this._version = 1;
}

isSupported()
{
    return this._isSupported;
}

load()
{
    if (!window.ctx.hasLocalStorage)
    {
        return false;
    }
    this._isSupported = true;
    // migrate previous starred pairs
    let legacyStarredPairs = [];
    let migratedStarredPairs = {};
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('starredPair:'))
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
        let version = 0;
        if (undefined !== obj.version)
        {
            obj.version = parseInt(obj.version);
        }
        if (obj.version < this._version)
        {
            legacyStarredPairs.push(key);
            let newKey = `starredPair:${obj.exchange}:${obj.pair}`;
            obj.version = this._version;
            migratedStarredPairs[newKey] = obj;
        }
        if (undefined === this._list[obj.exchange])
        {
            this._list[obj.exchange] = {};
        }
        this._list[obj.exchange][obj.pair] = {timestamp:obj.timestamp,version:obj.version};
    }
    // declare new keys
    _.forEach(migratedStarredPairs, (obj, key) => {
        let data = JSON.stringify(obj);
        window.localStorage.setItem(key, data);
    });
    // remove legacy keys
    _.forEach(legacyStarredPairs, (key) => {
        window.localStorage.removeItem(key);
    });
    return true;
}

// remove all existing starred pairs
reset()
{
    if (!this._isSupported)
    {
        return false;
    }
    let keys = [];
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('starredPair:'))
        {
            continue;
        }
        keys.push(key);
    }
    this._list = {};
    _.forEach(keys, (key) => {
        window.localStorage.removeItem(key);
    });
}

isStarred(exchangeId, pair)
{
    if (!this._isSupported)
    {
        return false;
    }
    if (undefined === this._list[exchangeId] || undefined == this._list[exchangeId][pair])
    {
        return false;
    }
    return true;
}

star(exchangeId, pair, timestamp)
{
    if (!this._isSupported)
    {
        return false;
    }
    if (undefined === this._list[exchangeId])
    {
        this._list[exchangeId] = {};
    }
    if (undefined === this._list[exchangeId][pair])
    {
        if (undefined === timestamp)
        {
            timestamp = parseInt(Date.now() / 1000.0);
        }
        this._list[exchangeId][pair] = {timestamp:timestamp};
        let key = `starredPair:${exchangeId}:${pair}`;
        let data = JSON.stringify({exchange:exchangeId,pair:pair,timestamp:timestamp,version:this._version});
        window.localStorage.setItem(key, data);
    }
    return true;
}

unstar(exchangeId, pair)
{
    if (!this._isSupported)
    {
        return false;
    }
    if (undefined !== this._list[exchangeId])
    {
        if (undefined !== this._list[exchangeId][pair])
        {
            delete this._list[exchangeId][pair];
            let key = `starredPair:${exchangeId}:${pair}`;
            window.localStorage.removeItem(key);
        }
    }
    return true;
}

toggle(exchangeId, pair)
{
    if (!this._isSupported)
    {
        return false;
    }
    if (this.isStarred(exchangeId, pair))
    {
        return this.unstar(exchangeId, pair);
    }
    return this.star(exchangeId, pair);
}

/**
 * Return how many pairs are starred
 * @return {boolean}
 */
size()
{
    return Object.keys(this._list).length;
}

/**
 * @param {string} opt.exchange exchange to retrieve starred pairs for (optional, if not set starred pairs will be returned for all exchanges)
 * @param {boolean} opt.sorted whether or not pairs should be sorted (newer first) (optional, default = true)
 * @return {array} {exchangeId:string,pair:string,timestamp:float,version:integer}
 */
getStarredPairs(opt)
{
    if (!this._isSupported)
    {
        return [];
    }
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined === opt.sorted)
    {
        opt.sorted = true;
    }
    let list = [];
    if (this._isSupported)
    {
        _.forEach(this._list, (entry, exchangeId) => {
            if (undefined !== opt.exchange && exchangeId !== opt.exchange)
            {
                return;
            }
            _.forEach(entry, (obj, pair) => {
                list.push({exchange:exchangeId, pair:pair, timestamp:obj.timestamp, version:obj.version});
            });
        });
    }
    if (opt.sorted)
    {
        list.sort(function(a,b) {
            if (a.timestamp > b.timestamp)
            {
                return -1;
            }
            if (a.timestamp == b.timestamp)
            {
                return 0;
            }
            return 1;
        });
    }
    return list;
}

}

export default new StarredPairs();
