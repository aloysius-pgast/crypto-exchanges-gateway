"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../../abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

// maximum number of requests per seconds for api
static get GLOBAL_API_MAX_REQUESTS_PER_SECOND() { return 1 };

// whether or not multiple instances can be supported for this exchange
static get MULTIPLE_INSTANCES() { return true };

constructor()
{
    // default config
    let cfg = {
        enabled:true,
        type:"kucoin",
        name:"Kucoin",
        requirePair:false,
        key:"",
        secret:"",
        feesPercent:0.1,
        throttle:{
            global:{
                maxRequestsPerSecond:ConfigChecker.GLOBAL_API_MAX_REQUESTS_PER_SECOND
            }
        }
    }
    super(cfg, 'exchanges[kucoin]');
}

_check()
{
    // exchange is enabled by default
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

    // exchange is disabled
    if (!this._finalConfig.enabled)
    {
        return true;
    }

    //-- check name
    if (undefined !== this._config.name && '' != this._config.name)
    {
        this._finalConfig.name = this._config.name;
    }

    //-- check key & secret
    let valid = true;
    if (undefined !== this._config.key)
    {
        this._finalConfig.key = this._config.key;
    }
    if (undefined !== this._config.secret)
    {
        this._finalConfig.secret = this._config.secret;
    }

    //-- check wether or not pair should be required
    if (undefined !== this._config.requirePair)
    {
        if (true === this._config.requirePair)
        {
            this._finalConfig.requirePair = true;
        }
    }

    //-- check feesPercent
    if (undefined !== this._config.feesPercent)
    {
        let value = parseFloat(this._config.feesPercent);
        if (isNaN(value) || value <= 0)
        {
            this._invalid({name:'feesPercent',value:this._config.feesPercent});
            valid = false;
        }
        else
        {
            this._finalConfig.feesPercent = value;
        }
    }

    //-- update throttle config
    // Use 1 req/s as safe default
    if (undefined !== this._config.throttle)
    {
        // rate limiting is global
        if (undefined !== this._config.throttle.global && undefined !== this._config.throttle.global.maxRequestsPerSecond)
        {
            let value = parseInt(this._config.throttle.global.maxRequestsPerSecond);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[global][maxRequestsPerSecond]',value:this._config.throttle.global.maxRequestsPerSecond});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.global.maxRequestsPerSecond = value;
            }
        }
    }

    return valid;
}

}

module.exports = ConfigChecker;
