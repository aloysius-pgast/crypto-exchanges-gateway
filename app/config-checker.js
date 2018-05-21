"use strict";
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const AbstractConfigCheckerClass = require('./abstract-config-checker');

class ConfigChecker extends AbstractConfigCheckerClass
{

constructor(defaultConfig)
{
    let cfg;
    cfg = {
        listen:{
            ipaddr:'*',
            port:8000,
            ssl:false
        },
        listenWs:{
            ipaddr:'*',
            port:8001,
            ssl:false
        },
        logLevel:'warn',
        auth:{
            trustProxy:{
                enabled:false
            },
            apiKey:{
                enabled:false,
                key:''
            },
            ipFilter:{
                enabled:false,
                allow:[]
            }
        },
        userAgent:{
            value:"Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1"
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
        tickerMonitor:{
            enabled:false
        },
        exchanges:{}
    }
    if (undefined !== defaultConfig)
    {
        _.defaultsDeep(cfg, defaultConfig)
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
    if (!this._checkUserAgent())
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
    if (!this._checkUi())
    {
        valid = false;
    }
    if (!this._checkCoinMarketCap())
    {
        valid = false;
    }
    if (!this._checkTickerMonitor())
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

_checkTickerMonitor()
{
    let valid = true;
    const checkerClass = require('./tickerMonitor/config-checker');
    let checker = new checkerClass();
    let config = {};
    if (undefined !== this._config.tickerMonitor)
    {
        config = this._config.tickerMonitor;
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
        this._finalConfig.tickerMonitor = checker.getCfg();
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
    // by default no exchange is enabled
    if (undefined === this._config.exchanges)
    {
        this._config.exchanges = this._defaultConfig.exchanges;
    }
    // try to load all config-checker.js file in exchanges directory
    let exchangesDir = path.join(__dirname, 'exchanges');
    let configCheckers = {};
    _.forEach(fs.readdirSync(exchangesDir), (exchangeId) => {
        let file = path.join(exchangesDir, exchangeId, 'config-checker.js');
        if (fs.existsSync(file))
        {
            const checkerClass = require(file);
            configCheckers[exchangeId] = checkerClass;
        }
    });
    let index = 0;
    let exchangeTypes = {};
    _.forEach(this._config.exchanges, (exchangeConfig, exchangeId) => {
        ++index;
        if (undefined === exchangeConfig.type)
        {
            exchangeConfig.type = exchangeId;
        }
        if (undefined === configCheckers[exchangeConfig.type])
        {
            this._err(`Unsupported exchange type '${exchangeConfig.type}' for exchange #${index} '${exchangeId}'`);
            valid = false;
            return;
        }
        const checkerClass = configCheckers[exchangeConfig.type];
        // keep track of all exchange types 'cause some might not allow multiple instances
        if (undefined === exchangeTypes[exchangeConfig.type])
        {
            exchangeTypes[exchangeConfig.type] = 0;
        }
        ++exchangeTypes[exchangeConfig.type];
        // check if multiple instances are allowed
        if (exchangeTypes[exchangeConfig.type] > 1)
        {
            if (!checkerClass.MULTIPLE_INSTANCES)
            {
                this._err(`Exchange type '${exchangeConfig.type}' does not support multiple instances`);
                valid = false;
                return;
            }
        }
        let checker = new checkerClass();
        if (!checker.check(exchangeConfig))
        {
            // mark config as invalid
            valid = false;
            // copy errors
            _.forEach(checker.getErrors(), function(err){
                this._err(err);
            });
        }
        else
        {
            this._finalConfig.exchanges[exchangeId] = checker.getCfg();
        }
    });
    return valid;
}

_checkUserAgent()
{
    if (undefined === this._config.userAgent)
    {
        return true;
    }
    if (undefined === this._config.userAgent.value)
    {
        return true;
    }
    let value = this._config.userAgent.value.trim();
    if ('' == value)
    {
        return true;
    }
    this._finalConfig.userAgent.value = value;
    return true;
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
            this._invalid({name:'auth.trustProxy.enabled', value:this._config.auth.trustProxy.enabled});
            valid = false;
        }
        else
        {
            if (true === this._config.auth.trustProxy.enabled)
            {
                if (undefined === this._config.auth.trustProxy.proxies)
                {
                    this._missing('auth.trustProxy.proxies');
                    valid = false;
                }
                else
                {
                    if (0 == this._config.auth.trustProxy.proxies.length)
                    {
                        this._err("Invalid config parameter 'auth.trustProxy.proxies' (cannot be empty)");
                        valid = false;
                    }
                    else
                    {
                        this._finalConfig.auth.trustProxy = this._config.auth.trustProxy;
                    }
                }
            }
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
    // check if ssl can be enabled
    if (true === this._config.listen.ssl)
    {
        this._finalConfig.listen.ssl = true;
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
    // check if ssl can be enabled
    if (true === this._config.listenWs.ssl)
    {
        this._finalConfig.listenWs.ssl = true;
    }
    return valid;
}

}

module.exports = ConfigChecker;
