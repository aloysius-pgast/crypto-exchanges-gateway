"use strict";
const retry = require('retry');
const WebSocket = require('ws');
const EventEmitter = require('events');
const url = require('url');
const querystring = require('querystring');
const _ = require('lodash');
const internalConfig = require('./internal-config');
const debug = require('debug')('CEG:WebSocketConnection');

// how long should we wait before trying to reconnect upon connection failure
const RETRY_DELAY = 10 * 1000;
// retry 11 times (this means that WS will try to connect for a maximum of 120s)
const RETRY_COUNT = 11;
// connection will be closed if we don't receive pong after timeout
const PING_TIMEOUT = internalConfig.get('keepalive').exchanges;
// default user agent
const USER_AGENT = internalConfig.get('userAgent');
// how long do we want to wait for handshake
const HANDSHAKE_TIMEOUT = 10 * 1000;

// connection states
const STATE_NEW = 0;
const STATE_CONNECTING = 1;
const STATE_CONNECTED = 2;
const STATE_DISCONNECTING = 3;
const STATE_DISCONNECTED = 4;

/*
   Following events can be emitted

   1) message, when a message is received

   Data will contain the message received

   2) connectionError, when a connection error occurs (ie: WS cannot be connnected)

   Data will be an object {attempts:integer,retry:boolean,error:err,uri:string}

   - attempts : number of attempts to connect
   - retry : whether or not there are retry left
   - error : the connection error which occurred
   - uri : ws uri (including query parameters)

   3) disconnected, when websocket connection has been disconnected

   This is a final event. Websocket won't be reconnected. A new WebsocketConnection object should be used
   Event will not be emitted in case connection is disconnected by client or on connection failure
   Event will not be emitted for connection/reconnection error (event connectionError will be emitted instead)

   Data will be an object {code:integer,reason:string,uri:string}

   - uri : ws uri (including query parameters)

   4) connected, when websocket connection is ready to receive message

   Event will only be emitted once in the lifetime of the object

   Data will be an object {uri:string}

   - uri : ws uri (including query parameters)

 */

/**
 * Constructor
 *
 * @param {string} uri WS uri (ws://xxx or wss://xxx)
 * @param {integer} options.retryCount how many times we should retry to connect upon connection error (optional, default = 11)
 * @param {integer} options.retryDelay how many ms to wait before retry (optional, default = 10000)
 * @param {integer} options.pingTimeout timeout in ms before closing WS connection (optional, default = see internalConfig) (0 means disable PING)
 * @param {string} options.userAgent user agent to set when opening WS (optional, default = see internalConfig)
 * @param {function} options.onPrepareRequest function returning a Promise which should resolve to {uri:string, headers:{},queryParams:{}}
 */
