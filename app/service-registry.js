"use strict";
const _ = require('lodash');

class ServiceRegistry
{

constructor()
{
    this._services = {
        exchanges:{},
        others:{}
    };
}

/**
 * Registers an exchange and indicate supported features
 *
 * @param {string} id exchange id
 * @param {string} name exchange name
 * @param {object} instance Exchange object
 * @param {object} features dictionary of features {string:{enabled:boolean}} (optional)
 * @param {boolean} demoMode indicates whether or not demo mode is enabled for this exchange
 */
registerExchange(id, name, instance, features, demoMode, obj)
{
    let featureList = {};
    let demo = false;
    if (undefined !== features)
    {
        _.forEach(features, function(obj, feature){
            featureList[feature] = obj;
        });
    }
    if (undefined !== demoMode)
    {
        if (true === demoMode)
        {
            demo = true;
        }
    }
    this._services.exchanges[id] = {id:id,instance:instance,name:name,features:featureList,demo:demo,dummy:instance.isDummy()}
}

getExchanges(id)
{
    return this._services.exchanges;
}

getExchange(id)
{
    if (undefined === this._services.exchanges[id])
    {
        return null;
    }
    return this._services.exchanges[id];
}

/**
 * Registers a service and indicate supported features
 *
 * @param {string} id service id
 * @param {string} name service name
 * @param {object} instance service object
 * @param {object} features dictionary of features {string:{enabled:boolean}} (optional)
 * @param {boolean} demoMode indicates whether or not demo mode is enabled for this service
 */
registerService(id, name, instance, features, demoMode)
{
    let featureList = {};
    let demo = false;
    if (undefined !== features)
    {
        _.forEach(features, function(obj, feature){
            featureList[feature] = obj;
        });
    }
    if (undefined !== demoMode)
    {
        if (true === demoMode)
        {
            demo = true;
        }
    }
    this._services.others[id] = {id:id,name:name,instance:instance,features:featureList,demo:demo}
}

getServices()
{
    return this._services;
}

getService(id)
{
    if (undefined === this._services.others[id])
    {
        return null;
    }
    return this._services.others[id];
}

}

let registry = new ServiceRegistry();

module.exports = registry;
