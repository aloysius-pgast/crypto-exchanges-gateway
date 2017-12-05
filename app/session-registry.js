"use strict";
const _ = require('lodash');
const uuidGenerator = require('uuid/v4');
const logger = require('winston');
const Session = require('./session');
const RpcHelper = require('./rpc-helper');

class SessionRegistry
{

constructor()
{
    this._sessions = {};
}

/**
 * Restores a session from database
 *
 * @param {string} sid session id
 * @param {object} object loaded from database
 */
restoreSession(sid, obj)
{
    let self = this;
    let session = new Session(sid, true, false);
    session.restore(obj);
    session.on('destroyed', function(){
        delete self._sessions[sid];
    });
    this._sessions[sid] =  session;
}

/**
 * Registers an RPC session
 *
 * @param {string} session id (a new session id will be generated if null)
 * @param {WebSocket} websocket object (can be undefined if session is registered through http client)
 * @param {boolean} markAsNew mark session as new if it's a new one (optional, default = true)
 */
registerRpcSession(sid, ws, markAsNew)
{
    if (null === sid)
    {
        for (var i = 0; i < 10; ++i)
        {
            let uuid = `rpc.${uuidGenerator()}`;
            if (undefined === this._sessions[uuid])
            {
                sid = uuid;
                break;
            }
        }
        if (null === sid)
        {
            let msg = 'Could not generate a new non-rpc session';
            logger.error(msg);
            ws.terminate();
            return null;
        }
    }
    let session;
    let isNew = true;
    // this is a new session
    if (undefined === this._sessions[sid])
    {
        // we've been ask to not mark session as new (might be a session created through http or reloaded from storage)
        if (undefined !== markAsNew && !markAsNew)
        {
            isNew = false;
        }
        let self = this;
        session = new Session(sid, true, isNew);
        session.on('destroyed', function(){
            delete self._sessions[sid];
        });
        this._sessions[sid] =  session;
    }
    else
    {
        isNew = false;
        session = this._sessions[sid];
        // ensure session is an rpc session
        if (!session.isRpc())
        {
            let msg = `Session '${sid}' is a non-rpc session. This session id cannot be reused for an rpc session`;
            logger.error(msg);
            if (undefined !== ws)
            {
                ws.terminate();
            }
            return null;
        }
    }
    if (undefined !== ws)
    {
        if (!session.registerSocket(ws))
        {
            if (isNew)
            {
                session.destroy();
            }
            return null;
        }
    }
    return session;
}

/**
 * @param {object} ws WebSocket object
 * @param {string} path route path
 */
registerNonRpcSession(ws, path)
{
    let sid = null;
    for (var i = 0; i < 10; ++i)
    {
        let uuid = uuidGenerator();
        if (undefined === this._sessions[uuid])
        {
            sid = uuid;
            break;
        }
    }
    if (null === sid)
    {
        let msg = 'Could not generate a new non-rpc session';
        logger.error(msg);
        ws.terminate();
        return null;
    }
    let self = this;
    let session = new Session(sid, false);
    session.on('destroyed', function(){
        delete self._sessions[sid];
    });
    this._sessions[sid] = session;
    if (!session.registerSocket(ws, path))
    {
        session.destroy();
        return null;
    }
    return session;
}

/**
 * Retrieves existing sessions
 *
 * @param {boolean} opt.rpc if true, only RPC sessions will be retrieved. If false only non-rpc sessions will be retrieved. If not set all sessions will be retrieved
 */
getSessions(opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    if (undefined === opt.type)
    {
        return this._sessions;
    }
    let list = {};
    _.forEach(this._sessions, (session, sid) => {
        // filter rpc/non rpc
        if (undefined != opt.rpc)
        {
            if (true === opt.rpc && !session.isRpc())
            {
                return;
            }
            if (false === opt.rpc && session.isRpc())
            {
                return;
            }
        }
        list[sid] = session;
    });
    return list;
}

getSession(sid)
{
    if (undefined === this._sessions[sid])
    {
        return null;
    }
    return this._sessions[sid];
}

}

let registry = new SessionRegistry();

module.exports = registry;
