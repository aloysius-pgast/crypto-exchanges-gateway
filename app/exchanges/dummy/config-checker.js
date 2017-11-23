"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../../abstract-config-checker');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

class ConfigChecker extends AbstractConfigCheckerClass
{

constructor(id)
{
    // default config
    let cfg = {}
    super(cfg, `exchanges[${id}]`);
}

_check()
{
    let valid = true;
    if (undefined === this._config.name)
    {
        this._missing('name');
        return false;
    }
    if (undefined === this._config.baseHttpUri)
    {
        this._missing('baseHttpUri');
        return false;
    }
    if (undefined === this._config.baseWsUri)
    {
        this._missing('baseWsUri');
        return false;
    }
    this._finalConfig = this._config;
    return valid;
}

}

module.exports = ConfigChecker;
