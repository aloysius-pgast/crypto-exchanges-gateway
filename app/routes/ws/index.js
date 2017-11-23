const auth = require('../auth');
const errors = require('../errors');
const _default = require('./default');
const main = require('./main');

module.exports = function(app, config) {
    auth(app, config, true);
    main(app, config);
    _default(app, config);
    errors(app, config, true);
};
