"use strict";
const WebSocket = require('ws');
const logger = require('winston');

class RpcHelper
{

static parse(ws, msg)
{
    // just ignore empty strings
    if ('' === msg)
    {
        return null;
    }
    // reply to custom ping requests
    if ('_ping_' == msg)
    {
        ws.send('_pong_');
        return null;
    }
    let obj;
    try
    {
        obj = JSON.parse(msg);
    }
    catch (e)
    {
        logger.warn("Invalid JSON message received : %s", msg);
        return null;
    }
    if (undefined === obj.i)
    {
        obj.i = null;
    }
    if (undefined === obj.m || null === obj.m)
    {
        logger.warn("Missing property 'm' in JSON message : %s", msg);
        RpcHelper.replyError(ws, obj, 'invalid_request', "Missing property 'm'");
        return null;
    }
    obj.m = obj.m.toLowerCase();
    if (undefined === obj.p)
    {
        obj.p = {};
    }
    return obj;
}

/**
 * Sends a notification
 *
 * @param {WebSocket} websocket to send notification to
 * @param {string} name notification name
 * @param {object|array} data notification data
 */
static sendNotification(ws, name, data)
{
    if (WebSocket.OPEN != ws.readyState)
    {
        return;
    }
    let msg = {n:name,d:data};
    ws.send(JSON.stringify(msg));
}

/**
 * Sends hello message
 *
 * @param {WebSocket} websocket to send message to
 * @param {string} sid session identifier
 * @param {boolean} isNew whether or not it's a new session
 */
static sendHello(ws, sid, isNew)
{
    if (WebSocket.OPEN != ws.readyState)
    {
        return;
    }
    let msg = {hello:{sid:sid,isNew:isNew}};
    ws.send(JSON.stringify(msg));
};

/**
 * Reply with error
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {string} errorType (invalid_request|invalid_method|invalid_params|internal_error)
 * @param {string} errorMessage error message to send (optional, default = '')
 * @param {object} data custom data to provide (can be used for detailed information) (optional)
 */
static replyError(ws, obj, errorType, errorMessage, data)
{
    // remove message identifier from tracked messages
    if (null !== obj.i && undefined !== ws._messageId && undefined !== ws._messageId[obj.i])
    {
        delete ws._messageId[obj.i];
    }
    if (undefined === errorMessage)
    {
        errorMessage = '';
    }
    let error = {t:errorType,m:errorMessage};
    let msg = {e:error};
    if (undefined !== data)
    {
        msg.d = data;
    }
    if (null === obj.i)
    {
        logger.warn("WS error for '%s' : %s", ws._clientIpaddr, JSON.stringify(msg));
        return;
    }
    msg.i = obj.i;
    if (WebSocket.OPEN != ws.readyState)
    {
        return;
    }
    ws.send(JSON.stringify(msg));
}

/**
 * Reply with error in case of internal error
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {string} errorMessage error message to send (optional, default = '')
 * @param {object} data custom data to provide (can be used for detailed information) (optional)
 */
static replyErrorInternal(ws, obj, errorMessage, data)
{
    RpcHelper.replyError(ws, obj, 'internal_error', errorMessage, data);
}

/**
 * Reply with error in case of invalid request (ie: missing properties in JSON message)
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {string} errorMessage error message to send (optional, default = '')
 * @param {object} data custom data to provide (can be used for detailed information) (optional)
 */
static replyErrorInvalidRequest(ws, obj, errorMessage, data)
{
    RpcHelper.replyError(ws, obj, 'invalid_request', errorMessage, data);
}

/**
 * Reply with error in case of invalid parameters
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {string} errorMessage error message to send (optional, default = '')
 * @param {object} data custom data to provide (can be used for detailed information) (optional)
 */
static replyErrorInvalidParams(ws, obj, errorMessage, data)
{
    RpcHelper.replyError(ws, obj, 'invalid_params', errorMessage, data);
}

/**
 * Reply with error in case of invalid method (ie: if method does not exist or is not supported by exchange)
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {string} errorMessage error message to send (optional, default = '')
 * @param {object} data custom data to provide (can be used for detailed information) (optional)
 */
static replyErrorInvalidMethod(ws, obj, errorMessage, data)
{
    RpcHelper.replyError(ws, obj, 'invalid_method', errorMessage, data);
}

/**
 * Success reply
 *
 * @param {WebSocket} ws websocket to reply to
 * @param {object} obj JSON object received on ws (if obj.i is null, no reply will be sent)
 * @param {object|array|scalar} result custom data to provide (can be used for detailed information) (optional)
 */
static replySuccess(ws, obj, result)
{
    // remove message identifier from tracked messages
    if (null !== obj.i && undefined !== ws._messageId && undefined !== ws._messageId[obj.i])
    {
        delete ws._messageId[obj.i];
    }
    if (WebSocket.OPEN != ws.readyState)
    {
        return;
    }
    if (null === obj.i)
    {
        return;
    }
    if (undefined === result)
    {
        result = true;
    }
    let msg = {i:obj.i,r:result};
    ws.send(JSON.stringify(msg));
}

}

module.exports = RpcHelper;
