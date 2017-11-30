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
        listenWs:{
            ipaddr:'*',
            port:8001
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
        ui:{
           enabled:false
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
    if (!this._checkListenWs())
    {
        valid = false;
    }
    // ensure we don't try to run http & ws on same endpoint
    if (this._finalConfig.listen.port == this._finalConfig.listenWs.port)
    {
        if ('*' == this._finalConfig.listen.ipaddr || '*' == this.finalConfig.listenWs.ipaddr || this._finalConfig.listen.ipaddr == this.finalConfig.listenWs.ipaddr)
        {
            this._err("Cannot run both http and websocket on same ip/port combination");
            valid = false;
        }
    }
    if (!this._checkLogLevel())
    {
        valid = false;
    }
    if (!this._checkAuth())
    {
        valid = false;
    }
    if (!this._checkUi())
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

_checkUi()
{
    let valid = true;
    if (undefined === this._config.ui)
    {
        return true;
    }
    if (undefined !== this._config.ui.enabled)
    {
        if (!this._isValidBoolean(this._config.ui.enabled))
        {
            this._invalid({name:'ui.enabled', value:this._config.ui.enabled});
            valid = false;
        }
        else
        {
            this._finalConfig.ui.enabled = this._config.ui.enabled;
        }
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
    // try to load all config-checker.js file in exchanges directory (except for dummy exchange which will be handled separately)
    let exchangesDir = path.join(__dirname, 'exchanges');
    _.forEach(fs.readdirSync(exchangesDir), (exchangeId) => {
        if ('dummy' == exchangeId)
        {
            return;
        }
        let file = path.join(exchangesDir, exchangeId, 'config-checker.js');
        if (fs.existsSync(file))
        {
            const checkerClass = require(file);
            let checker = new checkerClass();
            let config = {};
            if (undefined !== this._config.exchanges[exchangeId])
            {
                config = this._config.exchanges[exchangeId];
            }
            if (!checker.check(config))
            {
                // mark config as invalid
                valid = false;
                // copy errors
                let self = this;
                _.forEach(checker.getErrors(), function(err){
                    self._err(err);
                });
            }
            else
            {
                this._finalConfig.exchanges[exchangeId] = checker.getCfg();
            }
        }
    });
    // check if we have dummy exchanges enabled
    let dummyExchanges = [];
    _.forEach(this._config.exchanges, (entry, id) => {
        if (undefined === entry.dummy || false === entry.dummy)
        {
            return;
        }
        if (true === entry.enabled)
        {
            entry.id = id;
            dummyExchanges.push(entry);
        }
    });
    if (0 != dummyExchanges.length)
    {
        let file = path.join(exchangesDir, 'dummy', 'config-checker.js');
        const checkerClass = require(file);
        _.forEach(dummyExchanges, (entry) => {
            let config = entry;
            let checker = new checkerClass(entry.id);
            if (!checker.check(config))
            {
                // mark config as invalid
                valid = false;
                // copy errors
                let self = this;
                _.forEach(checker.getErrors(), function(err){
                    self._err(err);
                });
            }
            else
            {
                this._finalConfig.exchanges[entry.id] = checker.getCfg();
            }
        });
    }
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
    //-- check if we have an external endpoint set (in case app is running behing proxy)
    if (undefined !== this._config.listen.externalEndpoint && '' !== this._config.listen.externalEndpoint)
    {
        if (!this._config.listen.externalEndpoint.startsWith('http://') && !this._config.listen.externalEndpoint.startsWith('https://'))
        {
            this._invalid({name:'listen[externalEndpoint]',value:this._config.listen.externalEndpoint});
            valid = false;
        }
        else
        {
            this._finalConfig.listen.externalEndpoint = this._config.listen.externalEndpoint;
        }
    }
    return valid;
}

_checkListenWs()
{
    if (undefined === this._config.listenWs)
    {
        return true;
    }
    let valid = true;
    // check port
    if (undefined !== this._config.listenWs.port)
    {
        if (!this._isValidPort(this._config.listenWs.port))
        {
            this._invalid({name:'listenWs[port]',value:this._config.listenWs.port});
            valid = false;
        }
        else
        {
            this._finalConfig.listenWs.port = parseInt(this._config.listenWs.port);
        }
    }
    // check ip address
    if (undefined !== this._config.listenWs.ipaddr)
    {
        if ('*' != this._config.listenWs.ipaddr)
        {
            if (!this._isValidIpaddr(this._config.listenWs.ipaddr))
            {
                this._invalid({name:'listenWs[ipaddr]',value:this._config.listenWs.ipaddr});
                valid = false;
            }
        }
        if (valid)
        {
            this._finalConfig.listenWs.ipaddr = this._config.listenWs.ipaddr;
        }
    }
    //-- check if we have an external endpoint set (in case app is running behing proxy)
    if (undefined !== this._config.listenWs.externalEndpoint && '' !== this._config.listenWs.externalEndpoint)
    {
        if (!this._config.listenWs.externalEndpoint.startsWith('ws://') && !this._config.listenWs.externalEndpoint.startsWith('wss://'))
        {
            this._invalid({name:'listenWs[externalEndpoint]',value:this._config.listenWs.externalEndpoint});
            valid = false;
        }
        else
        {
            this._finalConfig.listenWs.externalEndpoint = this._config.listenWs.externalEndpoint;
        }
    }
    return valid;
}

}

module.exports = ConfigChecker;
