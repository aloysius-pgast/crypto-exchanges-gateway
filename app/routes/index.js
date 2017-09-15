const debug = require('./debug');
const _default = require('./default');
const server = require('./server');
const auth = require('./auth');
const errors = require('./errors');
const coinmarketcap = require('../coinmarketcap/routes');
const pushover = require('../pushover/routes');
const exchanges = require('./exchanges');

module.exports = function(app, bodyParser, config) {
    auth(app, bodyParser, config);
    debug(app, bodyParser, config);
    coinmarketcap(app, bodyParser, config);
    pushover(app, bodyParser, config);
    exchanges(app, bodyParser, config);
    server(app, bodyParser, config);
    _default(app, bodyParser, config);
    errors(app, bodyParser, config);
};
