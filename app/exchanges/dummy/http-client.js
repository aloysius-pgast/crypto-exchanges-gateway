"use strict";
const debug = require('debug')('CEG:DummyHttpClient');
const _ = require('lodash');
const Errors = require('../../errors');
const request = require('request');

const DEFAULT_SOCKETTIMEOUT = 10 * 1000;

class DummyHttpClient
{

/**
 * @param {string} id exchange id
 * @param {string} baseUri base uri starting with http|https
 */
constructor(id, baseUri)
{
    this._id = id;
    this._baseUri = baseUri;
}

/**
 * Builds an url from a path
 */
_getUrl(path)
{
    return `${this._baseUri}/${path}`
}

/**
 * Performs the request (internal use)
 * @param {string} method http method
 * @param {string} path url path
 * @param {object} params request query parameters
 * @return {Promise} Promise which will resolve to the data returned by gateway or reject a BaseError exception
 */
makeRequest(method, path, params)
{
    let url = this._getUrl(path);
    let opt = {
        json:true,
        timeout:this._timeout,
        method:method.toUpperCase(),
        url:url
    };
    if (undefined !== params)
    {
        opt.qs = params;
        opt.useQuerystring = true;
    }
    if (debug.enabled)
    {
        debug(`REQ: ${method} ${url} ${JSON.stringify(params || {})}`);
    }
    let self = this;
    return new Promise((resolve, reject) => {
        request(opt, function (error, response, body) {
            // client error
            if (null !== error)
            {
                let err;
                if ('ETIMEDOUT' == error.code)
                {
                    err = new Errors.ExchangeError.NetworkError.RequestTimeout(self._id, error.message);
                }
                else
                {
                    err = new Errors.ExchangeError.NetworkError.UnknownError(self._id, error.message);
                }
                if (debug.enabled)
                {
                    debug(`ERR: ${JSON.stringify(err)}`);
                }
                return reject(err);
            }
            if (undefined !== body.error)
            {
                let err = new Errors.ExchangeError.InvalidRequest.UnknownError(self._id, e.error);
                if (debug.enabled)
                {
                    debug(`ERR: ${JSON.stringify(err)}`);
                }
                return reject(err);
            }
            if (debug.enabled)
            {
                debug(`RES: ${JSON.stringify(body)}`);
            }
            return resolve(body);
        });
    });
}

}
module.exports = DummyHttpClient;
