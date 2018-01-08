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
 * @param {string} instance Exchange object
 * @param {array} features dictionary of features {string:{enabled:boolean}} (optional)
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
 * @param {array} features dictionary of features {string:{enabled:boolean}} (optional)
 * @param {boolean} demoMode indicates whether or not demo mode is enabled for this service
 */
registerService(id, name, features, demoMode)
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
    this._services.others[id] = {id:id,name:name,features:featureList,demo:demo}
}

getServices()
{
    return this._services;
}

}

let registry = new ServiceRegistry();

module.exports = registry;
