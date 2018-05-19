"use strict";
const Joi = require('joi');

let customJoi = Joi;

customJoi = customJoi.extend([
    // allows to accept both arrays or comma-separated strings
    (joi) => ({
        base: joi.array(),
        name: 'csvArray',
        coerce(value, state, options) {
            if (undefined === value || '' == value)
            {
                return undefined;
            }
            if (Array.isArray(value))
            {
                return value;
            }
            return value.split(',');
        }
    }),
    // define exchange pair X-Y & currency X
    (joi) => ({
        base: joi.string(),
        name: 'string',
        language: {
            pair: 'must be an exchange pair [A-Z0-9]+-[A-Z0-9]+',
            currency: 'must be an exchange currency [A-Z0-9]+'
        },
        rules: [
            {
                name:'pair',
                validate(params, value, state, options) {
                    if (null === value.match(/^[A-Z0-9]+-[A-Z0-9]+$/))
                    {
                        if (2 == state.path.length)
                        {
                            state.key = `${state.path[0]}[${state.path[1]}]`;
                        }
                        return this.createError('string.pair', {v:value}, state, options);
                    }
                    return value;
                }
            },
            {
                name:'currency',
                validate(params, value, state, options) {
                    if (null === value.match(/^[A-Z0-9]+$/))
                    {
                        if (2 == state.path.length)
                        {
                            state.key = `${state.path[0]}[${state.path[1]}]`;
                        }
                        return this.createError('string.currency', {v:value}, state, options);
                    }
                    return value;
                }
            }
        ]
    })
]);

module.exports = customJoi;
