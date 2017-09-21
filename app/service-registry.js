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
 */
registerExchange(id, name, list)
{
    let features = {};
    if (undefined !== list)
    {
        _.forEach(list, function(feature){
            features[feature] = true;
        });
    }
    this._services.exchanges[id] = {id:id,name:name,features:features}
}

/**
 * Registers a service and indicate supported features
 *
 * @param {string} id service id
 * @param {string} exchange name
 * @param {array} features dictionary of features {string:true} (optional)
 */
registerService(id, name, list)
{
    let features = {};
    if (undefined !== list)
    {
        _.forEach(list, function(feature){
            features[feature] = true;
        });
    }
    this._services.others[id] = {id:id,name:name,features:features}
}

getServices()
{
    return this._services;
}

}

let registry = new ServiceRegistry();

module.exports = registry;
