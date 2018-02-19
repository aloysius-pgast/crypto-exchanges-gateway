"use strict";
const _ = require('lodash');
const serviceRegistry = require('../service-registry');

/**
 * List of possible ticker fields
 */
const exchangeTickerFields = ['last', 'buy', 'sell', 'high', 'low', 'volume', 'priceChangePercent'];

/**
 * List of possible services
 */
const supportedServices = ['coinmarketcap'];

/**
 * List of possible fields for coinmarketcap
 */
const coinmarketcapTickerFields = ['price_usd', 'price_btc', '24h_volume_usd', 'total_supply', 'available_supply', 'market_cap_usd', 'percent_change_1h', 'percent_change_24h', 'percent_change_7d'];

/**
 * List of supported operators and whether or not they require array parameter
 */
const supportedOperators = {
    'eq':false,
    'neq':false,
    'lt':false,
    'lte':false,
    'gt':false,
    'gte':false,
    // require array
    'in':true,
    'out':true
};

class ConditionsParser
{

constructor(list)
{
    this._initialList = list;
    this._error = '';
    this._finalList = {};
}

/**
 * Checks all conditions
 *
 * @return {Promise} resolve to a new list of conditions
 */
checkConditions()
{
    if ('' !== this._error)
    {
        return Promise.reject(this._error);
    }
    this._conditions = {};
    let arr = [];
    for (let i = 0; i < this._initialList.length; ++i)
    {
        arr.push(this._checkCondition(this._initialList[i], i));
    }
    return new Promise((resolve,reject) => {
        let self = this;
        Promise.all(arr).then(function(data){
            let list = [];
            let count = self._initialList.length;
            for (let i = 0; i < count; ++i)
            {
                if (undefined !== self._finalList[i])
                {
                    list.push(self._finalList[i]);
                }
            }
            resolve(list);
        }).catch (function(err){
            self._error = err;
            reject(err);
        });
    });
}

/**
 * Checks a condition coinmarketcap condition
 *
 * @param {object} c condition object
 * @param {integer} index index of the condition in the array
 * @return {Promise} which resolve to true or reject error
 */
_checkCondition(c, index)
{
    return new Promise((resolve, reject) => {
        let entry = {};
        if (undefined === c.condition)
        {
            return reject(`Missing parameter 'conditions[${index}][condition]'`);
        }
        entry.condition = {};
        if (undefined === c.condition.field)
        {
            return reject(`Missing parameter 'conditions[${index}][condition][field]'`);
        }
        entry.condition.field = c.condition.field;
        if (undefined === c.condition.operator)
        {
            return reject(`Missing parameter 'conditions[${index}][condition][operator]'`);
        }
        entry.condition.operator = c.condition.operator;
        if (undefined === c.condition.value)
        {
            return reject(`Missing parameter 'conditions[${index}][condition][value]'`);
        }
        let requiresArray = supportedOperators[c.condition.operator];
        if (undefined === requiresArray)
        {
            return reject(`Unsupported value for parameter 'conditions[${index}][condition][operator]' : value = '${c.condition.operator}'`);
        }
        if (requiresArray)
        {
            let valid = true;
            if (!Array.isArray(c.condition.value) || 2 != c.condition.value.length)
            {
                return reject(`Parameter 'conditions[${index}][condition][value]' should be a float[2] array : value = '${c.condition.value}'`);
            }
            let value;
            entry.condition.value = [];
            for (var i = 0; i < c.condition.value.length; ++i)
            {
                value = parseFloat(c.condition.value[i]);
                if (isNaN(value))
                {
                    return reject(`Parameter 'conditions[${index}][condition][value][${i}]' is not a valid float : value = '${c.condition.value[i]}'`);
                }
                entry.condition.value.push(value);
            }
        }
        else
        {
            let value = parseFloat(c.condition.value);
            if (isNaN(value))
            {
                return reject(`Parameter 'conditions[${index}][condition][value]' is not a valid float : value = '${c.condition.value}'`);
            }
            entry.condition.value = value;
        }
        if (undefined === c.origin)
        {
            return reject(`Missing parameter 'conditions[${index}][origin]'`);
        }
        entry.origin = {};
        if (undefined === c.origin.id)
        {
            return reject(`Missing parameter 'conditions[${index}][origin][id]'`);
        }
        this._finalList[index] = entry;
        if (undefined === c.origin.type)
        {
            return reject(`Missing parameter 'conditions[${index}][origin][type]'`);
        }
        let p;
        switch (c.origin.type)
        {
            case 'exchange':
                p = this._checkExchangeCondition(c, index);
                break;
            case 'service':
                p = this._checkServiceCondition(c, index);
                break;
            default:
                return reject(`Unsupported value for parameter 'conditions[${index}][origin][type]' : value = '${c.origin.type}'`);
        }
        p.then(function(){
            resolve(true);
        }).catch(function(err){
            reject(err);
        });
    });
}

/**
 * Checks exchange condition
 *
 * @param {object} c condition object
 * @param {integer} index index of the condition in the array
 * @return {Promise} which resolve to true or reject error
 */
_checkExchangeCondition(c, index)
{
    return new Promise((resolve, reject) => {
        let entry = this._finalList[index];
        entry.origin.type = c.origin.type;
        // ensure pair attribute is defined
        if (undefined === c.condition.pair)
        {
            return reject(`Missing parameter 'conditions[${index}][condition][pair]'`);
        }
        // check if field is supported
        if (-1 == exchangeTickerFields.indexOf(c.condition.field))
        {
            return reject(`Invalid value for 'conditions[${index}][condition][field]' : value = '${c.condition.field}`);
        }
        entry.condition.field = c.condition.field;
        // check if exchange exists and wsTickers feature is enabled
        let exchange = serviceRegistry.getExchange(c.origin.id);
        if (null === exchange)
        {
            return reject(`Invalid value for 'conditions[${index}][origin][id]' : '${c.origin.id}' exchange is not supported`);
        }
        let exchangeInstance = exchange.instance;
        if (undefined === exchange.features['wsTickers'])
        {
            return reject(`Invalid value for 'conditions[${index}][origin][id]' : feature 'wsTickers' is not supported by '${c.origin.id}' exchange`);
        }
        entry.origin.id = c.origin.id;
        entry.condition.pair = c.condition.pair.trim();
        if ('' == entry.condition.pair)
        {
            return reject(`Parameter 'conditions[${index}][condition][pair]' cannot be empty`);
        }
        exchangeInstance.pairs({useCache:true}).then(function(data){
            if (undefined === data[c.condition.pair])
            {
                return reject(`Invalid value for 'conditions[${index}][condition][pair]' : pair '${c.condition.pair}' is not supported by '${c.origin.id}' exchange`);
            }
            resolve(true);
        }).catch (function(err){
            reject({origin:"remote",error:err});
        });
    });
}

/**
 * Checks service condition
 *
 * @param {object} c condition object
 * @param {integer} index index of the condition in the array
 * @return {Promise} which resolve to true or reject error
 */
_checkServiceCondition(c, index)
{
    return new Promise((resolve, reject) => {
        this._finalList[index].origin.type = c.origin.type;
        let p;
        switch (c.origin.id)
        {
            case 'coinmarketcap':
                p = this._checkCoinmarketcapCondition(c, index);
                break;
            default:
                return reject(`Unsupported value for parameter 'conditions[${index}][origin][id]' : '${c.origin.type}' service is not supported`);
        }
        p.then(function(){
            resolve(true);
        }).catch(function(err){
            reject(err);
        });
    });
}

/**
 * Checks coinmarketcap condition
 *
 * @param {object} c condition object
 * @param {integer} index index of the condition in the array
 * @return {Promise} which resolve to true or reject error
 */
_checkCoinmarketcapCondition(c, index)
{
    return new Promise((resolve, reject) => {
        // check if coinmarketcap service is enabled
        let service = serviceRegistry.getService(c.origin.id);
        if (null === service)
        {
            return reject(`Invalid value for 'conditions[${index}][origin][id]' : '${c.origin.id}' service is not supported`);
        }
        let entry = this._finalList[index];
        entry.origin.id = c.origin.id;
        // ensure symbol attribute is defined
        if (undefined === c.condition.symbol)
        {
            return reject(`Missing parameter 'conditions[${index}][condition][symbol]'`);
        }
        entry.condition.symbol = c.condition.symbol.trim();
        if ('' == entry.condition.symbol)
        {
            return reject(`Parameter 'conditions[${index}][condition][symbol]' cannot be empty`);
        }
        // check if field is supported
        if (-1 == coinmarketcapTickerFields.indexOf(c.condition.field))
        {
            return reject(`Invalid value for 'conditions[${index}][condition][field]' : value = '${c.condition.field}`);
        }
        entry.condition.field = c.condition.field;
        resolve(true);
    });
}

}

module.exports = ConditionsParser;
