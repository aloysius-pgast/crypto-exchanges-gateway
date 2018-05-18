"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

// how many seconds should we wait between 2 public methods
static get PUBLIC_API_MIN_REQUEST_PERIOD() { return  2 };

constructor()
{
    // default config
    let cfg = {
        enabled:true,
        history:true,
        throttle:{
            publicApi:{
                minPeriod:ConfigChecker.PUBLIC_API_MIN_REQUEST_PERIOD
            },
        }
    }
    super(cfg, 'coinmarketcap');
}

_check()
{
    // coinmarketcap is enabled by default
    if (undefined === this._config.enabled)
    {
        return true;
    }
    if (!this._isValidBoolean(this._config.enabled))
    {
        this._invalid('enabled');
        return false;
    }

    this._finalConfig.enabled = this._config.enabled;

    // coinmarketcap is disabled
    if (!this._finalConfig.enabled)
    {
        return true;
    }
    let valid = true;

    //-- is history support enabled ?
    if (undefined !== this._config.history)
    {
        if (!this._isValidBoolean(this._config.history))
        {
            this._invalid('history');
            return false;
        }
        else
        {
            this._finalConfig.history = this._config.history;
        }
    }

    //-- update throttle config
    if (undefined !== this._config.throttle)
    {
        // update throttle config for public API
        if (undefined !== this._config.throttle.publicApi && undefined !== this._config.throttle.publicApi.minPeriod)
        {
            let value = parseInt(this._config.throttle.publicApi.minPeriod);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[publicApi][minPeriod]',value:this._config.throttle.publicApi.minPeriod});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.publicApi.minPeriod = value;
            }
        }
    }

    return valid;
}

}

module.exports = ConfigChecker;
