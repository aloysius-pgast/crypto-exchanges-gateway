"use strict";
const _ = require('lodash');
const serviceRegistry = require('../service-registry');
const Errors = require('../errors');

/**
 * List of possible ticker fields
 */
const exchangeTickerFields = ['last', 'buy', 'sell', 'high', 'low', 'volume', 'priceChangePercent'];

/**
 * List of possible services
 */
const supportedServices = ['coinmarketcap', 'marketCap'];

/**
 * List of possible fields for coinmarketcap
 */
const coinmarketcapTickerFields = ['price_usd', 'price_btc', 'volume_24_usd', 'volume_24_btc', 'total_supply', 'circulating_supply', 'market_cap_usd', 'market_cap_btc', 'percent_change_1h', 'percent_change_24h', 'percent_change_7d'];

/**
 * List of possible fields for marketCap
 */
const marketCapTickerFields = ['price_usd', 'price_btc', 'volume_24_usd', 'circulating_supply', 'market_cap_usd', 'percent_change_1h', 'percent_change_1d', 'percent_change_7d'];

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
 * Checks a condition
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
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition]`);
            return reject(extErr);
        }
        entry.condition = {};
        if (undefined === c.condition.field)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][field]`);
            return reject(extErr);
        }
        entry.condition.field = c.condition.field;
        if (undefined === c.condition.operator)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][operator]`);
            return reject(extErr);
        }
        entry.condition.operator = c.condition.operator;
        if (undefined === c.condition.value)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][value]`);
            return reject(extErr);
        }
        let requiresArray = supportedOperators[c.condition.operator];
        if (undefined === requiresArray)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][operator]`, c.condition.operator);
            return reject(extErr);
        }
        if (requiresArray)
        {
            let valid = true;
            if (!Array.isArray(c.condition.value) || 2 != c.condition.value.length)
            {
                let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][value]`, c.condition.value, `Parameter 'conditions[${index}][condition][value]' should be a float[2] array`);
                return reject(extErr);
            }
            let value;
            entry.condition.value = [];
            for (var i = 0; i < c.condition.value.length; ++i)
            {
                value = parseFloat(c.condition.value[i]);
                if (isNaN(value))
                {
                    let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][value][${i}]`, c.condition.value[i], `Parameter 'conditions[${index}][condition][value][${i}]' is not a valid float`);
                    return reject(extErr);
                }
                entry.condition.value.push(value);
            }
        }
        else
        {
            let value = parseFloat(c.condition.value);
            if ('number' != typeof c.condition.value || isNaN(value))
            {
                let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][value]`, c.condition.value, `Parameter 'conditions[${index}][condition][value]' is not a valid float`);
                return reject(extErr);
            }
            entry.condition.value = value;
        }
        if (undefined === c.origin)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][origin]`);
            return reject(extErr);
        }
        entry.origin = {};
        if (undefined === c.origin.id)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][origin][id]`);
            return reject(extErr);
        }
        this._finalList[index] = entry;
        if (undefined === c.origin.type)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][origin][type]`);
            return reject(extErr);
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
                let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][origin][type]`, c.origin.type, `Unsupported value for parameter 'conditions[${index}][origin][type]'`);
                return reject(extErr);
        }
        p.then(function(){
            return resolve(true);
        }).catch(function(err){
            return reject(err);
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
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][pair]`);
            return reject(extErr);
        }
        // check if field is supported
        if (-1 == exchangeTickerFields.indexOf(c.condition.field))
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][field]`, c.condition.field);
            return reject(extErr);
        }
        entry.condition.field = c.condition.field;
        // check if exchange exists and wsTickers feature is enabled
        let exchange = serviceRegistry.getExchange(c.origin.id);
        if (null === exchange)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchange(c.origin.id);
            return reject(extErr);
        }
        let exchangeInstance = exchange.instance;
        if (undefined === exchange.features['wsTickers'] || !exchange.features['wsTickers'].enabled)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature(c.origin.id, 'wsTickers');
            return reject(extErr);
        }
        entry.origin.id = c.origin.id;
        entry.condition.pair = c.condition.pair.trim();
        if ('' == entry.condition.pair)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][pair]`, '', undefined, true);
            return reject(extErr);
        }
        exchangeInstance.getPairs({useCache:true}).then(function(data){
            if (undefined === data[c.condition.pair])
            {
                let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair(c.origin.id, c.condition.pair);
                return reject(extErr);
            }
            resolve(true);
        }).catch (function(err){
            return reject(err);
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
            case 'marketCap':
                p = this._checkMarketCapCondition(c, index);
                break;
            default:
                let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedService(c.origin.id);
                return reject(extErr);
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
            let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedService(c.origin.id);
            return reject(extErr);
        }
        let entry = this._finalList[index];
        entry.origin.id = c.origin.id;
        // ensure symbol attribute is defined
        if (undefined === c.condition.symbol)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][symbol]`);
            return reject(extErr);
        }
        entry.condition.symbol = c.condition.symbol.trim();
        if ('' == entry.condition.symbol)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][symbol]`, '', undefined, true);
            return reject(extErr);
        }
        // check if field is supported
        if (-1 == coinmarketcapTickerFields.indexOf(c.condition.field))
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][field]`, c.condition.field);
            return reject(extErr);
        }
        entry.condition.field = c.condition.field;
        resolve(true);
    });
}

/**
 * Checks marketCap condition
 *
 * @param {object} c condition object
 * @param {integer} index index of the condition in the array
 * @return {Promise} which resolve to true or reject error
 */
_checkMarketCapCondition(c, index)
{
    return new Promise((resolve, reject) => {
        // check if marketCap service is enabled
        let service = serviceRegistry.getService(c.origin.id);
        if (null === service)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.Unsupported.UnsupportedService(c.origin.id);
            return reject(extErr);
        }
        let entry = this._finalList[index];
        entry.origin.id = c.origin.id;
        // ensure symbol attribute is defined
        if (undefined === c.condition.symbol)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.MissingParameters(`conditions[${index}][condition][symbol]`);
            return reject(extErr);
        }
        entry.condition.symbol = c.condition.symbol.trim();
        if ('' == entry.condition.symbol)
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][symbol]`, '', undefined, true);
            return reject(extErr);
        }
        // check if field is supported
        if (-1 == marketCapTickerFields.indexOf(c.condition.field))
        {
            let extErr = new Errors.GatewayError.InvalidRequest.InvalidParameter(`conditions[${index}][condition][field]`, c.condition.field);
            return reject(extErr);
        }
        entry.condition.field = c.condition.field;
        resolve(true);
    });
}

}

module.exports = ConditionsParser;
