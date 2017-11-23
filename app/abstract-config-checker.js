"use strict";
const _ = require('lodash');
const util = require('util');

class AbstractConfigChecker
{

constructor(defaultConfig, parentNode)
{
    this._parentNode = parentNode;
    if (undefined === this._parentNode)
    {
        this._parentNode = '';
    }
    this._defaultConfig = _.cloneDeep(defaultConfig);
    this._finalConfig = {};
    this._config = {};
    this._errors = [];
}

check(config)
{
    this._finalConfig = _.cloneDeep(this._defaultConfig);
    this._config = config;
    this._errors = [];
    let valid = true;
    if (!this._check())
    {
        valid = false;
    }
    return valid;
}

getCfg()
{
    if (0 != this._errors.length)
    {
        return null;
    }
    return this._finalConfig;
}

getErrors(flatten)
{
    if (undefined === flatten || !flatten)
    {
        return this._errors;
    }
    return this._errors.join("\n");
}

_isValidBoolean(value)
{
    return true === value || false === value;
}

_isValidIpaddr(value)
{
    return /^\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b$/.test(value);
}

_isValidPort(value)
{
    if (!/^[1-9][0-9]*$/.test(value))
    {
        return false;
    }
    let port = parseInt(value);
    return port < 65535;
}

_missing(param)
{
    let name = this._resolveParamName(param);
    let msg = util.format("Missing config parameter '%s'", name);
    this._err(msg);
}

_invalid(param, msg)
{
    let err;
    if ('object' == typeof param)
    {
        let name = this._resolveParamName(param.name);
        err = util.format("Invalid config parameter '%s' = '%s'", name, param.value);
    }
    else
    {
        let name = this._resolveParamName(param);
        err = util.format("Invalid config parameter '%s' = '%s'", name, this._config[param]);
    }
    if (undefined !== msg && '' != msg)
    {
        err = util.format('%s (%s)', err, msg);
    }
    this._err(err);
}

_resolveParamName(_name)
{
    if ('' == this._parentNode)
    {
        return _name;
    }
    let index = _name.indexOf('[');
    // no bracker => add [] around
    if (-1 == index)
    {
        return util.format('%s[%s]', this._parentNode, _name);
    }
    return util.format('%s[%s]%s', this._parentNode, _name.substring(0, index), _name.substr(index));
}

_err(msg)
{
    this._errors.push(msg);
}

}
module.exports = AbstractConfigChecker;
