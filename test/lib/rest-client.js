"use strict";
const _ = require('lodash');
const request = require('request');
const debug = require('debug');
const querystring = require('querystring');
const tracer = require('./tracer');

const DEFAULT_SOCKETTIMEOUT = 300 * 1000;
const DEFAULT_BASE_URI = 'http://127.0.0.1:8000';
const DEFAULT_WS_BASE_URI = 'http://127.0.0.1:8001';

let client = null;

class RestClient
{

/**
 * @param {string} opt.baseUri base uri starting with http|https (optional, default = http://127.0.0.1:8000)
 * @param {integer} opt.timeout timeout in seconds to wait for gateway to send response headers (optional, default = 300)
 * @param {string} opt.apiKey api key defined on gateway
 * @param {string} opt.wsBaseUri base uri starting with ws|wss (optional, default = ws://127.0.0.1:8001)
 */
constructor(opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    this._baseUri = DEFAULT_BASE_URI;
    this._wsBaseUri = DEFAULT_WS_BASE_URI;
    this._timeout = DEFAULT_SOCKETTIMEOUT;
    this._apiKey = '';

    if (undefined !== opt.baseUri)
    {
        if (!opt.baseUri.startsWith('http://') && !opt.baseUri.startsWith('https://'))
        {
            throw new Errors.ClientError.InvalidRequest.InvalidParameter('opt.baseUri', opt.baseUri, "Parameter 'opt.baseUri' should start with 'http://' or 'https://'");
        }
        this._baseUri = opt.baseUri;
    }
    if ('/' == this._baseUri.substr(-1, 1))
    {
        this._baseUri = this._baseUri.substr(0, this._baseUri.length -1);
    }
    if (undefined !== opt.wsBaseUri)
    {
        if (!opt.wsBaseUri.startsWith('ws://') && !opt.wsBaseUri.startsWith('wss://'))
        {
            throw new Errors.ClientError.InvalidRequest.InvalidParameter('opt.wsBaseUri', opt.wsBaseUri, "Parameter 'opt.wsBaseUri' should start with 'ws://' or 'wss://'");
        }
        this._wsBaseUri = opt.wsBaseUri;
    }
    if ('/' == this._baseUri.substr(-1, 1))
    {
        this._baseUri = this._baseUri.substr(0, this._baseUri.length -1);
    }
    if (undefined !== opt.apiKey && '' != opt.apiKey)
    {
        this._apiKey = opt.apiKey;
    }
    if (undefined !== opt.timeout)
    {
        this._timeout = value;
    }
    // used to cache pairs for each exchanges
    this._pairs = {};
}

/**
 * Returns singleton instance
 */
static getInstance()
{
    if (null === client)
    {
        let opt = {};
        if (undefined !== process.env['GATEWAY_URI'])
        {
            let uri = process.env['GATEWAY_URI'].trim();
            if ('' != uri)
            {
                opt.baseUri = uri;
            }
        }
        if (undefined !== process.env['GATEWAY_WS_URI'])
        {
            let uri = process.env['GATEWAY_WS_URI'].trim();
            if ('' != uri)
            {
                opt.wsbaseUri = uri;
            }
        }
        if (undefined !== process.env['API_KEY'])
        {
            let key = process.env['API_KEY'].trim();
            if ('' != key)
            {
                opt.apiKey = key;
            }
        }
        client = new this(opt);
    }
    return client;
}

/**
 * Returns timeout value for requests
 * @return {integer} timeout
 */
getTimeout()
{
    return this._timeout;
}

getBaseUri()
{
    return this._baseUri;
}

getWsBaseUri()
{
    return this._wsBaseUri;
}

getWsUri(path, params)
{
    let url = this._wsBaseUri;
    if ('/' != path.substr(0, 1))
    {
        url += '/';
    }
    url += path;
    let _params = {};
    if (undefined !== params)
    {
        _.forEach(params, (v, k) => {
            _params[k] = v;
        });
    }
    if ('' != this._apiKey)
    {
        _params['apiKey'] = this._apiKey;
    }
    if (!_.isEmpty(_params))
    {
        url += `?${querystring.stringify(_params)}`;
    }
    return url;
}

async getServices()
{
    let result = await this.makeRequest('GET', 'server/services');
    if (undefined !== result.error)
    {
        throw result.error;
    }
    return result.body;
}

/**
 * Retrieves the list of supported pairs for a given exchange
 *
 * @param {string} exchangeId exchange identifier
 * @return {Promise}
 */
async getPairs(exchangeId)
{
    let result = await this.makeRequest('GET', `exchanges/${exchangeId}/pairs`, {useCache:true});
    // an error occured
    if (undefined !== result.error)
    {
        throw result.error;
    }
    return result.body;
}

/**
 * Performs the request (internal use)
 * @param {string} method http method
 * @param {string} path to call
 * @param {object} params request query parameters
 * @param {boolean} json whether or not we should send a json body
 * @return {Promise} Promise which will resolve to an object {error:Error,httpCode:integer,body:object}
 */
makeRequest(method, path, params, jsonBody)
{
    let url = this._baseUri;
    if ('/' != path.substr(0, 1))
    {
        url += '/';
    }
    url += path;
    if (undefined === jsonBody)
    {
        jsonBody = false;
    }
    let opt = {
        json:true,
        timeout:this._timeout,
        method:method.toUpperCase(),
        url:url
    };
    if (undefined !== params)
    {
        if (jsonBody)
        {
            opt.body = params;
        }
        else
        {
            opt.qs = params;
            opt.useQuerystring = true;
        }
    }
    if ('' !== this._apiKey)
    {
        opt.headers = {
            'ApiKey':this._apiKey
        }
    }
    if (debug.enabled)
    {
        debug(`REQ: ${method} ${url} ${JSON.stringify(params || {})}`);
    }
    return new Promise((resolve, reject) => {
        let startTime = Date.now();
        request(opt, function (error, response, body) {
            let endTime = Date.now();
            let result = {};
            // client error
            if (null !== error)
            {
                result.error = error;
                if (debug.enabled)
                {
                    debug(`ERR: ${error.message}`);
                }
            }
            else
            {
                result.httpCode = response.statusCode;
                result.body = body;
                if (undefined === body || undefined !== body.extError)
                {
                    if (debug.enabled)
                    {
                        if (undefined === body)
                        {
                            debug(`ERR: no body received`);
                        }
                        else
                        {
                            debug(`ERR: ${JSON.stringify(body)}`);
                        }
                    }
                }
                else
                {
                    if (debug.enabled)
                    {
                        debug(`RES: ${JSON.stringify(body)}`);
                    }
                }
                if (tracer.shouldTrace(result.httpCode))
                {
                    let req = {
                        method:method,
                        path:path,
                        timestamp:parseFloat(startTime / 1000.0),
                        params:undefined === params ? {} : params,
                        json:jsonBody
                    }
                    let res = {
                        httpCode:result.httpCode,
                        body:result.body,
                        timestamp:parseFloat(endTime / 1000.0),
                        duration:endTime - startTime
                    }
                    // trace
                    tracer.trace(req, res);
                }
            }
            return resolve(result);
        });
    });
}

}
module.exports = RestClient;
