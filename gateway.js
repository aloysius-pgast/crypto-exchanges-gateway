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

//-- update config based on environment (used when using docker container)
// check exchanges config
_.forEach(['binance','bittrex','poloniex'], function(exchange) {
    let key = process.env[util.format('cfg.exchanges.%s.key', exchange)];
    let secret = process.env[util.format('cfg.exchanges.%s.secret', exchange)];
    if (undefined !== key && '' != key && undefined !== secret && '' != secret)
    {
        logger.warn("Enabling '%s' exchange...", exchange);
        config.exchanges[exchange]['key'] = key;
        config.exchanges[exchange]['secret'] = secret;
    }
});
// check pushover config
let pushoverUser = process.env['cfg.pushover.user'];
let pushoverToken = process.env['cfg.pushover.token'];
if (undefined !== pushoverUser && '' != pushoverUser && undefined !== pushoverToken && '' != pushoverToken)
{
    logger.warn("Enabling 'PushOver' service...", exchange);
    config.pushover.enabled = true;
    config.pushover.user = pushoverUser;
    config.pushover.token = pushoverToken;
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
});
