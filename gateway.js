const fs = require('fs');
const path = require('path');
const util = require('util');
const express = require('express');
const compression = require('compression');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const ConfigChecker = require('./app/config-checker');
const storage = require('./app/storage');
const sessionRegistry = require('./app/session-registry');
const internalConfig = require('./app/internal-config');
const _ = require('lodash');
const logger = require('winston');

logger.configure({
    transports: [
        new (logger.transports.Console)({
              timestamp: function() {
                return Date.now();
              },
              formatter: function(options) {
                // Return string will be passed to logger.
                return options.timestamp() +'|'+ options.level.toUpperCase() +'|'+ (options.message ? options.message : '') +
                  (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
              }
        })
    ]
});
// default log level is warn
logger.level = 'warn';
logger.warn("Starting...");
// function to check if level is enabled
logger.isLevel = function(level)
{
    return this.levels[this.level] >= this.levels[level];
}

//-- load config
let config = {};
let configPath = 'config/config.json';
let configFile = path.join(__dirname, configPath);
if (fs.existsSync(configFile))
{
    try
    {
        config = require(configFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", configPath);
        process.exit(1);
    }
}

// retrieve config from checker
let checker = new ConfigChecker();
if (!checker.check(config))
{
    logger.error("Config file '%s' is invalid", configPath);
    _.forEach(checker.getErrors(), function (err) {
        logger.error(err);
    });
    process.exit(1);
}
config = checker.getCfg();

//-- load custom config (only useful in docker containers, to override default config)
let hasCustomConfig = false;
configPath = 'custom_config/config.json';
configFile = path.join(__dirname, configPath);
if (fs.existsSync(configFile))
{
    hasCustomConfig = true;
    let customConfig;
    try
    {
        customConfig = require(configFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", configPath);
        process.exit(1);
    }
    // retrieve config from checker
    checker = new ConfigChecker(config);
    if (!checker.check(customConfig))
    {
        logger.error("Config file '%s' is invalid", configPath);
        _.forEach(checker.getErrors(), function (err) {
            logger.error(err);
        });
        process.exit(1);
    }
    config = checker.getCfg();
}


//-- update config based on environment (used when using docker container)

//-- check CoinMarketCap
// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    let enableCoinMarketCap = process.env['cfg.coinmarketcap.enabled'];
    if (undefined !== enableCoinMarketCap && '' !== enableCoinMarketCap)
    {
        if (true === enableCoinMarketCap || '1' == enableCoinMarketCap)
        {
            config.coinmarketcap.enabled = true;
        }
        else if (false === enableCoinMarketCap || '0' == enableCoinMarketCap)
        {
            config.coinmarketcap.enabled = false;
        }
    }
    // check history feature
    if (config.coinmarketcap.enabled)
    {
        let enableHistory = process.env['cfg.coinmarketcap.history'];
        if (true === enableHistory || '1' == enableHistory)
        {
            config.coinmarketcap.history = true;
        }
        else if (false === enableHistory || '0' == enableHistory)
        {
            config.coinmarketcap.history = false;
        }
    }
}

// add log if CoinMarketCap is enabled
if (config.coinmarketcap.enabled)
{
    if (config.coinmarketcap.history)
    {
        logger.warn("CoinMarketCap API is enabled (with history)");
    }
    else
    {
        logger.warn("CoinMarketCap API is enabled (without history)");
    }
}

// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    _.forEach(config.exchanges, function(obj, exchange) {
        let enableExchange = process.env[util.format('cfg.exchanges.%s.enabled', exchange)];
        if (undefined !== enableExchange && '' !== enableExchange)
        {
            if (true === enableExchange || '1' == enableExchange)
            {
                config.exchanges[exchange]['enabled'] = true;
            }
            else if (false === enableExchange || '0' == enableExchange)
            {
                config.exchanges[exchange]['enabled'] = false;
            }
        }
        if (config.exchanges[exchange]['enabled'])
        {
            let key = process.env[util.format('cfg.exchanges.%s.key', exchange)];
            let secret = process.env[util.format('cfg.exchanges.%s.secret', exchange)];
            if (undefined !== key && '' != key && undefined !== secret && '' != secret)
            {
                config.exchanges[exchange]['key'] = key;
                config.exchanges[exchange]['secret'] = secret;
            }
            // check if requirePair is supported
            if (config.exchanges[exchange].hasOwnProperty('requirePair'))
            {
                let requirePair = process.env[util.format('cfg.exchanges.%s.requirePair', exchange)];
                if (undefined !== requirePair && '' !== requirePair)
                {
                    if (true === requirePair || '1' == requirePair)
                    {
                        config.exchanges[exchange]['requirePair'] = true;
                    }
                    else if (false === requirePair || '0' == requirePair)
                    {
                        config.exchanges[exchange]['requirePair'] = false;
                    }
                }
            }
        }
    });
}
// log which exchanges are enabled
_.forEach(config.exchanges, function(obj, exchange) {
    if (config.exchanges[exchange]['enabled'])
    {
        if ('' != config.exchanges[exchange]['key'] && '' != config.exchanges[exchange]['secret'])
        {
            if ('demo' == config.exchanges[exchange]['key'] && 'demo' == config.exchanges[exchange]['secret'])
            {
                logger.warn("%s exchange (%s) is enabled (public API & trading API)(DEMO)", exchange, obj.type);
            }
            else
            {
                logger.warn("%s exchange (%s) is enabled (public API & trading API)", exchange, obj.type);
            }
        }
        else
        {
            logger.warn("%s exchange (%s) is enabled (public API)", exchange, obj.type);
        }
    }
});

