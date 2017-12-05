"use strict";
const retry = require('retry');
const WebSocket = require('ws');
const EventEmitter = require('events');
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

   Data will be an object {attempts:integer,retry:boolean,error:err}

   - attempts : number of attempts to connect
   - retry : whether or not there are retry left
   - error : the connection error which occurred

   3) disconnected, when websocket connection has been disconnected

   This is a final event. Websocket won't be reconnected. A new WebsocketConnection object should be used
   Event will not be emitted in case connection is disconnected by client or on connection failure
   Event will not be emitted for connection/reconnection error (event connectionError will be emitted instead)

   Data will be an object {code:integer,reason:string}

   4) connected, when websocket connection is ready to receive message

   Event will only be emitted once in the lifetime of the object

 */

/**
 * Constructor
 *
 * @param {string} uri WS uri (ws://xxx or wss://xxx)
 * @param {integer} options.retryCount how many times we should retry to connect upon connection error (optional, default = 11)
 * @param {integer} options.retryDelay how many ms to wait before retry (optional, default = 10000)
 * @param {integer} options.pingTimeout timeout in ms before closing WS connection (optional, default = see internalConfig)
 * @param {string} options.userAgent user agent to set when opening WS (optional, default = see internalConfig)
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
    }
    this._ws = null;
    // when WS successfully connected
    this._timestamp = null;
    this._connectionState = STATE_NEW;
    this._ignoreCloseEvent = true;
}

isConnected()
{
    return STATE_CONNECTED == this._connectionState;
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
    let self = this;
    try
    {
        let retryOptions = {
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
        let wsOptions = {
            perMessageDeflate: false,
            handshakeTimeout:HANDSHAKE_TIMEOUT,
            headers: {
                'User-Agent': this._userAgent
            }
        }
        let operation = retry.operation(retryOptions);
        operation.attempt(function(currentAttempt){
            // connection has already been disconnected by client
            if (STATE_CONNECTING != self._connectionState)
            {
                return;
            }
            attempt = currentAttempt;
            let doRetry = true;
            let ws = new WebSocket(self._uri, wsOptions);
            let ignoreErrorEvent = false;
            let skipCloseEvent = false;
            ws.on('open', function() {
                // connection has already been disconnected by client
                if (STATE_CONNECTING != self._connectionState)
                {
                    return;
                }
                self._connectionState = STATE_CONNECTED;
                if (debug.enabled)
                {
                    debug("WS (%s) connected", self._uri);
                }
                self._ignoreCloseEvent = false;
                skipCloseEvent = false;
                self._timestamp = new Date().getTime();
                self._ws = this;
                // start ping/pong
                if (0 != self._pingTimeout)
                {
                    let _ws = this;
                    _ws.isAlive = false;
                    // initial ping
                    _ws.ping('', true, true);
                    let interval = setInterval(function() {
                        if (WebSocket.OPEN != _ws.readyState)
                        {
                            clearTimeout(interval);
                            return;
                        }
                        if (!_ws.isAlive)
                        {
                            if (debug.enabled)
                            {
                                debug("WS (%s) timeout : timeout = %d", self._uri, self._pingTimeout);
                            }
                            _ws.terminate();
                            clearTimeout(interval);
                            return;
                        }
                        _ws.isAlive = false;
                        _ws.ping('', true, true);
                    }, self._pingTimeout);
                }
                self.emit('connected');
            });
            ws.on('message', function(message) {
                self.emit('message', message);
            });
            ws.on('error', function(e) {
                if (ignoreErrorEvent)
                {
                    return;
                }
                // connection has already been disconnected by client
                if (STATE_CONNECTING != self._connectionState)
                {
                    return;
                }
                let err = {code:e.code,message:e.message}
                if (debug.enabled)
                {
                    debug("WS (%s) error (attempt %d/%s) : %s", self._uri, attempt, -1 === self._retryCount ? 'unlimited' : (1 + self._retryCount), JSON.stringify(err));
                }
                skipCloseEvent = true;
                self._ws = null;
                this.terminate();
                // ws is not open yet, likely to be a connection error
                if (null === self._timestamp)
                {
                    if (doRetry && operation.retry(err))
                    {
                        self.emit('connectionError', {attempts:attempt,retry:true,error:err});
                        return;
                    }
                    self.emit('connectionError', {attempts:attempt,retry:false,error:err});
                }
            });
            // likely to be an auth error
            ws.on('unexpected-response', function(request, response){
                // connection has already been disconnected by client
                if (STATE_CONNECTING != self._connectionState)
                {
                    return;
                }
                let err = {code:response.statusCode,message:response.statusMessage};
                ignoreErrorEvent = true;
                skipCloseEvent = true;
                if (debug.enabled)
                {
                    debug("WS (%s) unexpected-response (attempt %d/%s) : %s", self._uri, attempt, -1 === self._retryCount ? 'unlimited' : (1 + self._retryCount), JSON.stringify(err));
                }
                self._ws = null;
                if (doRetry && operation.retry(err))
                {
                    self.emit('connectionError', {attempts:attempt,retry:true,error:err});
                    return;
                }
                self.emit('connectionError', {attempts:attempt,retry:false,error:err});
            });
            ws.on('close', function(code, reason){
                if (self._ignoreCloseEvent)
                {
                    return;
                }
                // connection has already been disconnected by client
                if (STATE_CONNECTING != self._connectionState && STATE_CONNECTED != self._connectionState)
                {
                    return;
                }
                if (debug.enabled)
                {
                    debug("WS (%s) closed : code = %d, reason = '%s'", self._uri, code, reason);
                }
                self._ws = null;
                self._finalize(true, STATE_DISCONNECTED);
                if (!skipCloseEvent)
                {
                    self.emit('disconnected', {code:code, reason:reason});
                }
            });
            // reply to ping
            ws.on('ping', function(data){
                this.pong('', true, true);
            });
            ws.on('pong', function(data){
                this.isAlive = true;
            });
        });
    }
    catch (e)
    {
        if (debug.enabled)
        {
            debug("Exception for WS '%s' : %s", self._uri, e.stack);
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
        let ws = this._ws;
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
