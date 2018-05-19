"use strict";
const _assert = require('assert');
const joi = require('joi');
const _ = require('lodash');
const Mocha = require('mocha');

const restClient = require('./rest-client').getInstance();

class Assert
{

/**
 * @param {object} result, result returned by rest client
 * @param {object} schema joi schema (optional)
 * @param {boolean} opt.isList when true mean body should be considered as a dict list
 * @param {integer|integer[]} opt.httpCode list of accepted http codes (optional)
 * @param {integer|integer[]} opt.notHttpCode list of http codes to reject (optional, will be ignored if opt.httpCode is defined)
 * @param {string|string[]} opt.errorType list of error types to accept (x.y & x.y.z will both match x.y.z.t) (optional)
 * @param {string|string[]} opt.notErrorType list of error types to reject (x.y & x.y.z will both match x.y.z.t) (optional, will be ignored if opt.errorType is defined)
 */
static validateResult(result, schema, opt)
{
    // a network error occurred
    if (undefined !== result.error)
    {
        _assert.fail(result.error);
    }
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined === opt.isList)
    {
        opt.isList = false;
    }

    // validate http code
    let expected = [200];
    let not = false;
    if (undefined !== opt.httpCode)
    {
        expected = opt.httpCode;
    }
    else if (undefined !== opt.notHttpCode)
    {
        expected = opt.notHttpCode;
        not = true;
    }
    this.validateHttpCode(result.httpCode, expected, not, result.body);

    // validate error type
    if (undefined !== opt.errorType || undefined !== opt.notErrorType)
    {
        let expected;
        let not = false;
        if (undefined !== opt.errorType)
        {
            expected = opt.errorType;
        }
        else
        {
            expected = opt.notErrorType;
            not = true;
        }
        this.validateErrorType(result.body, expected, not);
    }

    // validate schema
    if (undefined !== schema)
    {
        let r = joi.validate(result.body, schema);
        if (null !== r.error)
        {
            let message = r.error.message;
            if ('array' == schema._type)
            {
                // if first element of path is a number, it might be a problem with the element at given index
                let index = r.error.details[0].path[0];
                if ('number' == typeof index && undefined !== result.body[index])
                {
                    // retry to validate only this element
                    {
                        let newSchema = schema._inner.items[0];
                        let r = joi.validate(result.body[index], newSchema);
                        if (null !== r.error)
                        {
                            console.log(`${result.httpCode}:`);
                            console.log(`body[${index}]:`)
                            console.log(r.error.annotate());
                            _assert.fail(message);
                        }
                    }
                }
            }
            else if (opt.isList)
            {
                let key = r.error.details[0].path[0];
                // retry with invalid element
                if (undefined !== result.body[key])
                {
                    // retry to validate only this element
                    {
                        let newSchema = schema._inner.patterns[0].rule;
                        let r = joi.validate(result.body[key], newSchema)
                        if (null !== r.error)
                        {
                            console.log(`${result.httpCode}:`);
                            console.log(`body[${key}]:`)
                            console.log(r.error.annotate());
                            _assert.fail(message);
                        }
                    }
                }
            }
            console.log(`${result.httpCode}:`);
            console.log(r.error.annotate());
            if ('array' == schema._type)
            {
                // we dont' have the expected number of elements in the array
                if (0 == r.error.details[0].path.length && 'array.length' == r.error.details[0].type)
                {
                    message += ` (not ${result.body.length})`;
                }
            }
            _assert.fail(message);
        }
    }
}

/**
 * Validate http code
 * @param {integer} actual actual http code
 * @param {integer|integer[]} expected list of expected http code
 * @param {boolean} not if true will reverse behaviour (ie: error will be raise if 'actual' is in 'expected') (optional, default = false)
 * @param {object} body will be printed in case of error if defined
 */
static validateHttpCode(actual, expected, not, body)
{
    if (undefined === not)
    {
        not = false;
    }
    let codes;
    if (Array.isArray(expected))
    {
        codes = expected;
    }
    else
    {
        codes = [expected];
    }
    // actual http code should not be in the list
    if (not)
    {
        if (-1 !== codes.indexOf(actual))
        {
            if (undefined !== body)
            {
                console.log(`${actual}:`);
                console.log(JSON.stringify(body, null, 2));
            }
            _assert.fail(`HTTP code (${actual}) should not none of [${codes.join(',')}]`);
        }
    }
    else
    {
        if (-1 === codes.indexOf(actual))
        {
            if (undefined !== body)
            {
                console.log(`${actual}:`);
                console.log(JSON.stringify(body, null, 2));
            }
            _assert.fail(`HTTP code (${actual}) should be one of [${codes.join(',')}]`);
        }
    }
}

/**
 * Validate error type
 * @param {object} body body returned by rest client (will be displayed in case of error)
 * @param {string|string[]} expected list of expected error type code
 * @param {boolean} not if true will reverse behaviour (ie: error will be raise if 'actual' is in 'expected') (optional, default = false)
 */
static validateErrorType(body, expected, not)
{
    if (undefined === body.extError)
    {
        _assert.fail('Not an error');
    }
    if (undefined === not)
    {
        not = false;
    }
    let types;
    if (Array.isArray(expected))
    {
        types = expected;
    }
    else
    {
        types = [expected];
    }
    // actual type should not be in the list
    if (not)
    {
        for (let i = 0; i < types.length; ++i)
        {
            if (0 == body.extError.errorType.indexOf(types[i]))
            {
                console.log(JSON.stringify(body, null, 2));
                _assert.fail(`Error type (${body.extError.errorType}) should not match any of [${types.join(',')}]`);
            }
        }
    }
    else
    {
        let match = false;
        for (let i = 0; i < types.length; ++i)
        {
            if (0 == body.extError.errorType.indexOf(types[i]))
            {
                match = true;
                break;
            }
        }
        if (!match)
        {
            console.log(JSON.stringify(body, null, 2));
            _assert.fail(`Error type (${body.extError.errorType}) should match one of [${types.join(',')}]`);
        }
    }
}

/**
 * @param {string} message message to display
 * @param {object} body will be displayed if defined
 */
static fail(message, body)
{
    if (undefined !== body)
    {
        console.log(JSON.stringify(body, null, 2));
    }
    _assert.fail(message);
}

}
module.exports = Assert;
