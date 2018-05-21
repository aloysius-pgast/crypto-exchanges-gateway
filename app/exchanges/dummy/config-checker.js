"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('../../abstract-config-checker');

/*
 Dummy exchange is a paper exchange I use for development & troubleshooting purpose
 */

class ConfigChecker extends AbstractConfigCheckerClass
{

// whether or not multiple instances can be supported for this exchange
static get MULTIPLE_INSTANCES() { return  true };

constructor(id)
{
    // default config
    let cfg = {
        type:"dummy",
        name:"Paper Exchange",
        feesPercent:0
    }
    super(cfg, `exchanges[${id}]`);
}

_check()
{
    let valid = true;
    //-- check name
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
    _.forEach(this._config, (value, key) => {
        this._finalConfig[key] = value;
    });
    return valid;
}

}

module.exports = ConfigChecker;
