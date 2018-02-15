const debug = require('./debug');
const _default = require('./default');
const server = require('./server');
const auth = require('../auth');
const errors = require('../errors');
const coinmarketcap = require('../../coinmarketcap/routes');
const pushover = require('../../pushover/routes');
const exchanges = require('./exchanges');
const sessions = require('./sessions');
const portfolio = require('./portfolio');
const ui = require('./ui');

module.exports = function(app, bodyParsers, config) {
    auth(app, config);
    debug(app, bodyParsers, config);
    coinmarketcap(app, bodyParsers, config);
    pushover(app, bodyParsers, config);
    exchanges(app, bodyParsers, config);
    sessions(app, bodyParsers, config);
    ui(app, bodyParsers, config);
    server(app, bodyParsers, config);
    // must be loaded after coinmarketcap
    portfolio(app, bodyParsers, config);
    _default(app, config);
    errors(app, config);
};
