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
 * @param {string} exchange name
 * @param {array} features dictionary of features {string:true} (optional)
 * @param {boolean} demoMode indicates whether or not demo mode is enabled for this exchange
 */
registerExchange(id, name, list, demoMode)
{
    let features = {};
    let demo = false;
    if (undefined !== list)
    {
        _.forEach(list, function(feature){
            features[feature] = true;
        });
    }
    if (undefined !== demoMode)
    {
        if (true === demoMode)
        {
            demo = true;
        }
    }
    this._services.exchanges[id] = {id:id,name:name,features:features,demo:demo}
}

/**
 * Registers a service and indicate supported features
 *
 * @param {string} id service id
 * @param {string} exchange name
 * @param {array} features dictionary of features {string:true} (optional)
 * @param {boolean} demoMode indicates whether or not demo mode is enabled for this service
 */
registerService(id, name, list, demoMode)
{
    let features = {};
    let demo = false;
    if (undefined !== list)
    {
        _.forEach(list, function(feature){
            features[feature] = true;
        });
    }
    if (undefined !== demoMode)
    {
        if (true === demoMode)
        {
            demo = true;
        }
    }
    this._services.others[id] = {id:id,name:name,features:features,demo:demo}
}

getServices()
{
    return this._services;
}

}

let registry = new ServiceRegistry();

module.exports = registry;
