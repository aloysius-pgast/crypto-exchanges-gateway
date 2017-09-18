"use strict";
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('./abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

constructor()
{
    let cfg = {
        listen:{
            ipaddr:'*',
            port:8000
        },
        logLevel:'warn',
        auth:{
            trustProxy:false,
            apiKey:{
                enabled:false,
                key:''
            },
            ipFilter:{
                enabled:false,
                allow:[]
            }
        },
        coinmarketcap:{
            enabled:false
        },
        pushover:{
            enabled:false
        },
        exchanges:{
            binance:{
                enabled:true
            },
            bittrex:{
                enabled:true
            },
            poloniex:{
                enabled:true
            }
        }
    }
    super(cfg);
}

_check()
{
    let valid = true;
    if (!this._checkListen())
    {
        valid = false;
    }
    if (!this._checkLogLevel())
    {
        valid = false;
    }
    if (!this._checkAuth())
    {
        valid = false;
    }
    if (!this._checkCoinMarketCap())
    {
        valid = false;
    }
    if (!this._checkPushOver())
    {
        valid = false;
    }
    if (!this._checkExchanges())
    {
        valid = false;
    }
    return valid;
}

_checkCoinMarketCap()
{
    let valid = true;
    const checkerClass = require('./coinmarketcap/config-checker');
    let checker = new checkerClass();
    let config = {};
    if (undefined !== this._config.coinmarketcap)
    {
        config = this._config.coinmarketcap;
    }
    if (!checker.check(config))
    {
        // mark config as invalid
        valid = false;
        let self = this;
        // copy errors
        _.forEach(checker.getErrors(), function(err){
            self._err(err);
        });
    }
    else
    {
        this._finalConfig.coinmarketcap = checker.getCfg();
    }
    return valid;
}

_checkPushOver()
{
    let valid = true;
    const checkerClass = require('./pushover/config-checker');
    let checker = new checkerClass();
    let config = {};
    if (undefined !== this._config.pushover)
    {
        config = this._config.pushover;
    }
    if (!checker.check(config))
    {
        // mark config as invalid
        valid = false;
        let self = this;
        // copy errors
        _.forEach(checker.getErrors(), function(err){
            self._err(err);
        });
    }
    else
    {
        this._finalConfig.pushover = checker.getCfg();
    }
    return valid;
}

_checkExchanges()
{
    let valid = true;
    if (undefined === this._config.exchanges)
    {
        this._config.exchanges = this._defaultConfig.exchanges;
    }
    // try to load all config-checker.js file in exchanges directory
    let exchangesDir = path.join(__dirname, 'exchanges');
    _.forEach(fs.readdirSync(exchangesDir), (e) => {
        let file = path.join(exchangesDir, e, 'config-checker.js');
        if (fs.existsSync(file))
        {
            let name = path.basename(e);
            const checkerClass = require(file);
            let checker = new checkerClass();
            let config = {};
            if (undefined !== this._config.exchanges[name])
            {
                config = this._config.exchanges[name];
            }
            if (!checker.check(config))
            {
                // mark config as invalid
                valid = false;
                let self = this;
                // copy errors
                _.forEach(checker.getErrors(), function(err){
                    self._err(err);
                });
            }
            else
            {
                this._finalConfig.exchanges[name] = checker.getCfg();
            }
        }
    });
    return valid;
}

_checkLogLevel()
{
    if (undefined === this._config.logLevel)
    {
        return true;
    }
    switch (this._config.logLevel)
    {
        case 'error':
        case 'warn':
        case 'info':
        case 'verbose':
        case 'debug':
        case 'silly':
            this._finalConfig.logLevel = this._config.logLevel;
            return true;
        default:
            this._invalid('logLevel');
            return false;
    }
}

_checkAuth()
{
    let valid = true;
    if (undefined === this._config.auth)
    {
        return true;
    }
    if (undefined !== this._config.auth.trustProxy && undefined !== this._config.auth.trustProxy.enabled)
    {
        if (!this._isValidBoolean(this._config.auth.trustProxy.enabled))
        {
            this._invalid({name:'auth.trustProxy', value:this._config.auth.trustProxy});
            valid = false;
        }
        else
        {
            this._finalConfig.auth.trustProxy = this._config.auth.trustProxy;
        }
    }
    if (!this._checkApiKey())
    {
        valid = false;
    }
    if (!this._checkIpFilter())
    {
        valid = false;
    }
    return valid;
}

_checkApiKey()
{
    let valid = true;
    if (undefined === this._config.auth.apiKey || undefined === this._config.auth.apiKey.enabled)
    {
        return true;
    }
    if (!this._isValidBoolean(this._config.auth.apiKey.enabled))
    {
        this._invalid({name:'auth.apiKey.enabled', value:this._config.auth.apiKey.enabled});
        return false;
    }
    this._finalConfig.auth.apiKey.enabled = this._config.auth.apiKey.enabled;
    if (!this._finalConfig.auth.apiKey.enabled)
    {
        return true;
    }
    // apiKey is enabled
    if (undefined === this._config.auth.apiKey.key || '' == this._config.auth.apiKey.key)
    {
        this._invalid({name:'auth.apiKey.key', value:this._config.auth.apiKey.enabled}, 'key cannot be empty');
        valid = false;
    }
    else
    {
        this._finalConfig.auth.apiKey.key = this._config.auth.apiKey.key;
    }
    return valid;
}

_checkIpFilter()
{
    let valid = true;
    if (undefined === this._config.auth.ipFilter || undefined === this._config.auth.ipFilter.enabled)
    {
        return true;
    }
    if (!this._isValidBoolean(this._config.auth.ipFilter.enabled))
    {
        this._invalid({name:'auth.ipFilter.enabled', value:this._config.auth.ipFilter.enabled});
        return false;
    }
    this._finalConfig.auth.ipFilter.enabled = this._config.auth.ipFilter.enabled;
    if (!this._finalConfig.auth.ipFilter.enabled)
    {
        return true;
    }
    if (undefined === this._config.auth.ipFilter.allow ||  0 == this._config.auth.ipFilter.allow)
    {
        this._invalid({name:'auth.ipFilter.allow', value:this._config.auth.ipFilter.allow}, 'list cannot be empty');
        valid = false;
    }
    else
    {
        this._finalConfig.auth.ipFilter.allow = this._config.auth.ipFilter.allow;
    }
    return valid;
}

_checkListen()
{
    if (undefined === this._config.listen)
    {
        return true;
    }
    let valid = true;
    // check port
    if (undefined !== this._config.listen.port)
    {
        if (!this._isValidPort(this._config.listen.port))
        {
            this._invalid({name:'listen[port]',value:this._config.listen.port});
            valid = false;
        }
        else
        {
            this._finalConfig.listen.port = parseInt(this._config.listen.port);
        }
    }
    // check ip address
    if (undefined !== this._config.listen.ipaddr)
    {
        if ('*' != this._config.listen.ipaddr)
        {
            if (!this._isValidIpaddr(this._config.listen.ipaddr))
            {
                this._invalid({name:'listen[ipaddr]',value:this._config.listen.ipaddr});
                valid = false;
            }
        }
        if (valid)
        {
            this._finalConfig.listen.ipaddr = this._config.listen.ipaddr;
        }
    }
    return valid;
}

}

module.exports = ConfigChecker;
