"use strict";
const debug = require('debug')('CEG:ExchangeStreamClient');
const EventEmitter = require('events');
const logger = require('winston');
const WebSocketConnection = require('./websocket-connection');
const Errors = require('./errors');

// how long should we wait before trying to reconnect upon disconnection
const RETRY_DELAY = 10 * 1000;

class AbstractExchangeStreamClient extends EventEmitter
{

/*
    Following events related to connection can be emitted

    1) connectionError, when a connection/reconnection error occurs (ie: WS cannot be connnected)

    Data will be an object {connectionId:integer,attempts:integer,error:err}

    - connectionId : id of WS connection
    - attempts : number of attempts to connect
    - error : the connection error which occurred

    Reconnection will be automatic

    2) disconnected, when WS has been disconnected by exchange

    Data will be an object {connectionId:integer,code:integer,reason:string}

    - connectionId : id of WS connection
    - code: disconnection code
    - reason : disconnection reason

    Reconnection will be automatic

    3) terminated, when connection failed after last connection retry

    This is a final event. Client will need to call method reconnect

    Data will be an object {connectionId:integer,attempts:integer,error:err}

    - connectionId : id of WS connection
    - attempts : number of attempts to connect
    - error : the connection error which occurred

    4) connected, when websocket is connected/reconnected

    Data will be an object {connectionId:integer}

    - connectionId : id of WS connection
*/

/**
 * Constructor
 *
 * @param {string} exchangeId exchange identifier
 * @param {string} uri WS uri (ws://xxx or wss://xxx)
 * @param {integer} options.retryCount how many times we should retry to connect upon connection error (optional, default = see WebSocketConnection)
 * @param {integer} options.retryDelay how many ms to wait before retry (optional, default = 10000)
 * @param {integer} options.pingTimeout timeout in ms before closing WS connection (optional, default = see WebSocketConnection)
 * @param {boolean} options.useQueue whether or not messages should be cached while WS is not connected (optional, default = false)
 */
constructor(exchangeId, uri, options)
{
    super();
    this._exchangeId = exchangeId;
    this._uri = uri;
    if (!uri.startsWith('ws://') && !uri.startsWith('wss://'))
    {
        throw new Error("Argument 'uri' should start with 'ws://' or 'wss://'");
    }

    this._retryDelay = RETRY_DELAY;
    this._connectionOptions = {}
    if (undefined !== options)
    {
        // retry count
        if (undefined !== options.retryCount)
        {
            if ('always' === options.retryCount)
            {
                this._connectionOptions.retryCount = -1;
            }
            else
            {
                let value = parseInt(options.retryCount);
                if (isNaN(value) || value < 0)
                {
                    throw new Error("Argument 'options.retryCount' should be an integer >= 0");
                }
                this._connectionOptions.retryCount = value;
            }
        }
        if (undefined !== options.retryDelay)
        {
            let value = parseInt(options.retryDelay);
            if (isNaN(value) || value < 1000)
            {
                throw new Error("Argument 'options.retryDelay' should be an integer >= 1000");
            }
            this._connectionOptions.retryDelay = value;
            this._retryDelay = value;
        }
        if (undefined !== options.pingTimeout)
        {
            let value = parseInt(options.pingTimeout);
            if (isNaN(value) || value < 1000)
            {
                throw new Error("Argument 'options.pingTimeout' should be an integer >= 1000");
            }
            this._connectionOptions.pingTimeout = value;
        }
    }
    // keep track of how many connections were performed
    this._connectionCounter = 0;
    this._connection = null;
    // timestamp of last connected event
    this._connectedTimestamp = null;

    // queue used when trying to send commands while ws is not connected yet
    this._useQueue = false;
    if (undefined !== options && true === options.useQueue)
    {
        this._useQueue = true;
    }
    this._queue = [];
}

getExchangeId()
{
    return this._exchangeId;
}

getUri()
{
    return this._uri;
}

/*
 * Connect WS
 *
 * Should not be necessary since connection will happen automatically on first call to 'send' method
 */
connect()
{
    // create if needed
    if (null !== this._connection)
    {
        return;
    }
    this._createConnection();
}

isConnected()
{
    if (null === this._connection)
    {
        return false;
    }
    return this._connection.isConnected()
}

isConnecting()
{
    if (null === this._connection)
    {
        return false;
    }
    return this._connection.isConnecting()
}

_logError(e)
{
    Errors.logError(e, `${this._exchangeId}|streamClient`);
}

/**
 * Adds a list of object to the queue
 */
_queueMessages(list)
{
    if (!this._useQueue)
    {
        return;
    }
    for (var i = 0; i < list.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Queuing message : ${JSON.stringify(list[i])}`);
        }
        this._queue.push(list[i]);
    }
}

/**
 * Sends each message from queue
 */
_processQueue()
{
    if (!this._useQueue || 0 == this._queue.length)
    {
        return;
    }
    // disconnection probably requested by client
    if (null === this._connection)
    {
        return;
    }
    for (var i = 0; i < this._queue.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Sending message from queue : ${JSON.stringify(this._queue[i])}`);
        }
        this._connection.send(JSON.stringify(this._queue[i]));
    }
    this._queue = [];
}

/**
 * Send a list of objects over WS
 *
 * @param {object} list list of data to send (each entry will be serialized to JSON and sent individually)
 */