//-- check ui config
// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    let enableUi = process.env['cfg.ui.enabled'];
    if (undefined !== enableUi && '' !== enableUi)
    {
        if (true === enableUi || '1' == enableUi)
        {
            config.ui.enabled = true;
        }
        else if (false === enableUi || '0' == enableUi)
        {
            config.ui.enabled = false;
        }
    }
}
// ensure ui has been built
if (config.ui.enabled)
{
    let uiBundleFile = path.join(__dirname, 'ui/dist/index.bundle.js');
    if (!fs.existsSync(uiBundleFile))
    {
        config.ui.enabled = false;
        logger.warn("UI won't be enabled because it does not seem to have been built");
    }
}
if (config.ui.enabled)
{
    // save UI endpoint in internalConfig (this requires config.listen.externalEndpoint to be defined)
    if (undefined !== config.listen.externalEndpoint && '' != config.listen.externalEndpoint)
    {
        internalConfig.set('uiEndpoint', `${config.listen.externalEndpoint}/ui`);
    }
    logger.warn("UI is enabled");
}

//-- check pushover config
// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    let pushoverUser = process.env['cfg.pushover.user'];
    let pushoverToken = process.env['cfg.pushover.token'];
    if (undefined !== pushoverUser && '' != pushoverUser && undefined !== pushoverToken && '' != pushoverToken)
    {
        config.pushover.enabled = true;
        config.pushover.user = pushoverUser;
        config.pushover.token = pushoverToken;
    }
}
// add log if push over is enabled
if (config.pushover.enabled && '' != config.pushover.user && '' != config.pushover.token)
{
    logger.warn("PushOver API is enabled");
}

//-- check tickerMonitor config
// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    let enableTickerMonitor = process.env['cfg.tickerMonitor.enabled'];
    if (undefined !== enableTickerMonitor && '' !== enableTickerMonitor)
    {
        if (true === enableTickerMonitor || '1' == enableTickerMonitor)
        {
            config.tickerMonitor.enabled = true;
        }
        else if (false === enableTickerMonitor || '0' == enableTickerMonitor)
        {
            config.tickerMonitor.enabled = false;
        }
    }
}
// add log if TickerMonitor is enabled
if (config.tickerMonitor.enabled)
{
    logger.warn("TickerMonitor is enabled");
}

//-- check api key
// check env (only if custom config does not exist)
if (!hasCustomConfig)
{
    let apiKey = process.env['cfg.auth.apikey'];
    if (undefined !== apiKey && '' != apiKey)
    {
        config.auth.apiKey.enabled = true;
        config.auth.apiKey.key = apiKey;
    }
}
if (config.auth.apiKey.enabled && '' != config.auth.apiKey.key)
{
    logger.warn("API Key is enabled");
}

// check env for log level (only if custom config does not exist)
if (!hasCustomConfig)
{
    let logLevel = process.env['cfg.logLevel'];
    if (undefined !== logLevel)
    {
        switch (logLevel)
        {
            case 'error':
            case 'warn':
            case 'info':
            case 'verbose':
            case 'debug':
            case 'silly':
                config.logLevel = logLevel;
        }
    }
}

// update log level
logger.level = config.logLevel;

// check env for external endpoints (only if custom config does not exist)
if (!hasCustomConfig)
{
    if (undefined !== process.env['cfg.listen.externalEndpoint'] && '' != process.env['cfg.listen.externalEndpoint'])
    {
        config.listen.externalEndpoint = process.env['cfg.listen.externalEndpoint'];
    }
    if (undefined !== process.env['cfg.listenWs.externalEndpoint'] && '' != process.env['cfg.listenWs.externalEndpoint'])
    {
        config.listenWs.externalEndpoint = process.env['cfg.listenWs.externalEndpoint'];
    }
}

