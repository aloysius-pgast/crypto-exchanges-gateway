"use strict";
const _ = require('lodash');
const logger = require('winston');
const debug = require('debug')('CEG:TickerMonitor:Entry');
const tickerCache = require('../ticker-cache');
const serviceRegistry = require('../service-registry');
const storage = require('../storage');
const internalConfig = require('../internal-config');

//-- condition status
// no check has been performed yet
const STATUS_UNKNOWN = 'unknown';
// if any = false : all conditions are active
// if any = true : at least one condition is active
const STATUS_ACTIVE = 'active';
// if any = false : at least one condition is inactive
// if any = true : all conditions are active
const STATUS_INACTIVE = 'inactive';
// at least one condition is invalid (ie: exchange/service not supported anymore)
const STATUS_INVALID = 'invalid';

//-- expiry in seconds when retrieving values from tickerCache
// expiry for exchanges ticker (5 min)
const EXPIRY_EXCHANGE_TICKER = 300;
// expiry for marketCap ticker (1 hour)
const EXPIRY_MARKET_CAP_TICKER = 3600;

class Entry
{

static get DEFAULT_PUSH_OVER_PRIORITY() { return  'normal' };

// how many seconds should we wait between 2 notifications
static get DEFAULT_PUSH_OVER_MIN_DELAY() { return  300 };

constructor()
{
    this._id = 0;
    this._subscribeId = tickerCache.getNewSubscribeId();
    this._name = '';
    this._enabled = false;
    this._any = false;
    /*
    An entry should be considered as new in following cases :
    - entry is a new one
    - entry has been re-enabled
    - 'any' property has changed
    - conditions have changed
    */
    this._isNew = false;
    this._status = {
        value:STATUS_UNKNOWN,
        timestamp:0
    }
    this._pushover = {
        enabled:false,
        priority:Entry.DEFAULT_PUSH_OVER_PRIORITY,
        minDelay:Entry.DEFAULT_PUSH_OVER_MIN_DELAY,
        // timestamp of last notification
        lastTimestamp:0,
        queue:[]
    };
    // timestamp of next notification
    this._pushover.nextTimestamp = this._pushover.lastTimestamp + this._pushover.minDelay;
    this._conditions = [];

    // whether or not object should be stored
    this._shouldStore = true;

    // whether or not we have subscribed
    this._subscribed = false;
}

/**
 * Whether or not entry is new
 * @return {boolean} true if entry is new
 */
isNew()
{
    return this._isNew;
}

/**
 * Whether or not entry should be mark as new.
 * No 'tickerMonitor' event will be notified when status changes from 'unknown' => ('active'|'inactive') (except if entry is marked as new)
 * @param {boolean} flag new state
 */
setNew(flag)
{
    this._isNew = flag;
}

/**
 * Retrieve entry id
 * @return {integer}
 */
getId()
{
    return this._id;
}

/**
 * Updates entry id
 * @param {integer} id new id (used internally when restoring entry from storage)
 */
setId(id)
{
    this._id = id;
    return this;
}

getStatus()
{
    return this._status.value;
}

/**
 * Store alert in database
 *
 * @param {boolean} force store object even if there is no change
 * @return {Promise}
 */
store(force)
{
    if (undefined === force)
    {
        force = false;
    }
    if (!force && !this._shouldStore)
    {
        return Promise.resolve(this._id);
    }
    let hash = this._toStorageHash();
    return new Promise((resolve,reject) => {
        let self = this;
        storage.storeTickerMonitorEntry(this._id, this._name, this._enabled, hash).then(function(id){
            self._id = id;
            self._shouldStore = false;
            return resolve(id);
        }).catch(function(){
            reject(false);
        });
    });
}

/**
 * Updates name
 * @param {string} name new name
 * @return {self}
 */
setName(name)
{
    if (name == this._name)
    {
        return this;
    }
    this._shouldStore = true;
    this._name = name;
    return this;
}

/**
 * Retrieves entry name
 * @return {string}
 */
getName()
{
    return this._name;
}

/**
 * Whether or not entry should be considered as active once one of the condition becomes active
 * @param {boolean} should be true if one active condition is enough to mark entry as active
 * @return {self}
 */
setAny(flag)
{
    if (flag == this._any)
    {
        return this;
    }
    this._shouldStore = true;
    this._any = flag;
    // entry should now be considered as new
    this._isNew = true;
    // empty queue
    this._pushover.queue = [];
    return this;
}

/**
 * Updates pushover config
 *
 * @param {boolean} flag whether or not pushover should be enabled
 * @param {string} priority pushover priority
 * @param {integer} minimum delay in seconds between alerts (to avoid spam)
 * @return {self}
 */
setPushOver(flag, priority, minDelay)
{
    if (undefined === priority)
    {
        priority = Entry.DEFAULT_PUSH_OVER_PRIORITY;
    }
    if (undefined === minDelay)
    {
        minDelay = Entry.DEFAULT_PUSH_OVER_MIN_DELAY;
    }
    if (flag == this._pushover.enabled)
    {
        if (flag)
        {
            if (undefined !== priority && priority == this._pushover.priority &&
                undefined !== minDelay && minDelay == this._pushover.minDelay)
            {
                return this;
            }
        }
    }
    this._shouldStore = true;
    if (flag)
    {
        this._pushover.enabled = true;
        this._pushover.priority = priority;
        this._pushover.minDelay = minDelay;
    }
    else
    {
        this._pushover.enabled = false;
    }
    return this;
}

/**
 * Serialize current object to an hash
 *
 * @param {boolean} forEvent whether or not we want to serialize entry to emit an event
 * @return {object}
 */
toHash(forEvent)
{
    let hash = {
        id:this._id,
        name:this._name,
        any:this._any,
        status:{
            value:this._status.value,
            timestamp:this._status.timestamp
        },
        conditions:[]
    }
    // add more attributes
    if (!forEvent)
    {
        hash.enabled = this._enabled;
        hash.pushover = {
            enabled:this._pushover.enabled
        };
        if (hash.pushover.enabled)
        {
            hash.pushover.priority = this._pushover.priority;
            hash.pushover.minDelay = this._pushover.minDelay;
        }
    }
    _.forEach(this._conditions, (c) => {
        hash.conditions.push(this._serializeCondition(c));
    });
    return hash;
}

/**
 * Whether or not entry is enabled
 * @return {boolean}
 */
isEnabled()
{
    return this._enabled;
}

/**
 * Indicates how many conditions current entry has
 * @return {integer}
 */
size()
{
    return this._conditions.length;
}

/**
 * Replaces conditions
 * @param {object[]} conditions new conditions
 * @return {self}
 */
setConditions(conditions)
{
    // check if conditions have changed
    let noChange = false;
    if (conditions.length == this._conditions.length)
    {
        noChange = true;
        _.forEach(conditions, (c,index) => {
            if (!_.isEqual(c.origin, this._conditions[index].origin) ||
                !_.isEqual(c.condition, this._conditions[index].condition)
            )
            {
                noChange = false;
                return false;
            }
        });
    }
    if (noChange)
    {
        return this;
    }
    this._unsubscribe();
    let timestamp = new Date().getTime() / 1000.0;
    this._conditions = [];
    this._shouldStore = true;
    this._status.value = STATUS_UNKNOWN;
    this._status.timestamp = timestamp;
    _.forEach(conditions, (c) => {
        let obj = this._initializeCondition(c, timestamp);
        this._conditions.push(obj);
    });
    this._subscribe();
    // entry should now be considered as new
    this._isNew = true;
    // empty pushover queue
    this._pushover.queue = [];
    return this;
}

/**
 * Enables / disables entry
 * When an entry is disabled, it's status will always be 'unknown'
 *
 * @param {boolean} flag true to enable entry
 */
enable(flag)
{
    if (flag == this._enabled)
    {
        return this;
    }
    this._shouldStore = true;
    this._resetStatus();
    if (flag)
    {
        this._subscribe(true);
    }
    else
    {
        this._unsubscribe();
    }
    this._enabled = flag;
    if (this._enabled)
    {
        // entry should now be considered as new
        this._isNew = true;
        // empty queue
        this._pushover.queue = [];
    }
    return this;
}


/**
 * Indicates whether or not conditions are matched
 *
 * @param {float} timestamp (optional)
 * @return {boolean} true if conditions are matched, false otherwise
 */
check(timestamp)
{
    if (!this._enabled)
    {
        return false;
    }
    if (undefined === timestamp)
    {
        timestamp = new Date().getTime() / 1000.0;
    }
    let foundOneActiveCondition = false;
    let foundOneInactiveCondition = false;
    let foundOneUnknownCondition = false;
    let status = STATUS_UNKNOWN;
    _.forEach(this._conditions, (c) => {
        if (c.invalid)
        {
            status = STATUS_INVALID;
            return;
        }
        let result = c.checker(timestamp);
        if (null === result)
        {
            c.status.value = STATUS_UNKNOWN;
            foundOneUnknownCondition = true;
            return;
        }
        if (result)
        {
            c.status.value = STATUS_ACTIVE;
            foundOneActiveCondition = true;
            return;
        }
        else
        {
            c.status.value = STATUS_INACTIVE;
            foundOneInactiveCondition = true;
            return;
        }
    });
    if (STATUS_INVALID == status)
    {
        // status changed to invalid
        if (status != this._status.value)
        {
            this._status.value = status;
            this._status.timestamp = timestamp;
        }
        return false;
    }
    // one condition is enough
    if (this._any)
    {
        if (foundOneActiveCondition)
        {
            status = STATUS_ACTIVE;
        }
        else if (!foundOneUnknownCondition)
        {
            status = STATUS_INACTIVE;
        }
    }
    else
    {
        // all conditions are active
        if (!foundOneInactiveCondition && !foundOneUnknownCondition)
        {
            status = STATUS_ACTIVE;
        }
        else if (!foundOneUnknownCondition)
        {
            status = STATUS_INACTIVE;
        }
    }
    if (status != this._status.value)
    {
        this._status.value = status;
        this._status.timestamp = timestamp;
    }
    if (debug.enabled)
    {
        debug(`Status for entry '${this._name}' (${this._id}) is '${this._status.value}'`);
    }
    return status == STATUS_ACTIVE;
}

/**
 * Destroy entry (removes it from storage)
 */
destroy()
{
    this._unsubscribe();
    storage.removeTickerMonitorEntry(this._id);
}

/**
 * Whether or not entry has pending pushover alerts (which were not sent to avoid spam)
 *
 * @param {integer|float} now (current timestamp)
 *
 * @return {boolean}
 */
hasPendingPushOverAlerts(now) {
    if (0 == this._pushover.queue.length) {
        return false;
    }
    if (now < this._pushover.nextTimestamp) {
        return false;
    }
    return true;
}

/**
 * Send push over alert
 *
 * @param {object} pushOverInstance pushOver object
 * @return {self}
 */
sendPushOverAlert(pushOverInstance)
{
    if (!this._enabled || null === pushOverInstance || !this._pushover.enabled)
    {
        return this;
    }
    if (STATUS_ACTIVE != this._status.value)
    {
        if (0 == this._pushover.queue.length)
        {
            return this;
        }
    }
    let timestamp = Date.now() / 1000.0;
    // we're not allowed to send notification yet, keep info in queue
    let obj = {timestamp:timestamp};
    if (timestamp < this._pushover.nextTimestamp) {
        this._pushover.queue.push(obj);
        return this;
    }
    let list = this._pushover.queue;
    list.push(obj);
    this._pushover.queue = [];
    this._sendPushOverAlert(pushOverInstance, list);
    return this;
}

_sendPushOverAlert(pushOverInstance, list)
{
    let opt = {priority:this._pushover.priority,format:'html'};
    opt.title = `Alert ${this._name} became active`;
    // build message content
    opt.message = `Alert <b>${this._name}</b> became active on :<br/><br/>`;
    // display newest first
    _.forEachRight(list, (e) => {
        opt.message += `- ${this._formatDateTime(e.timestamp * 1000)}<br/>`;
    });
    let uiEndpoint = internalConfig.get('uiEndpoint');
    // only add supplementary url if we know the uiEndpoint
    if (null !== uiEndpoint)
    {
        opt.url = `${uiEndpoint}/#services/myAlerts/${this._id}`;
        opt.urlTitle = 'See alert';
    }
    // send notification
    let self = this;
    pushOverInstance.notify(opt).then(function(){
        // update timestamp of last sent notification
        self._pushover.lastTimestamp = Date.now() / 1000.0;
        self._pushover.nextTimestamp = self._pushover.lastTimestamp + self._pushover.minDelay;
        if (debug.enabled)
        {
            debug(`Successfully sent PushOver notification for tickerMonitor entry '${self._name}'`);
        }
    }).catch(function(err){
        logger.error(`Could not send PushOver notification for tickerMonitor entry '${self._name}' : ${err}`);
    });
}

_formatDateTime(timestamp)
{
    let d = new Date(timestamp);
    return `${this._formatDate(d)} ${this._formatTime(d)}`;
}

_formatDate(date)
{
    let d = date.getDate();
    if (d < 10)
    {
        d = '0' + d;
    }
    let m = date.getMonth() + 1;
    if (m < 10)
    {
        m = '0' + m;
    }
    return `${date.getFullYear()}-${m}-${d}`
}

_formatTime(date)
{
    let h = date.getHours();
    if (h < 10)
    {
        h = '0' + h;
    }
    let m = date.getMinutes();
    if (m < 10)
    {
        m = '0' + m;
    }
    let s = date.getSeconds();
    if (s < 10)
    {
        s = '0' + s;
    }
    return `${h}:${m}:${s}`;
}

/**
 * Disable storage (ie: used only after restoring an entry)
 */
_disableStorage()
{
    this._shouldStore = false;
}

/**
 * Sets entry status & conditions status to 'unknown' (do nothing if condition is invalid)
 */
_resetStatus()
{
    // do nothing if entry is invalid
    if (STATUS_INVALID == this._status.value)
    {
        return;
    }
    let timestamp = new Date().getTime() / 1000.0;
    this._status.value = STATUS_UNKNOWN;
    this._status.timestamp = timestamp;
    _.forEach(this._conditions, (c) => {
        // do nothing if condition is invalid
        if (c.invalid)
        {
            c.status.value = STATUS_INVALID;
            return;
        }
        c.value = null;
        c.status.value = STATUS_UNKNOWN;
        c.status.timestamp = timestamp;
    });
}

/**
 * Serializes on condition
 * @return {object}
 */
_serializeCondition(c)
{
    let obj = {
        status:c.status,
        origin:c.origin,
        value:c.value,
        condition:c.condition
    }
    return obj;
}

/**
 * Serializes one condition for storage purpose (ie: with less properties)
 *
 * @return {object}
 */
_serializeConditionForStorage(c)
{
    let obj = {
        origin:c.origin,
        condition:c.condition
    }
    return obj;
}

/**
 * Serialize current object to an hash for storage purpose (ie: with less properties)
 *
 * @return {object}
 */
_toStorageHash()
{
    let hash = {
        enabled:this._enabled,
        any:this._any,
        pushover:{
            enabled:this._pushover.enabled
        },
        conditions:[]
    }
    if (this._pushover.enabled)
    {
        hash.pushover.priority = this._pushover.priority;
        hash.pushover.minDelay = this._pushover.minDelay;
    }
    _.forEach(this._conditions, (c) => {
        hash.conditions.push(this._serializeConditionForStorage(c));
    });
    return hash;
}

_initializeCondition(c, timestamp)
{
    let obj = {
        invalid:false,
        status:{
            value:STATUS_UNKNOWN,
            timestamp:timestamp
        },
        value:null,
        origin:_.cloneDeep(c.origin),
        condition:_.cloneDeep(c.condition)
    }
    // create checker function
    switch (obj.origin.type)
    {
        case 'exchange':
            obj.checker = this._getExchangeChecker(obj);
            break;
        case 'service':
            obj.checker = this._getServiceChecker(obj);
            break;
        // this should not happen
        default:
            obj.invalid = true;
            logger.error(`Unknown 'type' of condition origin : type = '${c.origin.type}'`);
            obj.checker = this._getDummyChecker(false);
    }
    return obj;
}

/**
 * Creates a function to check a particular exchange condition
 * @param {object} c condition object
 * @return {function}
 */
_getExchangeChecker(c)
{
    let exchange = serviceRegistry.getExchange(c.origin.id);
    if (null === exchange || undefined === exchange.features['wsTickers'] || !exchange.features['wsTickers'].enabled)
    {
        c.invalid = true;
        logger.warn(`TickerMonitor entry '${this._id}' has a condition for exchange '${c.origin.id}' but exchange is not supported anymore`);
        return this._getDummyChecker(false);
    }
    let f = this._getFunction(c.condition.operator);
    return function(now){
        c.value = tickerCache.getExchangeTickerField(c.origin.id, c.condition.pair, c.condition.field, now - EXPIRY_EXCHANGE_TICKER);
        return f(c.value, c.condition.value);
    }
}

/**
 * Creates a function to check a particular service condition
 * @param {object} c condition object
 * @return {function}
 */
_getServiceChecker(c)
{
    switch (c.origin.id)
    {
        case 'marketCap':
            return this._getMarketCapChecker(c);
            break;
        // this should not happen
        default:
            c.invalid = true;
            logger.error(`Unknown value for 'condition[origin][id]' (service) : value = '${c.origin.id}'`);
            return this._getDummyChecker(false);
    }
}

/**
 * Creates a function to check a a marketCap condition
 * @param {object} c condition object
 * @return {function}
 */
_getMarketCapChecker(c)
{
    let service = serviceRegistry.getService(c.origin.id);
    if (null === service)
    {
        c.invalid = true;
        logger.warn(`TickerMonitor entry '${this._id}' has a condition for service '${c.origin.id}' but service is not supported anymore`);
        return this._getDummyChecker(false);
    }
    let f = this._getFunction(c.condition.operator);
    return function(now){
        c.value = tickerCache.getMarketCapTickerField(c.condition.symbol, c.condition.field, now - EXPIRY_MARKET_CAP_TICKER);
        return f(c.value, c.condition.value);
    }
}

/**
 * Returns a function based on a given operator
 *
 * @param {string} operator see supportedOperators in ConditionsParser
 * @return {function}
 */
_getFunction(operator)
{
    switch (operator)
    {
        case 'eq':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue == value }
        case 'neq':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue != value }
        case 'lt':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue < value }
        case 'lte':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue <= value }
        case 'gt':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue > value }
        case 'gte':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue >= value }
        case 'in':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue >= value[0] && cachedValue <= value[1] }
        case 'out':
            return function (cachedValue, value) { return null === cachedValue ? null : cachedValue < value[0] || cachedValue > value[1] }
        // this should not happen
        default:
            logger.error(`Unknown value for 'condition[condition][operator]' : value = '${operator}'`);
            return this._getDummyChecker(false);
    }
}

