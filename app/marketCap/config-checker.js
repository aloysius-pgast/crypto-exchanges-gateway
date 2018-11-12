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
    }
    super(cfg, 'marketCap');
}

_check()
{
    // marketCap is enabled by default
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
    return true;
}

}

module.exports = ConfigChecker;
