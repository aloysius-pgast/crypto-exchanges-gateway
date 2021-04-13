"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

constructor()
{
    // default config
    let cfg = {
        enabled:true,
        delay:30,
        maxConditions:0,
        maxDuration:0
    }
    super(cfg, 'tickerMonitor');
}

_check()
{
    // TickerMonitor is enabled by default
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

    // TickerMonitor is disabled
    if (!this._finalConfig.enabled)
    {
        return true;
    }
    let valid = true;

    //-- check delay
    if (undefined !== this._config.delay)
    {
        let value = parseInt(this._config.delay);
        if (isNaN(value) || value <= 0)
        {
            this._invalid({name:'delay',value:this._config.delay});
            valid = false;
        }
        else
        {
            this._finalConfig.delay = value;
        }
    }

    //-- check max conditions & maxDuration
    if (undefined !== this._config.maxConditions)
    {
        let value = parseInt(this._config.maxConditions);
        if (isNaN(value) || value < 0)
        {
            this._invalid({name:'tickerMonitor.maxConditions',value:this._config.maxConditions});
            valid = false;
        }
        else
        {
            this._finalConfig.maxConditions = value;
        }
    }
    if (undefined !== this._config.maxDuration)
    {
        let value = parseInt(this._config.maxDuration);
        if (isNaN(value) || value < 0)
        {
            this._invalid({name:'tickerMonitor.maxDuration',value:this._config.maxDuration});
            valid = false;
        }
        else
        {
            this._finalConfig.maxDuration = value;
        }
    }

    return valid;
}

}

module.exports = ConfigChecker;