/**
 * Dummy checker function which always returns true or false
 *
 * @param {boolean} flag boolean value to always return
 * @return {function} function which always evaluates to true|false
 */
_getDummyChecker(flag)
{
    return function(){
        return flag;
    };
}

/**
 * Subscribe to tickerCache
 *
 * @param {boolean} force subscribe even if entry is disabled
 * @return {boolean}
 */
_subscribe(force)
{
    if (this._subscribed)
    {
        return true;
    }
    // don't subscribe if alert is disabled
    if (!this._enabled && !force)
    {
        return true;
    }
    // add subscriptions
    _.forEach(this._conditions, (c) => {
        switch (c.origin.type)
        {
            case 'exchange':
                this._subscribeForExchange(c);
                break;
            case 'service':
                this._subscribeForService(c);
                break;
            // should not happen
            default:
                logger.error(`Unknown value for 'condition[origin][type]' : value = '${c.origin.type}'`);
                return false;
        }
    });
    this._subscribed = true;
    return true;
}

/**
 * Subscribe to tickerCache for a given exchange condition
 */
_subscribeForExchange(c)
{
    if (c.invalid) {
        return false;
    }
    return tickerCache.subscribeToExchangeTicker(this._subscribeId, c.origin.id, c.condition.pair);
}

/**
 * Subscribe to tickerCache for a given service condition
 */