send(list)
{
    // create if needed
    if (null === this._connection)
    {
        this._queueMessages(list);
        this._createConnection();
        return;
    }
    if (!this._connection.isConnected())
    {
        this._queueMessages(list);
        return;
    }
    for (var i = 0; i < list.length; ++i)
    {
        if (debug.enabled)
        {
            debug(`Sending message : ${JSON.stringify(list[i])}`);
        }
        this._connection.send(JSON.stringify(list[i]));
    }
}

/**
 * Reconnect WS (might be necessary in case this is the only way to unsubscribe)
 *
 * @param {boolean} immediate whether or not we want to reconnect immediately (otherwise, we will wait for options.retryDelay as provided in constructor) (optional, default = false)
 */
reconnect(immediate)
{
    if (null === this._connection)
    {
        return;
    }
    let connection = this._connection;
    connection.disconnect();
    // reconnect immediately
    if (true === immediate)
    {
        this._createConnection();
    }
    else
    {
        if (debug.enabled)
        {
            debug("Client (%s|%s) will reconnect in %dms", this._exchangeId, this._uri, this._retryDelay);
        }
        logger.info("Client (%s|%s) will reconnect in %dms", this._exchangeId, this._uri, this._retryDelay);
        this._createConnection(this._retryDelay);
    }
}

/**
 * Creates a new connection
 *
 * @param {integer} delay delay in ms before connecting (optional, default = no delay)
 */
_createConnection(delay)
{
    let self = this;
    let counter = ++this._connectionCounter;
    let connection = new WebSocketConnection(this._uri, this._connectionOptions);

    /*
     WS connection has been disconnected by exchange
     */
    connection.on('disconnected', function(data){
        if (debug.enabled)
        {
            debug("Connection (%s|%d|%s) disconnected (will try to reconnect in %dms) : code = %d, reason = '%s'", self._exchangeId, counter, self._uri, self._retryDelay, data.code, data.reason);
        }
        logger.warn("Connection (%s|%d|%s) disconnected (will try to reconnect in %dms) : code = %d, reason = '%s'", self._exchangeId, counter, self._uri, self._retryDelay, data.code, data.reason);
        self.emit('disconnected', {connectionId:counter,code:data.code,reason:data.reason});
        self._createConnection.call(self, self._retryDelay);
    });

    connection.on('connectionError', function(err){
        // retry is possible
        if (err.retry)
        {
            if (debug.enabled)
            {
                debug("Connection (%s|%d|%s) failed (will try to reconnect in %dms) : attempts = %d, error = '%s'", self._exchangeId, counter, self._uri, self._retryDelay, err.attempts, JSON.stringify(err.error));
            }
            logger.warn("Connection (%s|%d|%s) failed (will try to reconnect in %dms) : attempts = %d, error = '%s'", self._exchangeId, counter, self._uri, self._retryDelay, err.attempts, JSON.stringify(err.error));
            self.emit('connectionError', {connectionId:counter,attempts:err.attempts,error:err.error});
            return;
        }
        // no more retry
        if (debug.enabled)
        {
            debug("Connection (%s|%d|%s) failed (no more retry left) : attempts = %d, error = '%s'", self._exchangeId, counter, self._uri, err.attempts, JSON.stringify(err.error));
        }
        logger.error("Connection (%s|%d|%s) failed (no more retry left) : attempts = %d, error = '%s'", self._exchangeId, counter, self._uri, err.attempts, JSON.stringify(err.error));
        self.emit('terminated', {connectionId:counter,attempts:err.attempts,error:err.error});
    });

    connection.on('connected', function(){
        if (debug.enabled)
        {
            debug("Connection (%s|%d|%s) connected", self._exchangeId, counter, self._uri);
        }
        logger.info("Connection (%s|%d|%s) connected", self._exchangeId, counter, self._uri);
        self._connectedTimestamp = new Date().getTime();
        self._processQueue.call(self);
        self.emit('connected', {connectionId:counter});
    });

    connection.on('message', function(message){
        self._processMessage.call(self, message);
    });

    this._connection = connection;
    try
    {
        // connect immediately
        if (undefined === delay)
        {
            connection.connect();
        }
        else
        {
            setTimeout(function(){
                // disconnection probably requested by client
                if (null === self._connection)
                {
                    return;
                }
                connection.connect();
            }, delay);
        }
    }
    catch (e)
    {
        throw e;
    }
}

/*
 * Can be called to disconnect. Client won't reconnect automatically unless method 'send' is called again
 */
disconnect()
{
    if (null === this._connection)
    {
        return;
    }
    if (debug.enabled)
    {
        debug("Connection (%s|%d|%s) will be disconnected", this._exchangeId, this._connectionCounter, this._uri);
    }
    logger.info("Connection (%s|%d|%s) will be disconnected", this._exchangeId, this._connectionCounter, this._uri);
    let connection = this._connection;
    this._connection = null;
    connection.disconnect();
}

/**
 * Should be overridden in children
 * Method should emit an event 'data' containing a JSON data
 */
_processMessage(message)
{
    try
    {
        let data = JSON.parse(message);
        this.emit('data', data);
    }
    // ignore non json messages
    catch (e)
    {
        return;
    }
}

}

module.exports = AbstractExchangeStreamClient;
