class WsClient
{

constructor()
{
    this._connection = null;
    this._connectionId = 0;
    // in case of error, wait 10s before retrying
    this._reconnectionDelay = 10000;
    this._apiKey = null;

    // we support a single subscription
    this._subscription = {
        enabled:false
    }

    // event handlers
    this._onTicker = null;
    this._onOrderBook = null;
    this._onOrderBookUpdate = null;
    this._onTrades = null;
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
            if (self._subscription.enabled)
            {
                self._subscribe.call(self, self._subscription.exchange, self._subscription.entity, self._subscription.pair, false);
            }
            return;
        }
        // ignore if we have no subscription
        if (!self._subscription.enabled)
        {
            return;
        }
        try
        {
            switch (data.n)
            {
                case 'ticker':
                    if (null !== self._onTicker)
                    {
                        self._onTicker(data.d);
                    }
                    break;
                case 'orderBook':
                    if (null !== self._onOrderBook)
                    {
                        self._onOrderBook(data.d);
                    }
                    break;
                case 'orderBookUpdate':
                    if (null !== self._onOrderBookUpdate)
                    {
                        self._onOrderBookUpdate(data.d);
                    }
                    break;
                case 'trades':
                    if (null !== self._onTrades)
                    {
                        self._onTrades(data.d);
                    }
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
 * @param {string} entity (ticker|orderBook|trades)
 * @param {string} pair
 */
subscribe(exchange, entity, pair)
{
    this._subscribe(exchange, entity, pair, true);
}

unsubscribe()
{
    this._subscription.enabled = false;
    let messageList = [{m:"unsubscribe"}]
    this._send(messageList);
}

// resubscribe upon reconnection
_subscribe(exchange, entity, pair, unsubscribe)
{
    let messageList = [];
    // unsubscribe first
    if (unsubscribe)
    {
        if (this._subscription.enabled)
        {
            // this is a distinct subscription => unsubscribe
            if (exchange != this._subscription.exchange || entity != this._subscription.entity || pair != this._subscription.pair)
            {
                messageList.push({m:"unsubscribe"});
            }
        }
    }
    let message = {p:{exchange:exchange,pairs:[pair]}};
    switch (entity)
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
        default:
            console.warn(`Unsupported entity : '${entity}'`);
            return;
    }
    messageList.push(message);
    this._subscription.exchange = exchange;
    this._subscription.entity = entity;
    this._subscription.pair = pair;
    this._subscription.enabled = true;
    this._send(messageList);
}

_send(list)
{
    if (null === this._connection)
    {
        this._createConnection();
        return;
    }
    if (1 != this._connection.readyState)
    {
        return;
    }
    for (var i = 0; i < list.length; ++i)
    {
        this._connection.send(JSON.stringify(list[i]));
    }
}

onTicker(cb)
{
    this._onTicker = cb;
}

onOrderBook(cb)
{
    this._onOrderBook = cb;
}

onOrderBookUpdate(cb)
{
    this._onOrderBookUpdate = cb;
}

onTrades(cb)
{
    this._onTrades = cb;
}

}

export default new WsClient();
