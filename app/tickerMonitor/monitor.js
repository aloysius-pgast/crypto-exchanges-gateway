"use strict";
const _ = require('lodash');
const logger = require('winston');
const debug = require('debug')('CEG:TickerMonitor');
const EventEmitter = require('events');
const serviceRegistry = require('../service-registry');
const Errors = require('../errors');
const Entry = require('./entry');

const DEFAULT_DELAY = 30 * 1000;

const STATUS_UNKNOWN = 'unknown';
const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';
const STATUS_INVALID = 'invalid';

/**
 * Used to monitor prices and send alerts. Check conditions every 30s
 */
class Monitor extends EventEmitter
{

constructor()
{
    super();
    this._entries = {};
    this._delay = DEFAULT_DELAY;
    this._started = false;
    this._pushoverInstance = null;
    /*
        Maximum duration of an alert in seconds. It will be automatically removed after expiry
        If {0}, max duration will be ignored
     */
    this._maxDuration = 0;
}

initializePushOverInstance()
{
    let pushover = serviceRegistry.getService('pushover');
    if (null !== pushover)
    {
        this._pushoverInstance = pushover.instance;
    }
}

setDelay(delay)
{
    this._delay = delay * 1000;
}

setMaxDuration(delay)
{
    this._maxDuration = delay * 1000;
}

/**
 * Retuns an entry from its id
 *
 * @return {object}
 */
getEntry(id)
{
    if (undefined === this._entries[id])
    {
        return null;
    }
    return this._entries[id];
}

/**
 * Serializes entries
 *
 * @param {integer} opt.id id of the entry (optional)
 * @param {string} opt.name name of the entry (optional)
 * @param {boolean} opt.forEvent whether or not we want to serialize entries to emit events
 * @return {object[]}
 */
toArray(opt)
{
    if (undefined == opt)
    {
        opt = {};
    }
    let list = [];
    if (undefined !== opt.id)
    {
        if (undefined !== this._entries[opt.id])
        {
            list.push(this._entries[opt.id].toHash(true === opt.forEvent));
        }
    }
    else
    {
        _.forEach(this._entries, (entry) => {
            if (undefined !== opt.name)
            {
                // name does not match
                if (-1 == entry.getName().indexOf(opt.name))
                {
                    return;
                }
            }
            list.push(entry.toHash(true === opt.forEvent));
        });
    }
    return list;
}

/**
 * Checks whether or not a given entry exists
 */
hasEntry(id)
{
    return undefined !== this._entries[id];
}

/**
 * Deletes an existing entry
 */
deleteEntry(id)
{
    let entry = this._entries[id];
    delete this._entries[id];
    entry.destroy();
}

/**
 * Creates a new entry
 *
 * @return {Promise}
 */
createEntry(opt)
{
    return new Promise((resolve,reject) => {
        let entry;
        try
        {
            entry = new Entry();
            entry.setName(opt.name).setAny(opt.any).setPushOver(opt.pushover.enabled, opt.pushover.priority, opt.pushover.minDelay);
            entry.setConditions(opt.conditions);
            // should be called at the end
            entry.enable(opt.enabled);
            if (opt.enabled)
            {
                // entry should now be considered as new
                entry.setNew(true);
            }
            // set expiry
            if (0 != this._maxDuration) {
                const ts = Date.now() + this._maxDuration;
                entry.setExpiryTimestamp(parseInt(ts / 1000.0));
            }
        }
        catch (e)
        {
            Errors.logError(e, 'tickerMonitor');
            return reject(false);
        }
        // store entry
        let self = this;
        entry.store(true).then(function(id){
            self._entries[id] = entry;
            return resolve(id);
        }).catch (function(e){
            try
            {
                entry.enable(false);
            }
            catch (e)
            {
                Errors.logError(e, 'tickerMonitor');
            }
            return reject(false);
        });
    });
}

/**
 * Updates an existing entry
 */
updateEntry(id, opt)
{
    return new Promise((resolve,reject) => {
        let entry;
        try
        {
            entry = this._entries[id];
            if (undefined !== opt.name)
            {
                entry.setName(opt.name);
            }
            if (undefined !== opt.any)
            {
                entry.setAny(opt.any);
            }
            if (undefined !== opt.pushover)
            {
                entry.setPushOver(opt.pushover.enabled, opt.pushover.priority, opt.pushover.minDelay);
            }
            if (undefined !== opt.enabled)
            {
                entry.enable(opt.enabled);
            }
            if (undefined !== opt.conditions)
            {
                entry.setConditions(opt.conditions);
            }
        }
        catch (e)
        {
            Errors.logError(e, 'tickerMonitor');
            return reject(false);
        }
        // store entry
        let self = this;
        entry.store().then(function(){
            return resolve(true);
        }).catch (function(e){
            return reject(false);
        });
    });
}

/**
 * Restore an entry from storage
 */
restoreEntry(id, name, enabled, obj)
{
    let entry;
    try
    {
        entry = new Entry();
        if (null === this._pushoverInstance)
        {
            obj.pushover.enabled = false;
        }
        entry.setId(id);
        entry.setName(name).setAny(obj.any).setPushOver(obj.pushover.enabled, obj.pushover.priority, obj.pushover.minDelay);
        entry.setConditions(obj.conditions);
        // should be called at the end
        entry.enable(enabled);
        // we don't want to consider this entry as new
        entry.setNew(false);
        // set expiry
        if (0 != this._maxDuration) {
            const ts = Date.now() + this._maxDuration;
            entry.setExpiryTimestamp(parseInt(ts / 1000.0));
        }
        // after restoring an entry, no need to store it unless it changes
        entry._disableStorage();
        this._entries[id] = entry;
    }
    catch (e)
    {
        Errors.logError(e, 'tickerMonitor');
    }
}

start()
{
    if (this._started)
    {
        return;
    }
    const check = () => {
        if (debug.enabled)
        {
            debug(`Checking ${Object.keys(this._entries).length} entries`);
        }
        let updatedEntries = [];
        let expiredEntries = [];
        let pushoverEntries = {};
        const now = parseInt(Date.now() / 1000.0);
        _.forEach(this._entries, (entry, id) => {
            // check if entry is expired
            if (0 != this._maxDuration) {
                if (entry.isExpired(now)) {
                    expiredEntries.push(id);
                }
            }
            let previousStatus = entry.getStatus();
            entry.check();
            let newStatus = entry.getStatus();
            // no change
            if (previousStatus == newStatus)
            {
                if (entry.hasPendingPushOverAlerts(now)) {
                    pushoverEntries[id] = entry;
                }
                return;
            }
            if (STATUS_INVALID == newStatus || STATUS_UNKNOWN == newStatus)
            {
                return;
            }
            if (STATUS_INVALID == previousStatus)
            {
                return;
            }
            if (STATUS_UNKNOWN == previousStatus)
            {
                // if entry is marked as new, consider it has been updated and disable flag after
                if (entry.isNew())
                {
                    entry.setNew(false);
                    updatedEntries.push(entry);
                }
                else if (entry.hasPendingPushOverAlerts(now))
                {
                    pushoverEntries[id] = entry;
                }
                return;
            }
            updatedEntries.push(entry);
        });
        if (debug.enabled)
        {
            debug(`Found ${updatedEntries.length}/${Object.keys(this._entries).length} updated entries`);
        }
        if (0 != updatedEntries.length)
        {
            _.forEach(updatedEntries, (entry) => {
                let evt = entry.toHash();
                this.emit('tickerMonitor', evt);
            });
        }
        _.forEach(updatedEntries, (entry) => {
            pushoverEntries[entry.getId()] = entry;
        });
        // only if pushover is enabled in config
        if (null !== this._pushoverInstance)
        {
            _.forEach(pushoverEntries, (entry) => {
                entry.sendPushOverAlert(this._pushoverInstance);
            });
        }
        // remove expired entries
        if (0 != expiredEntries.length) {
            if (debug.enabled) {
                debug(`Found ${expiredEntries.length}/${Object.keys(this._entries).length} expired entries`);
            }
            _.forEach(expiredEntries, (id) => {
                this.deleteEntry(id);
            });
        }
        // schedule new check
        setTimeout(function(){
            check();
        }, this._delay);
    }
    check();
}

}

let instance = new Monitor();
module.exports = instance;
