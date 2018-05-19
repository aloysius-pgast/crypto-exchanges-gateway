"use strict";
const Joi = require('./custom-joi');
const Errors = require('./errors');

const customMessages = {
    key:"Parameter '{{!label}}' ",
}

class JoiHelper
{

/**
 * @param {object} err Joi error
 */
static getErrorDetail(err)
{
    return err.details[0];
}

/**
 * @param {object} err Joi error
 */
static getErrorMessage(err)
{
    return err.details[0].message;
}

/**
 * @param {object} err Joi error
 */
static getErrorContext(err)
{
    return err.details[0].context;
}

/**
 * Build correct BaseError based on Joi error
 *
 * @param {object} err Joi error
 * @return {BaseError}
 */
static getError(err)
{
    let details = err.details[0];
    if (undefined === details)
    {
        return new Errors.GatewayError.InvalidRequest.UnknownError();
    }
    switch (details.type)
    {
        // one parameter is missing
        case 'any.required':
            let parameterName = details.context.label;
            return new Errors.GatewayError.InvalidRequest.MissingParameters(details.context.label);
        // one of a list of parameters is missing
        case 'object.missing':
            return new Errors.GatewayError.InvalidRequest.MissingParameters(details.context.peersWithLabels);
        // conflicting parameters found
        case 'object.xor':
            return new Errors.GatewayError.InvalidRequest.ConflictingParameters(details.context.peersWithLabels);
    }
    // try to return invalid parameter
    if (undefined !== details.context.key)
    {
        let value = '';
        if (undefined !== details.context.value)
        {
            value = details.context.value;
        }
        else if (undefined !== err._object && undefined !== err._object[details.context.key])
        {
            value = err._object[details.context.key];
        }
        return new Errors.GatewayError.InvalidRequest.InvalidParameter(details.context.label, value, details.message);
    }
    // by default return unknown error
    return new Errors.GatewayError.InvalidRequest.UnknownError(details.message);
}

/**
 * @param {object} schema Joi schema
 * @param {object} req express request
 * @param {object} opt {query:boolean,body:boolean,params:boolean}
 * @return {object} {result:object,error:object} if validation is successful, error will be null
 */
static validate(schema, req, opt)
{
    if (undefined === opt)
    {
        opt = {query:true,body:false,params:false};
    }
    let params = {};
    if (true === opt.query && undefined !== req.query)
    {
        params = req.query;
    }
    if (true === opt.body && undefined !== req.body)
    {
        for (let p in req.body)
        {
            params[p] = req.body[p];
        }
    }
    if (true === opt.params && undefined !== req.params)
    {
        for (let p in req.params)
        {
            params[p] = req.params[p];
        }
    }
    return Joi.validate(params, schema, {stripUnknown:{objects:true},language:customMessages});
}

}

module.exports = JoiHelper;
