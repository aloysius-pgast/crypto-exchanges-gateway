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
        enabled:false,
        user:"",
        token:"",
    }
    super(cfg, 'pushover');
}

_check()
{
    // pushover is disabled by default
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

    // pushover is disabled
    if (!this._finalConfig.enabled)
    {
        return true;
    }
    let valid = true;

    if (undefined === this._config.user || '' == this._config.user)
    {
        this._invalid({name:'user',value:this._config.user}, 'cannot be empty');
        valid = false;
    }
    else
    {
        this._finalConfig.user = this._config.user;
    }
    if (undefined === this._config.token || '' == this._config.token)
    {
        this._invalid({name:'token',value:this._config.token}, 'cannot be empty');
        valid = false;
    }
    else
    {
        this._finalConfig.token = this._config.token;
    }
    return valid;
}

}

module.exports = ConfigChecker;
