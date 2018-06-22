"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('./abstract-config-checker');

// maximum number of requests per seconds for api
const GLOBAL_API_MAX_REQUESTS_PER_SECOND = 1;

class AbstractCcxtConfigChecker extends AbstractConfigCheckerClass
{

// whether or not multiple instances can be supported for this exchange
static get MULTIPLE_INSTANCES() { return true };

constructor(exchangeId, cfg)
{
    // default config
    let defaultCfg = {
        enabled:false,
        type:exchangeId,
        name:exchangeId.toUpperCase(),
        key:"",
        secret:"",
        feesPercent:0,
        verbose:false,
        // timeout in ms
        timeout:10000,
        emulatedWs:{},
        throttle:{
            global:{maxRequestsPerSecond:GLOBAL_API_MAX_REQUESTS_PER_SECOND}
        }
    }
    let _cfg = _.merge(defaultCfg, cfg);
    super(_cfg, `exchanges[${exchangeId}]`);
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
    if (this._finalConfig.hasOwnProperty('requirePair'))
    {
        if (undefined !== this._config.requirePair)
        {
            if (true === this._config.requirePair)
            {
                this._finalConfig.requirePair = true;
            }
        }
    }

    //-- check whether or not verbose should be enabled
    if (true === this._config.verbose)
    {
        this._finalConfig.verbose = true;
    }

    //-- check whether or not we have a custom timeout
    if (undefined !== this._config.timeout)
    {
        let value = parseInt(this._config.timeout);
        if (isNaN(value) || value <= 0)
        {
            this._invalid({name:`timeout`,value:this._config.timeout});
            valid = false;
        }
        else
        {
            this._finalConfig.timeout = value;
        }
    }

    //-- check emulated websocket
    if (undefined !== this._config.emulatedWs)
    {
        _.forEach(this._finalConfig.emulatedWs, (obj, type) => {
            if (undefined !== this._config.emulatedWs[type])
            {
                if (undefined !== this._config.emulatedWs[type].enabled)
                {
                    if (true === this._config.emulatedWs[type].enabled)
                    {
                        obj.enabled = true;
                    }
                    else if (false === this._config.emulatedWs[type].enabled)
                    {
                        obj.enabled = false;
                    }
                }
                if (obj.enabled)
                {
                    if (undefined !== this._config.emulatedWs[type].period)
                    {
                        let value = parseFloat(this._config.emulatedWs[type].period);
                        if (isNaN(value) || value <= 0)
                        {
                            this._invalid({name:`emulatedWs[${type}][period]`,value:this._config.emulatedWs[type].period});
                            valid = false;
                        }
                        else
                        {
                            obj.period = value;
                        }
                    }
                }
            }
        });
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

module.exports = AbstractCcxtConfigChecker;