class WebSocketConnection extends EventEmitter
{

constructor(uri, options)
{
    super();
    this._uri = uri;
    this._retryCount = RETRY_COUNT;
    this._retryDelay = RETRY_DELAY;
    this._pingTimeout = PING_TIMEOUT;
    this._userAgent = USER_AGENT;
    this._onPrepareRequest = null;
    if (undefined !== options)
    {
        // retry count
        if (undefined !== options.retryCount)
        {
            this._retryCount = options.retryCount;
        }
        if (undefined !== options.retryDelay)
        {
            this._retryDelay = options.retryDelay;
        }
        if (undefined != options.userAgent && '' != options.userAgent)
        {
            this._userAgent = options.userAgent;
        }
        if (undefined !== options.pingTimeout)
        {
            this._pingTimeout = options.pingTimeout;
        }
        if (undefined !== options.onPrepareRequest)
        {
            this._onPrepareRequest = options.onPrepareRequest;
        }
    }
    this._ws = null;
    // when WS successfully connected
    this._timestamp = null;
    this._connectionState = STATE_NEW;
    this._ignoreCloseEvent = true;
}

/**
 * Indicates whether or not we're ready to process messages from server
 */
isConnected()
{
    return STATE_CONNECTED == this._connectionState;
}

/**
 * Indicates whether or not we're waiting for connection to be established
 */
isConnecting()
{
    return STATE_CONNECTING == this._connectionState;
}

send(data)
{
    if (STATE_CONNECTED != this._connectionState)
    {
        return false;
    }
    this._ws.send(data);
}

disconnect()
{
    if (STATE_DISCONNECTED == this._connectionState || STATE_DISCONNECTING == this._connectionState)
    {
        return;
    }
    this._connectionState = STATE_DISCONNECTING;
    this._finalize(false, STATE_DISCONNECTED);
    return;
}

connect()
{
    if (STATE_NEW !== this._connectionState)
    {
        return false;
    }
    let attempt = 1;
    this._connectionState = STATE_CONNECTING;
    try
    {
        const retryOptions = {
            minTimeout:this._retryDelay,
            // do not use any exponential factor
            factor:1,
            randomize:false
        };
        if (-1 == this._retryCount)
        {
            retryOptions.forever = true;
        }
        else
        {
            retryOptions.retries = this._retryCount;
        }
        const operation = retry.operation(retryOptions);
        operation.attempt(async (currentAttempt) => {
            // connection has already been disconnected by client
            if (STATE_CONNECTING != this._connectionState)
            {
                return;
            }
            let uri = this._uri;
            const wsOptions = {
                perMessageDeflate: false,
                handshakeTimeout:HANDSHAKE_TIMEOUT,
                headers: {
                    'User-Agent': this._userAgent
                }
            }
            attempt = currentAttempt;
            // call _onPrepareRequest callback to retrieve extra headers & query parameters
            if (null !== this._onPrepareRequest)
            {
                let data;
                try
                {
                    data = await this._onPrepareRequest();
                    if (undefined === data || null === data)
                    {
                        if (debug.enabled)
                        {
                            debug("onPrepareRequest callback returned no data for WS '%s'", uri);
                        }
                        const err = {code:'NO_DATA',message:'onPrepareRequest callback returned no data'};
                        this._ws = null;
                        if (operation.retry(err))
                        {
                            this.emit('connectionError', {uri:uri,attempts:attempt,retry:true,error:err});
                            return;
                        }
                        this.emit('connectionError', {uri:uri,attempts:attempt,retry:false,error:err});
                        return;
                    }
                    if (undefined === data.uri)
                    {
                        if (debug.enabled)
                        {
                            debug("onPrepareRequest callback returned no uri for WS '%s'", uri);
                        }
                        const err = {code:'NO_DATA',message:"Missing 'uri' in data returned by onPrepareRequest callback"};
                        this._ws = null;
                        if (operation.retry(err))
                        {
                            this.emit('connectionError', {uri:uri,attempts:attempt,retry:true,error:err});
                            return;
                        }
                        this.emit('connectionError', {uri:uri,attempts:attempt,retry:false,error:err});
                        return;
                    }
                    uri = data.uri;
                    // update headers
                    if (undefined !== data.headers)
                    {
                        _.forEach(data.headers, (value, name) => {
                            //wsOptions.headers[name] = value;
                        });
                    }
                    // update uri if we have extra query parameters
                    if (undefined !== data.queryParams)
                    {
                        const u = url.parse(uri);
                        let params;
                        // merge uri params with query
                        if (null !== u.query && '' != u.query)
                        {
                            params = querystring.parse(u.query);
                            _.forEach(data.queryParams, (value, key) => {
                                params[key] = value;
                            });
                        }
                        else
                        {
                            params = data.queryParams;
                        }
                        // if we have params, rebuild uri
                        if (!_.isEmpty(params))
                        {
                            const query = querystring.stringify(params);
                            uri = `${u.protocol}//${u.host}`;
                            if (null !== u.pathname)
                            {
                                uri += u.pathname;
                            }
                            uri += `?${query}`;
                        }
                    }
                }
                catch (e)
                {
                    if (debug.enabled)
                    {
                        debug("Exception for WS '%s' : %s", uri, e.stack);
                    }
                    const err = {code:'EXCEPTION',message:e.message};
                    this._ws = null;
                    if (operation.retry(err))
                    {
                        this.emit('connectionError', {uri:uri,attempts:attempt,retry:true,error:err});
                        return;
                    }
                    this.emit('connectionError', {uri:uri,attempts:attempt,retry:false,error:err});
                    return;
                }
            }
            let doRetry = true;
            const ws = new WebSocket(uri, wsOptions);
            let ignoreErrorEvent = false;
            let skipCloseEvent = false;
            ws.on('open', () => {
                // connection has already been disconnected by client
                if (STATE_CONNECTING != this._connectionState)
                {
                    return;
                }
                this._connectionState = STATE_CONNECTED;
                if (debug.enabled)
                {
                    debug("WS (%s) connected", uri);
                }
                this._ignoreCloseEvent = false;
                skipCloseEvent = false;
                this._timestamp = new Date().getTime();
                this._ws = ws;
                // start ping/pong
                if (0 != this._pingTimeout)
                {
                    ws.isAlive = false;
                    // initial ping
                    ws.ping('', true);
                    const interval = setInterval(() => {
                        if (WebSocket.OPEN != ws.readyState)
                        {
                            clearInterval(interval);
                            return;
                        }
                        if (!ws.isAlive)
                        {
                            if (debug.enabled)
                            {
                                debug("WS (%s) timeout : timeout = %d", uri, this._pingTimeout);
                            }
                            ws.terminate();
                            clearInterval(interval);
                            return;
                        }
                        ws.isAlive = false;
                        if (debug.enabled)
                        {
                            debug("Sending WS PING (%s)", uri);
                        }
                        ws.ping('', true);
                    }, this._pingTimeout);
                }
                this.emit('connected', {uri:uri});
            });
            ws.on('message', (message) => {
                this.emit('message', message);
            });
            ws.on('error', (e) => {
                if (ignoreErrorEvent)
                {
                    return;
                }
                // connection has already been disconnected by client
                if (STATE_CONNECTING != this._connectionState)
                {
                    return;
                }
                const err = {code:e.code,message:e.message};
                if (debug.enabled)
                {
                    debug("WS (%s) error (attempt %d/%s) : %s", uri, attempt, -1 === this._retryCount ? 'unlimited' : (1 + this._retryCount), JSON.stringify(err));
                }
                skipCloseEvent = true;
                this._ws = null;
                ws.terminate();
                // ws is not open yet, likely to be a connection error
                if (null === this._timestamp)
                {
                    if (doRetry && operation.retry(err))
                    {
                        this.emit('connectionError', {uri:uri,attempts:attempt,retry:true,error:err});
                        return;
                    }
                    this.emit('connectionError', {uri:uri,attempts:attempt,retry:false,error:err});
                }
            });
            // likely to be an auth error
            ws.on('unexpected-response', (request, response) => {
                // connection has already been disconnected by client
                if (STATE_CONNECTING != this._connectionState)
                {
                    return;
                }
                const err = {code:response.statusCode,message:response.statusMessage};
                ignoreErrorEvent = true;
                skipCloseEvent = true;
                if (debug.enabled)
                {
                    debug("WS (%s) unexpected-response (attempt %d/%s) : %s", uri, attempt, -1 === this._retryCount ? 'unlimited' : (1 + this._retryCount), JSON.stringify(err));
                }
                this._ws = null;
                if (doRetry && operation.retry(err))
                {
                    this.emit('connectionError', {uri:uri,attempts:attempt,retry:true,error:err});
                    return;
                }
                this.emit('connectionError', {uri:uri,attempts:attempt,retry:false,error:err});
            });
            ws.on('close', (code, reason) => {
                if (this._ignoreCloseEvent)
                {
                    return;
                }
                // connection has already been disconnected by client
                if (STATE_CONNECTING != this._connectionState && STATE_CONNECTED != this._connectionState)
                {
                    return;
                }
                if (debug.enabled)
                {
                    debug("WS (%s) closed : code = %d, reason = '%s'", uri, code, reason);
                }
                this._ws = null;
                this._finalize(true, STATE_DISCONNECTED);
                if (!skipCloseEvent)
                {
                    this.emit('disconnected', {uri:uri,code:code,reason:reason});
                }
            });
            // reply to ping
            ws.on('ping', (data) => {
                ws.pong('', true);
            });
            ws.on('pong', (data) => {
                ws.isAlive = true;
            });
        });
    }
    catch (e)
    {
        if (debug.enabled)
        {
            debug("Exception for WS '%s' : %s", uri, e.stack);
        }
    }
    return true;
}

/**
 * Used to do a bit of cleaning (close ws, abort ...)
 *
 * @param {boolean} terminate indicates whether or not WS should be terminated vs closed
 * @param {integer} newState new connection state
 */
_finalize(terminate, newState)
{
    // close ws
    if (null !== this._ws)
    {
        const ws = this._ws;
        this._ws = null;
        this._ignoreCloseEvent = true;
        try
        {
            if (terminate)
            {
                ws.terminate();
            }
            else
            {
                ws.close();
            }
        }
        catch (e)
        {
            // do nothing
        }
    }
    this._connectionState = newState;
}

}

module.exports = WebSocketConnection;
