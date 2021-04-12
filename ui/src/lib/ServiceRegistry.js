import restClient from './RestClient';
import _ from 'lodash';

class ServiceRegistry
{

constructor()
{
    this._services = {
        exchanges:{},
        others:{}
    }
}

load()
{
    let self = this;
    return new Promise((resolve, reject) => {
        restClient.getServices().then(function(data){
            self._services = data;
            // disable tickerMonitor for now
            if (undefined !== self._services.others.tickerMonitor)
            {
                // TODO: disable ticker monitor
                //delete self._services.others.tickerMonitor;
            }
            resolve(true);
        }).catch(function(err){
            resolve(false);
        });
    });
}

/**
 * Checks whether or not a given service is running in demo mode
 *
 * @param {string} id service id
 * @return {boolean} true if service running in demo mode
 */
checkServiceDemoMode(id)
{
    if (undefined === this._services.others[id])
    {
        return false;
    }
    return this._services.others[id].demo;
}

/**
 * Checks whether or not a service is available and provide requested features
 *
 * @param {string} id service id
 * @param {array} array of features to check for this service (optional)
 * @param {boolean} any if true, will return true if at least one feature i available, otherwise will return true only if all features are available (optional, default = false)
 * @return {boolean} true if service is available with all requested features, false otherwise
 */
checkServiceFeatures(id, features, any)
{
    if (undefined === this._services.others[id])
    {
        return false;
    }
    // no specific features ?
    if (undefined === features)
    {
        return true;
    }
    let allFeatures = true;
    let oneFeature = false;
    let self = this;
    // ensure we have all requested features
    _.forEach(features, function(f){
        if (undefined === self._services.others[id].features[f] || !self._services.others[id].features[f].enabled)
        {
            allFeatures = false;
        }
        else
        {
            oneFeature = true;
        }
    })
    // all features required
    if (undefined === any || !any)
    {
        return allFeatures;
    }
    return oneFeature;
}

/**
 * Returns a service
 *
 * @param {string} id service id
 * @param {object} return service if it exists, undefined otherwise
 */
getService(id)
{
    return this._services.others[id];
}

/**
 * Get all services
 */
 getServices()
 {
     return this._services.others;
 }

/**
 * Returns the name for a given service
 *
 * @param {string} id service id
 * @return {string} service name or undefined if service does not exist
 */
getServiceName(id)
{
    if (undefined !== this._services.others[id])
    {
        return this._services.others[id].name;
    }
}

/**
 * Checks whether or not a given exchange is running in demo mode
 *
 * @param {string} id exchange id
 * @return {boolean} true if service running in demo mode
 */
checkExchangeDemoMode(id)
{
    if (undefined === this._services.exchanges[id])
    {
        return false;
    }
    return this._services.exchanges[id].demo;
}

/**
 * Returns % fees (0,100) for a given exchange
 *
 * @param {string} id exchange id
 * @return {float} fees
 */
getFees(id)
{
    if (undefined === this._services.exchanges[id])
    {
        return 0.0;
    }
    return this._services.exchanges[id].feesPercent;
}

/**
 * Checks whether or not an exchange is available and provide requested features
 *
 * @param {string} id exchange id
 * @param {array} features array of features to check for this exchange (optional)
 * @param {boolean} any if true, will return true if at least one feature i available, otherwise will return true only if all features are available (optional, default = false)
 * @return {boolean} true if exchange is available with all requested features, false otherwise
 */
checkExchangeFeatures(id, features, any)
{
    if (undefined === this._services.exchanges[id])
    {
        return false;
    }
    // no specific features ?
    if (undefined === features)
    {
        return true;
    }
    let allFeatures = true;
    let oneFeature = false;
    let self = this;
    // ensure we have all requested features
    _.forEach(features, function(f){
        if (undefined === self._services.exchanges[id].features[f] || !self._services.exchanges[id].features[f].enabled)
        {
            allFeatures = false;
        }
        else
        {
            oneFeature = true;
        }
    })
    // all features required
    if (undefined === any || !any)
    {
        return allFeatures;
    }
    return oneFeature;
}

/**
 * Checks whether or not an exchange is available and provide requested features
 *
 * @param {string} id exchange id
 * @param {array} features array of features to check for this exchange (optional)
 * @return {object}
 */
getExchangeFeatures(id, features)
{
    if (undefined === this._services.exchanges[id])
    {
        return {};
    }
    if (undefined === features)
    {
        return this._services.exchanges[id].features;
    }
    let dict = {};
    let self = this;
    _.forEach(features, function(f){
        if (undefined !== self._services.exchanges[id].features[f])
        {
            dict[f] =  self._services.exchanges[id].features[f];
        }
    });
    return dict;
}

/**
 * Returns an exchange
 *
 * @param {string} id exchange id
 * @param {object} return exchange description if it exists, undefined otherwise
 */
getExchange(id)
{
    return this._services.exchanges[id];
}

/**
 * Get all exchanges
 */
getExchanges()
{
    return this._services.exchanges;
}

/**
 * Returns the name for a given exchange
 *
 * @param {string} id exchange id
 * @return {string} exchange name or undefined if service does not exist
 */
getExchangeName(id)
{
    if (undefined !== this._services.exchanges[id])
    {
        return this._services.exchanges[id].name;
    }
    return undefined;
}

}

export default new ServiceRegistry();
