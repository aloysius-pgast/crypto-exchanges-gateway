const fs = require('fs');
const path = require('path');
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const ConfigChecker = require('./app/config-checker');
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
// function to check if level is enabled
logger.isLevel = function(level)
{
    return this.levels[this.level] >= this.levels[level];
}

//-- load config
const checker = new ConfigChecker();

var config = {};
var configFile = path.join(__dirname, 'config/config.json');
if (fs.existsSync(configFile))
{
    try
    {
        config = require(configFile);
    }
    catch (e)
    {
        logger.error("Config file '%s' is not a valid JSON file", configFile);
        process.exit(1);
    }
}

// retrieve config from checker
if (!checker.check(config))
{
    logger.error("Config file is invalid");
    _.forEach(checker.getErrors(), function (err) {
        logger.error(err);
    });
    process.exit(1);
}
config = checker.getCfg();

// add log if CoinMarketCap is enabled
if (config.coinmarketcap.enabled)
{
    logger.warn("CoinMarketCap API is enabled");
}

//-- update config based on environment (used when using docker container)
// check exchanges config
_.forEach(config.exchanges, function(obj, exchange) {
    let key = process.env[util.format('cfg.exchanges.%s.key', exchange)];
    let secret = process.env[util.format('cfg.exchanges.%s.secret', exchange)];
    if (undefined !== key && '' != key && undefined !== secret && '' != secret)
    {
        config.exchanges[exchange]['key'] = key;
        config.exchanges[exchange]['secret'] = secret;
    }
});
// log which exchanges are enabled
_.forEach(config.exchanges, function(obj, exchange) {
    if (config.exchanges[exchange]['enabled'])
    {
        if ('' != config.exchanges[exchange]['key'] && '' != config.exchanges[exchange]['secret'])
        {
            if ('demo' == config.exchanges[exchange]['key'] && 'demo' == config.exchanges[exchange]['secret'])
            {
                logger.warn("%s exchange is enabled (public API & trading API)(DEMO)", exchange);
            }
            else
            {
                logger.warn("%s exchange is enabled (public API & trading API)", exchange);
            }
        }
        else
        {
            logger.warn("%s exchange is enabled (public API)", exchange);
        }
    }
});

//-- check ui config
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
// ensure ui has been built
if (config.ui.enabled)
{
    var uiBundleFile = path.join(__dirname, 'ui/dist/index.bundle.js');
    if (!fs.existsSync(uiBundleFile))
    {
        config.ui.enabled = false;
        logger.warn("UI won't be enabled because it does not seem to have been built");
    }
}
if (config.ui.enabled)
{
    logger.warn("UI is enabled");
}

//-- check pushover config
let pushoverUser = process.env['cfg.pushover.user'];
let pushoverToken = process.env['cfg.pushover.token'];
if (undefined !== pushoverUser && '' != pushoverUser && undefined !== pushoverToken && '' != pushoverToken)
{
    config.pushover.enabled = true;
    config.pushover.user = pushoverUser;
    config.pushover.token = pushoverToken;
}
// add log if push over is enabled
if (config.pushover.enabled && '' != config.pushover.user && '' != config.pushover.token)
{
    logger.warn("PushOver API is enabled");
}

//-- check api key
let apiKey = process.env['cfg.auth.apikey'];
if (undefined !== apiKey && '' != apiKey)
{
    config.auth.apiKey.enabled = true;
    config.auth.apiKey.key = apiKey;
}
if (config.auth.apiKey.enabled && '' != config.auth.apiKey.key)
{
    logger.warn("API Key is enabled");
}

// check config
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

// update log level
logger.level = config.logLevel;

// create app
const bParser = bodyParser.urlencoded({ extended: false })
const app = express();

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
require('./app/routes')(app, bParser, config);

// start app
const http = require('http').Server(app);
var ipaddr = '0.0.0.0';
if ('*' != config.listen.ipaddr)
{
    ipaddr = config.listen.ipaddr;
}
http.listen(config.listen.port, ipaddr, function(){
    logger.warn("We're alive on %s:%s", config.listen.ipaddr, config.listen.port);
}).on('error', function(err){
    if (undefined !== err.code && 'EADDRINUSE' == err.code)
    {
        logger.error("Address %s:%s is already in use", err.address, err.port);
        process.exit(1);
    }
    throw err;
});
