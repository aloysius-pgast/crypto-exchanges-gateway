const debug = require('./debug');
const _default = require('./default');
const server = require('./server');
const auth = require('../auth');
const errors = require('../errors');
const coinmarketcap = require('../../coinmarketcap/routes');
const pushover = require('../../pushover/routes');
const exchanges = require('./exchanges');
const sessions = require('./sessions');
const ui = require('./ui');

module.exports = function(app, bodyParser, config) {
    auth(app, config);
    debug(app, bodyParser, config);
    coinmarketcap(app, bodyParser, config);
    pushover(app, bodyParser, config);
    exchanges(app, bodyParser, config);
    sessions(app, bodyParser, config);
    ui(app, bodyParser, config);
    server(app, bodyParser, config);
    _default(app, config);
    errors(app, config);
};
