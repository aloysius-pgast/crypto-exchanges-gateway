"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../../abstract-config-checker');

// maximum number of requests per seconds for public api
const PUBLIC_API_MAX_REQUESTS_PER_SECOND = 6;

// maximum number of requests per seconds for trading api
const TRADING_API_MAX_REQUESTS_PER_SECOND = 6;

class ConfigChecker extends AbstractConfigCheckerClass
{

// whether or not multiple instances can be supported for this exchange
static get MULTIPLE_INSTANCES() { return  true };

constructor(exchangeId)
{
    // default config
    let cfg = {
        enabled:true,
        type:"poloniex",
        name:"Poloniex",
        key:"",
        secret:"",
        // starting from 2018-05-15, takers fees will be 0.20% (see https://poloniex.com/press-releases/2018.05.01-Coming-May-15-consistent-competitive-trading-fees/)
        feesPercent:0.20,
        emulatedWs:{
            wsKlines:{
                enabled:true
            }
        },
        throttle:{
            publicApi:{
                maxRequestsPerSecond:PUBLIC_API_MAX_REQUESTS_PER_SECOND
            },
            tradingApi:{
                maxRequestsPerSecond:TRADING_API_MAX_REQUESTS_PER_SECOND
            }
        }
    }
    super(cfg, `exchanges[${exchangeId}]`);
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
                    if ('klines' !== type && undefined !== this._config.emulatedWs[type].period)
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
    if (undefined !== this._config.throttle)
    {
        // update throttle config for public API
        if (undefined !== this._config.throttle.publicApi && undefined !== this._config.throttle.publicApi.maxRequestsPerSecond)
        {
            let value = parseInt(this._config.throttle.publicApi.maxRequestsPerSecond);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[publicApi][maxRequestsPerSecond]',value:this._config.throttle.publicApi.maxRequestsPerSecond});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.publicApi.maxRequestsPerSecond = value;
            }
        }
        // update throttle config for trading API
        if (undefined !== this._config.throttle.tradingApi && undefined !== this._config.throttle.tradingApi.maxRequestsPerSecond)
        {
            let value = parseInt(this._config.throttle.tradingApi.maxRequestsPerSecond);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[tradingApi][maxRequestsPerSecond]',value:this._config.throttle.tradingApi.maxRequestsPerSecond});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.tradingApi.maxRequestsPerSecond = value;
            }
        }
    }

    return valid;
}

}

module.exports = ConfigChecker;
