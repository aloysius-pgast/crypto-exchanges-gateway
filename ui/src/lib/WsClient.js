import EventEmitter from 'wolfy87-eventemitter/EventEmitter';

class WsClient extends EventEmitter
{

constructor()
{
    super();
    this._connection = null;
    this._connectionId = 0;
    // in case of error, wait 10s before retrying
    this._reconnectionDelay = 10000;
    this._apiKey = null;

    // we support a single subscription
    this._subscriptions = {
        enabled:false,
        entities:{},
        pair:null,
        exchange:null,
        // klines interval
        interval:null,
        unsubscribe:false
    }
}

initialize(endpoint)
{
    this._wsEndpoint = endpoint;
}

setApiKey(apiKey)
{
    this._apiKey = apiKey;
}

_reconnect()
{
    if (null === this._connection)
    {
        return;
    }
    let connection = this._connection;
    connection._ignoreCloseEvent = true;
    connection.close();
    this._createConnection();
}

connect()
{
    if (null !== this._connection)
    {
        return;
    }
    this._createConnection();
}

_getUri()
{
    let uri = `${this._wsEndpoint}?expires=true&timeout=0`;
    if (null !== this._apiKey)
    {
        uri += `&apiKey=${this._apiKey}`;
    }
    return uri;
}

getStreamUri(sid)
{
    let uri = `${this._wsEndpoint}?sid=${sid}`;
    if (null !== this._apiKey)
    {
        uri += `&apiKey=${this._apiKey}`;
    }
    return uri;
}

getTickerMonitorUri(sid)
{
    let uri = `${this._wsEndpoint}tickerMonitor`;
    if (null !== this._apiKey)
    {
        uri += `&apiKey=${this._apiKey}`;
    }
    return uri;
}

_createConnection()
{
    let self = this;
    let uri = this._getUri();
    ++this._connectionId;
    let connection = new WebSocket(uri);
    connection._ignoreCloseEvent = false;
    connection._receivedHello = false;

    connection.onopen = function(e)
    {
        // nothing to do
    }

    /**
     * When connection could not be established
     */
    connection.onerror = function(e)
    {
        console.error(`Could not open WS connection to '${this.url}' : will try to reconnect in ${self._reconnectionDelay}ms`);
        this._ignoreCloseEvent = true;
        let connectionId = self._connectionId;
        setTimeout(function(){
            // ignore reconnection since another reconnection happended in the meantime
            if (self._connectionId != connectionId)
            {
                return;
            }
            self._reconnect.call(self);
        }, self._reconnectionDelay);
    }

    /**
     * Connection was closed by server
     */
    connection.onclose = function(e)
    {
        if (this._ignoreCloseEvent)
        {
            return;
        }
        // WS was previously connected => reconnect directly
        if (this._receivedHello)
        {
            console.warn(`WS connection '${this.url}' was closed (code = '${e.code}'', reason = '${e.reason}') : will try to reconnect`);
            self._reconnect.call(self);
            return;
        }
        console.error(`WS connection '${this.url}' was closed (code = '${e.code}'', reason = '${e.reason}') : will try to reconnect in ${self._reconnectionDelay}ms`);
        let connectionId = self._connectionId;
        setTimeout(function(){
            // ignore reconnection since another reconnection happended in the meantime
            if (self._connectionId != connectionId)
            {
                return;
            }
            self._reconnect.call(self);
        }, self._reconnectionDelay);
    }

    /**
     * Message received from server (discard 'hello' and handle ping/pong)
     */
    connection.onmessage = function(e){
        // ignore for now
        if ('_pong_' == e.data)
        {
            return;
        }
        var data;
        try
        {
            data = JSON.parse(e.data);
        }
        catch (e)
        {
            console.warn("Got invalid JSON message from '${this.url}'");
            console.warn(e.data);
            return;
        }
        // hello message
        if (undefined !== data.hello)
        {
            console.debug(`Websocket is ready : sid = '${data.hello.sid}'`);
            this._receivedHello = true;
            // resubscribe upon reconnection
            if (self._subscriptions.enabled)
            {
                self._subscribe.call(self);
            }
            return;
        }
        // ignore if we have no subscription
        if (!self._subscriptions.enabled)
        {
            return;
        }
        try
        {
            switch (data.n)
            {
                case 'ticker':
                case 'orderBook':
                case 'orderBookUpdate':
                case 'trades':
                case 'kline':
                    self.emit(data.n, data.d);
                    break;
                default:
                    console.warn(`Unsupported notification : '${data.n}'`);
            }
        }
        catch (e)
        {
            console.error(e);
        }
    };

    self._connection = connection;
}

/**
 * @param {string} exchange exchange identifier
 * @param {string[]} entities (ticker|orderBook|trades)
 * @param {string} pair
 * @param {string} interval (optional, only used for klines)
 */
subscribe(exchange, entity, pair, interval)
{
    switch (entity)
    {
        case 'ticker':
        case 'orderBook':
        case 'trades':
        case 'klines':
            break;
        default:
            console.warn(`Unsupported entity : '${entity}'`);
            return;
    }
    if (!this._subscriptions.enabled)
    {
        this._subscriptions.enabled = true;
        this._subscriptions.entities = {};
    }
    this._subscriptions.exchange = exchange;
    this._subscriptions.pair = pair;
    this._subscriptions.interval = null;
    if ('klines' == entity)
    {
        this._subscriptions.interval = interval;
    }
    if (undefined != this._subscriptions.entities[entity])
    {
        return;
    }
    this._subscriptions.entities[entity] = true;
    this._subscribe(entity);
}

unsubscribe()
{
    if (!this._subscriptions.enabled)
    {
        return;
    }
    this._subscriptions.enabled = false;
    this._subscriptions.entities = {};
    // indicate unsubscribe is needed
    this._subscriptions.unsubscribe = true;
    // remove all listeners
    //console.log('remove listeners');
    this.removeAllListeners();
    let messageList = [{m:"unsubscribe"}]
    if (this._send(messageList))
    {
        // reset unsubscribe if messages were successfully sent
        this._subscriptions.unsubscribe = false;
    }
}

/**
 * Send subscriptions
 *
 * @param {string} entity (used to send subscriptions for a single entity) (optional, if not set all subscriptions will be sent)
 */
_subscribe(entity)
{
    // TODO : avoid duplicates when calling multiple times
    let messageList = [];
    if (this._subscriptions.unsubscribe)
    {
        messageList.push({m:'unsubscribe'});
    }
    _.forEach(Object.keys(this._subscriptions.entities), (e) => {
        if (undefined !== entity && e != entity)
        {
            return;
        }
        let message = {p:{exchange:this._subscriptions.exchange,pairs:[this._subscriptions.pair]}};
        switch (e)
        {
            case 'ticker':
                message.m = 'subscribeToTickers';
                break;
            case 'orderBook':
                message.m = 'subscribeToOrderBooks';
                break;
            case 'trades':
                message.m = 'subscribeToTrades';
                break;
            case 'klines':
                message.m = 'subscribeToKlines';
                message.p.interval = this._subscriptions.interval;
                break;
        }
        messageList.push(message);
    });
    if (this._send(messageList))
    {
        // reset unsubscribe if messages were successfully sent
        if (this._subscriptions.unsubscribe)
        {
            this._subscriptions.unsubscribe = false;
        }
    }
}

_send(list)
{
    if (null === this._connection)
    {
        this._createConnection();
        return false;
    }
    if (1 != this._connection.readyState)
    {
        return false;
    }
    for (var i = 0; i < list.length; ++i)
    {
        this._connection.send(JSON.stringify(list[i]));
    }
    return true;
}

}

export default new WsClient();
