"use strict";

class InternalConfig
{

constructor()
{
    this._config = {
        'userAgent':'CEG 1.0',
        'keepalive':{
            'exchanges':30000,
            'clients':60000
        }
    };
}

set(key, value)
{
    if (undefined == key)
    {
        return false;
    }
    this._config[key] = value;
    return true;
}

get(key)
{
    if (undefined === this._config[key])
    {
        return null;
    }
    return this._config[key];
}

}

let internalConfig = new InternalConfig();

module.exports = internalConfig;
