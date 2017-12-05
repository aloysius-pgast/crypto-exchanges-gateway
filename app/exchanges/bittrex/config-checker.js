"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../../abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

// how many seconds should we wait between 2 low intensity methods
static get LOW_INTENSITY_API_MIN_REQUEST_PERIOD() { return  1 };

// how many seconds should we wait between 2 medium intensity methods
// seems to concern account/* methods
static get MEDIUM_INTENSITY_API_MIN_REQUEST_PERIOD() { return 10 };

// how many seconds should we wait between 2 high intensity methods
static get HIGH_INTENSITY_API_MIN_REQUEST_PERIOD() { return 30 };

constructor()
{
    // default config
    let cfg = {
        enabled:true,
        key:"",
        secret:"",
        feesPercent:0.25,
        throttle:{
            lowIntensity:{
                minPeriod:ConfigChecker.LOW_INTENSITY_API_MIN_REQUEST_PERIOD
            },
            mediumIntensity:{
                minPeriod:ConfigChecker.MEDIUM_INTENSITY_API_MIN_REQUEST_PERIOD
            },
            highIntensity:{
                minPeriod:ConfigChecker.HIGH_INTENSITY_API_MIN_REQUEST_PERIOD
            }
        }
    }
    super(cfg, 'exchanges[bittrex]');
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
    // update throttle config (see https://support.bittrex.com/hc/en-us/articles/202673194-The-taming-of-the-Bots-Part-II)
    if (undefined !== this._config.throttle)
    {
        // update throttle config for low intensity API calls
        if (undefined !== this._config.throttle.lowIntensity && undefined !== this._config.throttle.lowIntensity.minPeriod)
        {
            let value = parseInt(this._config.throttle.lowIntensity.minPeriod);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[lowIntensity][minPeriod]',value:this._config.throttle.lowIntensity.minPeriod});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.lowIntensity.minPeriod = value;
            }
        }
        // update throttle config for medium intensity API calls
        if (undefined !== this._config.throttle.mediumIntensity && undefined !== this._config.throttle.mediumIntensity.minPeriod)
        {
            let value = parseInt(this._config.throttle.mediumIntensity.minPeriod);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[mediumIntensity][minPeriod]',value:this._config.throttle.mediumIntensity.minPeriod});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.mediumIntensity.minPeriod = value;
            }
        }
        // update throttle config for high intensity API calls
        if (undefined !== this._config.throttle.highIntensity && undefined !== this._config.throttle.highIntensity.minPeriod)
        {
            let value = parseInt(this._config.throttle.highIntensity.minPeriod);
            if (isNaN(value) || value <= 0)
            {
                this._invalid({name:'throttle[highIntensity][minPeriod]',value:this._config.throttle.highIntensity.minPeriod});
                valid = false;
            }
            else
            {
                this._finalConfig.throttle.highIntensity.minPeriod = value;
            }
        }
    }

    return valid;
}

}

module.exports = ConfigChecker;