_subscribeForService(c)
{
    switch (c.origin.id)
    {
        case 'marketCap':
            if (c.invalid) {
                return false;
            }
            return tickerCache.subscribeToMarketCapTicker(this._subscribeId, c.condition.symbol);
        // this should not happen
        default:
            logger.error(`Unknown value for 'condition[origin][id]' (service) : value = '${c.origin.id}'`);
            return false;
    }
}

/**
 * Unsubscribe from tickerCache
 */
_unsubscribe()
{
    if (!this._subscribed)
    {
        return;
    }
    // remove subscriptions
    _.forEach(this._conditions, (c) => {
        switch (c.origin.type)
        {
            case 'exchange':
                this._unsubscribeForExchange(c);
                break;
            case 'service':
                this._unsubscribeForService(c);
                break;
            // should not happen
            default:
                logger.error(`Unknown value for 'condition[origin][type]' : value = '${c.origin.type}'`);
                return false;
        }
    });
    this._subscribed = false;
    return true;
}

/**
 * Unsubscribe from tickerCache for a given exchange condition
 */
_unsubscribeForExchange(c)
{
    return tickerCache.unsubscribeFromExchangeTicker(this._subscribeId, c.origin.id, c.condition.pair);
}

/**
 * Unsubscribe from tickerCache for a given service condition
 */
_unsubscribeForService(c)
{
    switch (c.origin.id)
    {
        case 'marketCap':
            return tickerCache.unsubscribeFromMarketCapTicker(this._subscribeId, c.condition.symbol);
        // this should not happen
        default:
            logger.error(`Unknown value for 'condition[origin][id]' (service) : value = '${c.origin.id}'`);
            return false;
    }
}

}

module.exports = Entry;