// check env for sessions configuration (only if custom config does not exist)
if (!hasCustomConfig)
{
    if (undefined !== process.env['cfg.sessions.maxSubscriptions'] && '' != process.env['cfg.sessions.maxSubscriptions'])
    {
        let value = parseInt(process.env['cfg.sessions.maxSubscriptions']);
        if (!isNaN(value) && value >= 0)
        {
            config.sessions.maxSubscriptions = process.env['cfg.sessions.maxSubscriptions'];
        }
    }
    if (undefined !== process.env['cfg.sessions.maxDuration'] && '' != process.env['cfg.sessions.maxDuration'])
    {
        let value = parseInt(process.env['cfg.sessions.maxDuration']);
        if (!isNaN(value) && value >= 0)
        {
            config.sessions.maxDuration = process.env['cfg.sessions.maxDuration'];
        }
    }
}

//-- check certificate files
let sslCertificate = {
    key:{
        required:true,
        path:'ssl/certificate.key'
    },
    cert:{
        required:true,
        path:'ssl/certificate.crt'
    },
    ca:{
        required:false,
        path:'ssl/ca.crt'
    }
}
let sslOptions = {}
if (config.listen.ssl || config.listenWs.ssl)
{
    _.forEach(sslCertificate, (obj, key) => {
        obj.file = path.join(__dirname, obj.path);
        if (!fs.existsSync(obj.file))
        {
            if (!obj.required)
            {
                return;
            }
            logger.error("SSL requested in config but file '%s' does not exist", obj.path);
            process.exit(1);
        }
        try
        {
            sslOptions[key] = fs.readFileSync(obj.file);
        }
        catch (e)
        {
            logger.error("SSL requested in config but file '%s' cannot be read (%s)", obj.path, e.message);
            process.exit(1);
        }
    });
}

// update default user-agent
internalConfig.set('userAgent', config.userAgent.value);

//-- HTTP server
let startHttp = function(){
    const bodyParsers = {
        urlEncoded:bodyParser.urlencoded({ extended: false }),
        json:bodyParser.json()
    };
    const app = express();
    let server;
    if (config.listen.ssl)
    {
        server = https.createServer(sslOptions, app);
    }
    else
    {
        server = http.createServer(app);
    }
    server.on('error', function(err){
        if (undefined !== err.code && 'EADDRINUSE' == err.code)
        {
            logger.error("Address %s:%s is already in use", err.address, err.port);
            process.exit(1);
        }
        throw err;
    });
    app.use(compression());
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "apikey");
        res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,PUT,OPTIONS");
        next();
    });

    // do we want to trust proxy
    if (config.auth.trustProxy.enabled)
    {
        app.set('trust proxy', config.auth.trustProxy.proxies);
    }

    // load routes
    require('./app/routes/http')(app, bodyParsers, config);

    // start server
    let ipaddr = '0.0.0.0';
    if ('*' != config.listen.ipaddr)
    {
        ipaddr = config.listen.ipaddr;
    }
    return function(){
        server.listen(config.listen.port, ipaddr, function(){
            let proto = 'HTTP';
            if (config.listen.ssl)
            {
                proto = 'HTTPS';
            }
            logger.warn("%s server is alive on %s:%s", proto, config.listen.ipaddr, config.listen.port);
        });
    }
}();

//-- WS server
let startWs = function()
{
    const app = express();
    let server;
    if (config.listenWs.ssl)
    {
        server = https.createServer(sslOptions, app);
    }
    else
    {
        server = http.createServer(app);
    }
    server.on('error', function(err){
        if (undefined !== err.code && 'EADDRINUSE' == err.code)
        {
            logger.error("Address %s:%s is already in use", err.address, err.port);
            process.exit(1);
        }
        throw err;
    });
    const expressWs = require('express-ws')(app, server, {
        wsOptions:{}
    });

    // do we want to trust proxy
    if (config.auth.trustProxy.enabled)
    {
        app.set('trust proxy', config.auth.trustProxy.proxies);
    }

    // load routes
    require('./app/routes/ws')(app, config);

    // start server
    let ipaddr = '0.0.0.0';
    if ('*' != config.listenWs.ipaddr)
    {
        ipaddr = config.listenWs.ipaddr;
    }
    return function(){
        server.listen(config.listenWs.port, ipaddr, function(){
            let proto = 'WS';
            if (config.listenWs.ssl)
            {
                proto = 'WSS';
            }
            logger.warn("%s server is alive on %s:%s", proto, config.listenWs.ipaddr, config.listenWs.port);
        });
    }
}();

// trap ctrl-c to close database properly
process.on('SIGINT', function() {
    storage.close();
    process.exit();
});

//-- check storage
storage.checkDatabase().then(() => {
    // load data from storage
    storage.loadData(config).then(() => {
        logger.info("Data loaded successfully");
        sessionRegistry.startCheckSessionsLoop({maxDuration:config.sessions.maxDuration});
        //-- start both servers
        startHttp();
        startWs();
    }).catch(() => {
        process.exit(1);
    });
}).catch (() => {
    process.exit(1);
});
