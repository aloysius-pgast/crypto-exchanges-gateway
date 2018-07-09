"use strict";
const Big = require('big.js');
const logger = require('winston');

const Errors = {};

// dictionary of all possible error types {type:{httpCode:integer,description:string}}
const errorTypes = {};

/*
  Abstract base class for all errors. Following extra properties are available for all classes :
  - errorType : string (ex: GatewayError.InvalidRequest.InvalidParameter)
  - data : custom data with extra information (ex: {parameterName:string, parameterValue:string})
*/
class BaseError extends Error
{

/**
 * @param {string} message error message
 * @param {object} data custom data
 */
constructor(message, data)
{
    super(message);
    if (BaseError === this.constructor)
    {
        throw new TypeError(`Cannot instantiate '${this.constructor.name}' directly`);
    }
    this.data = data;
}

toJSON()
{
    return this.toHash();
}

inspect()
{
    let arr = this.stack.split('\n');
    arr[0] = this.toString();
    return arr.join('\n');
}

toString()
{
    return `${this.errorType}: ${this.message}`
}

get [Symbol.toStringTag]() {
    return this.errorType;
}

toHash()
{
    return {
        errorType:this.errorType,
        message:this.message,
        data:this.data
    }
}

}

Errors.BaseError = BaseError;

/**
 * Factory function used to declare classes in module Errors
 *
 * @param {string} errorType fully qualified error type (ex: GatewayError.InvalidRequest.InvalidParameter)
 * @param {class} newClass class definition
 * @param {integer} httpCode http code
 * @param {string} description error description
 */
function createClass(errorType, newClass, httpCode, description)
{
    errorTypes[errorType] = {httpCode:httpCode, description:description};
    newClass.prototype.errorType = errorType;
    let arr = errorType.split('.');
    let className = arr.pop();
    let container = Errors;
    let containerName = '';
    for (let i = 0; i < arr.length; ++i)
    {
        if ('' != containerName)
        {
            containerName += '.';
        }
        containerName += arr[i];
        if (undefined === container[arr[i]])
        {
            let _containerName = containerName;
            container[arr[i]] = {
                [Symbol.hasInstance]:function(obj){
                    if (undefined === obj.errorType)
                    {
                        return false;
                    }
                    return 0 === obj.errorType.indexOf(_containerName);
                }
            }
        }
        container = container[arr[i]];
    }
    container[className] = newClass;
}

/**
 * Update error data from a message object
 *
 * @param {object} data initial error data to update
 * @param {object} error object to extract information from
 * @return {object} updated data object
 */
function getErrorData(data, error)
{
    if (undefined === error || null === error || 'object' != typeof error)
    {
        return data;
    }
    // this is a ccxt error
    if (undefined !== error.ccxtError)
    {
        // add response if it's defined
        if (undefined !== error.response)
        {
            data.error = error.response;
        }
        return data;
    }
    if (error instanceof Error)
    {
        return data;
    }
    // only extract http status code & status message if it's an http response
    if (undefined !== error.request && undefined !== error.statusCode && undefined !== error.statusMessage)
    {
        data.error = {statusCode:error.statusCode,statusMessage:error.statusMessage}
    }
    else
    {
        data.error = error;
    }
    return data;
}

/**
 * Extract error message from an error
 * @param {string} defaultMessage message to use as fallback
 * @param {string|object} message
 * @return {string} message
 */
function getErrorMessage(defaultMessage, message)
{
    if (undefined === message || null === message || '' == message)
    {
        return defaultMessage;
    }
    if ('string' == typeof message)
    {
        return message;
    }
    if (undefined !== message.ccxtError)
    {
        return message.ccxtError.message;
    }
    if (undefined !== message.message)
    {
        return message.message;
    }
    if (undefined !== message.msg)
    {
        return message.msg;
    }
    if (undefined !== message.reason)
    {
        return message.reason;
    }
    return defaultMessage;
}

/**
 * Extract message & data
 *
 * @param {string} defaultMessage message to use as fallback if message is undefined
 * @param {string} message error message (optional)
 * @param {object} data error data
 */
function getErrorMessageAndData(defaultMessage, message, data)
{
    let err = {message:defaultMessage,data:{}};
    // data is defined
    if (undefined !== data && null !== data && 'object' == typeof data)
    {
        err.data = data;
        // message is defined
        if ('string' == typeof message && '' != message)
        {
            err.message = message;
        }
    }
    else
    {
        // message is defined
        if (undefined !== message && null !== message)
        {
            if ('string' == typeof message)
            {
                err.message = message;
            }
            // probably an object
            else
            {
                err.data = message;
            }
        }
    }
    return err;
}

//-- Gateway errors

/*
 * Error generated by gateway when an internal error occurs (ie: unexpected exception)
 */
createClass('GatewayError.InternalError', class extends BaseError {

/**
 * @param {string} message error message (optional)
 */
constructor(message)
{
    let m = 'An error occurred';
    if ('string' == typeof message && '' != message)
    {
        m = message;
    }
    super(m, {});
}

}, 500, 'Error generated by gateway when an internal error occurs (ie: unexpected exception)'); // GatewayError.InternalError

/*
 * Error generated by gateway when an unknown route is requested
 */
createClass('GatewayError.UnknownRoute', class extends BaseError {

/**
 * @param {string} message error message (optional)
 */
constructor(message)
{
    let m = 'Unknown route';
    if ('string' == typeof message && '' != message)
    {
        m = message;
    }
    super(m, {});
}

}, 404, 'Error generated by gateway when an unknown route is requested'); // GatewayError.UnknownRoute

/*
 * Error generated by gateway when user is not allowed to connect (ip filtering or invalid api key)
 */
createClass('GatewayError.Forbidden', class extends BaseError {

/**
 * @param {string} message error message (optional)
 */
constructor(message)
{
    let m = 'Forbidden access';
    if ('string' == typeof message && '' != message)
    {
        m = message;
    }
    super(m, {});
}

}, 403, 'Error generated by gateway when user is not allowed to connect (ip filtering or invalid api key)'); // GatewayError.Forbidden

/*
 * Error generated by gateway when a request is invalid
 */
createClass('GatewayError.InvalidRequest.UnknownError', class extends BaseError {

/**
 * @param {string} message error message (optional)
 */
constructor(message)
{
    let m = 'Invalid request';
    if ('string' == typeof message && '' != message)
    {
        m = message;
    }
    super(m, {});
}

}, 400, 'Error generated by gateway when a request is invalid'); // GatewayError.InvalidRequest.UnknownError

/*
 * Error generated by gateway when parameters are missing
 */
createClass('GatewayError.InvalidRequest.MissingParameters', class extends BaseError {

/**
 * @param {string|string[]} parameters name of the missing parameter
 * @param {string} message error message (optional)
 */
constructor(parameters, message)
{
    let defaultMessage;
    let data = {};
    if (Array.isArray(parameters))
    {
        data.parameters = parameters;
        defaultMessage = `One parameter in (${parameters.join(',')}) is missing`;
    }
    else
    {
        data.parameters = [parameters];
        defaultMessage =  `Parameter '${parameters}' is missing`;
    }
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when parameters are missing'); // GatewayError.InvalidRequest.MissingParameters


/*
 * Error generated by gateway when conflicting parameters exist
 */
createClass('GatewayError.InvalidRequest.ConflictingParameters', class extends BaseError {

/**
 * @param {string[]} parameters names of conflicting parameters
 * @param {string} message error message (optional)
 */
constructor(parameters, message)
{
    let defaultMessage = `Parameters (${parameters.join(',')}) are exclusive`;
    let data = {parameters:parameters};
    super(getErrorMessage(defaultMessage, message), data);
}

}, 409, 'Error generated by gateway when conflicting parameters exist'); // GatewayError.InvalidRequest.ConflictingParameters

/*
 * Error generated by gateway when client provides an invalid parameter for REST API
 */
createClass('GatewayError.InvalidRequest.InvalidParameter', class extends BaseError {

/**
 * @param {string} parameterName name of the invalid parameter
 * @param {string|number|boolean|object} parameterValue value of the invalid parameter
 * @param {string} message error message (optional)
 * @param {boolean} cannotBeEmpty if true a message will be generated to indicate that value cannot be empty (unless a custom message exist)
 */
constructor(parameterName, parameterValue, message, cannotBeEmpty)
{
    let defaultMessage = `Parameter '${parameterName}' is invalid`;
    if (undefined !== cannotBeEmpty && true === cannotBeEmpty)
    {
        defaultMessage = `Parameter '${parameterName}' cannot be empty`;
    }
    let data = {
        parameterName:parameterName,
        parameterValue:parameterValue
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client provides an invalid parameter for REST API'); // GatewayError.InvalidRequest.InvalidParameter

/*
 * Error generated by gateway when a try to access a non existing object
 */
createClass('GatewayError.InvalidRequest.ObjectNotFound', class extends BaseError {

/**
 * @param {string} message error message (optional)
 * @param {object} data error data (optional)
 */
constructor(message, data)
{
    let defaultMessage = `Object does not exist`;
    let err = getErrorMessageAndData(message, data);
    super(err.message, err.data);
}

}, 404, 'Error generated by gateway when a try to access a non existing object'); // GatewayError.InvalidRequest.ObjectNotFound

/*
 * Error generated by gateway when a try create an object which already exists
 */
createClass('GatewayError.InvalidRequest.ObjectAlreadyExists', class extends BaseError {

/**
 * @param {string} message error message (optional)
 * @param {object} data error data (optional)
 */
constructor(message, data)
{
    let defaultMessage = `Object already exists`;
    let err = getErrorMessageAndData(message, data);
    super(err.message, err.data);
}

}, 409, 'Error generated by gateway when a try create an object which already exists'); // GatewayError.InvalidRequest.ObjectAlreadyExists

/*
 * Error generated by gateway when client tries to use an unsupported service
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedService', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service which is not supported
 * @param {string} message error message (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `Service '${serviceId}' is not supported`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported service'); // GatewayError.InvalidRequest.Unsupported.UnsupportedService

/*
 * Error generated by gateway when client tries to use an unsupported feature for a given service
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedServiceFeature', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string} feature unsupported feature name
 * @param {string} message error message (optional)
 */
constructor(serviceId, feature, message)
{
    let defaultMessage = `Feature '${feature}' is not supported by service '${serviceId}'`;
    let data = {
        service:serviceId,
        feature:feature
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported feature for a given service'); // GatewayError.InvalidRequest.Unsupported.UnsupportedServiceFeature

/*
 * Error generated by gateway when client tries to use an unsupported exchange
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedExchange', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange which is not supported
 * @param {string} message error message (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `Exchange '${exchangeId}' is not supported`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported exchange'); // GatewayError.InvalidRequest.Unsupported.UnsupportedExchange

/*
 * Error generated by gateway when client tries to use an unsupported feature for a given exchange
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} feature unsupported feature name (ex: wsOrderBooks)
 * @param {string} message error message (optional)
 */
constructor(exchangeId, feature, message)
{
    let defaultMessage = `Feature '${feature}' is not supported by exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId,
        feature:feature
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported feature for a given exchange'); // GatewayError.InvalidRequest.Unsupported.UnsupportedExchangeFeature

/*
 * Error generated by gateway when client tries to use an unsupported pair for a given exchange
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair unsupported pair
 * @param {string} message error message (optional)
 */
constructor(exchangeId, pair, message)
{
    let defaultMessage = `Pair '${pair}' is not supported by exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId,
        pair:pair
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported pair for a given exchange'); // GatewayError.InvalidRequest.Unsupported.UnsupportedExchangePair

/*
 * Error generated by gateway when client tries to use an unsupported kline interval for a given exchange
 */
createClass('GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} interval unsupported interval
 * @param {string} message error message (optional)
 */
constructor(exchangeId, interval, message)
{
    let defaultMessage = `Klines interval '${interval}' is not supported by exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId,
        interval:interval
    };
    super(getErrorMessage(defaultMessage, message), data);
}

}, 400, 'Error generated by gateway when client tries to use an unsupported kline interval for a given exchange'); // GatewayError.InvalidRequest.Unsupported.UnsupportedKlineInterval

//-- Exchange errors

/*
 * Used when auth credentials are refused by exchange
 */
createClass('ExchangeError.Forbidden.InvalidAuthentication', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `Authentication was refused by exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 403, 'Used when auth credentials are refused by exchange'); // ExchangeError.Forbidden.InvalidAuthentication

/*
 * Used when exchange request is not allowed
 */
createClass('ExchangeError.Forbidden.PermissionDenied', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `Request was denied by exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 403, 'Used when exchange request is not allowed'); // ExchangeError.Forbidden.PermissionDenied

/*
 * Used when exchange API returns an error
 */
createClass('ExchangeError.InvalidRequest.UnknownError', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `An error occurred on exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when exchange API returns an error'); // ExchangeError.InvalidRequest.UnknownError

/*
 * Used when an order was not found on the exchange
 */
createClass('ExchangeError.InvalidRequest.OrderError.OrderNotFound', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} orderNumber number of the order
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, orderNumber, message)
{
    let defaultMessage = `Order '${orderNumber}' was not found on exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId,
        orderNumber:orderNumber
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 404, 'Used when an order was not found on the exchange'); // ExchangeError.InvalidRequest.OrderError.OrderNotFound

/*
 * Used when user tries to cancel an order which is already closed
 */
createClass('ExchangeError.InvalidRequest.OrderError.OrderNotOpen', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} orderNumber number of the order
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, orderNumber, message)
{
    let defaultMessage = `Order '${orderNumber}' is not open`;
    let data = {
        exchange:exchangeId,
        orderNumber:orderNumber
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when user tries to cancel an order which is already closed'); // ExchangeError.InvalidRequest.OrderError.OrderNotOpen

/*
 * Used when the requested quantity does not match exchange filters
 */
createClass('ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidQuantity', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair unsupported pair
 * @param {float} quantity requested quantity
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, pair, quantity, message)
{
    let defaultMessage = `Quantity '${quantity}' is not valid`;
    let data = {
        exchange:exchangeId,
        pair:pair,
        quantity:quantity
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when the requested quantity does not match exchange filters'); // ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidQuantity

/*
 * Used when the requested rate does not match exchange filters
 */
createClass('ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair requested pair
 * @param {float} rate requested rate
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, pair, rate, message)
{
    let defaultMessage = `Rate '${rate}' is not valid`;
    let data = {
        exchange:exchangeId,
        pair:pair,
        rate:rate
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when the requested rate does not match exchange filters'); // ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidRate

/*
 * Used when the requested price (quantity * rate) does not match exchange filters
 */
createClass('ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidPrice', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair requested pair
 * @param {float} rate requested rate
 * @param {float} quantity requested quantity
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, pair, rate, quantity, message)
{
    let defaultMessage = `Amount is not valid`;
    let data = {
        exchange:exchangeId,
        pair:pair,
        quantity:quantity,
        rate:rate,
        price:parseFloat(new Big(quantity).times(rate))
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when the requested price (quantity * rate) does not match exchange filters'); // ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InvalidPrice

/*
 * Used when the user has not enough funds to create an order
 */
createClass('ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InsufficientFunds', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair requested pair
 * @param {float} rate requested rate
 * @param {float} quantity requested quantity
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, pair, rate, quantity, message)
{
    let defaultMessage = `Insufficient funds`;
    let data = {
        exchange:exchangeId,
        pair:pair,
        quantity:quantity,
        rate:rate,
        price:parseFloat(new Big(quantity).times(rate))
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when the user has not enough funds to create an order'); // ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.InsufficientFunds

/*
 * Used when the requested quantity does not match exchange filters
 */
createClass('ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.UnknownError', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string} pair requested pair
 * @param {float} rate requested rate
 * @param {float} quantity requested quantity
 * @param {string|object} message error message or object (optional)
 */
 constructor(exchangeId, pair, rate, quantity, message)
{
    let defaultMessage = `Order definition is not valid`;
    let data = {
        exchange:exchangeId,
        pair:pair,
        quantity:quantity,
        rate:rate,
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when order was refused because of an unknown error'); // ExchangeError.InvalidRequest.OrderError.InvalidOrderDefinition.UnknownError

/*
 * Used when a request to an exchange times out
 */
createClass('ExchangeError.NetworkError.RequestTimeout', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `Request timed out when trying to contact exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 504, 'Used when a request to an exchange times out'); // ExchangeError.NetworkError.RequestTimeout

/*
 * Used when a request to an exchange was blocked by DDos protection
 */
createClass('ExchangeError.NetworkError.DDosProtection', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `Request to exchange '${exchangeId}' was refused by DDoS protection`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 429, 'Used when a request to an exchange was blocked by DDos protection'); // ExchangeError.NetworkError.DDosProtection

/*
 * Used when an unknown http error occurs when trying to contact exchange
 */
createClass('ExchangeError.NetworkError.UnknownError', class extends BaseError {

/**
 * @param {string} exchangeId identifier of the exchange
 * @param {string|object} message error message or object (optional)
 */
constructor(exchangeId, message)
{
    let defaultMessage = `A network error occured when trying to contact exchange '${exchangeId}'`;
    let data = {
        exchange:exchangeId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 503, 'Used when an unknown http error occurs when trying to contact exchange'); // ExchangeError.NetworkError.UnknownError

//-- Service errors

/*
 * Used when auth credentials are refused by service
 */
createClass('ServiceError.Forbidden.InvalidAuthentication', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `Authentication was refused by service '${serviceId}'`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 403, 'Used when auth credentials are refused by service'); // ServiceError.Forbidden.InvalidAuthentication

/*
 * Used when service request is not allowed
 */
createClass('ServiceError.Forbidden.PermissionDenied', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `Request was denied by service '${serviceId}'`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 403, 'Used when service request is not allowed'); // ServiceError.Forbidden.PermissionDenied

/*
 * Used when service API returns an error
 */
createClass('ServiceError.InvalidRequest.UnknownError', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `An error occurred on service '${serviceId}'`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 400, 'Used when service API returns an error'); // ServiceError.InvalidRequest.UnknownError

/*
 * Used when a request to an service times out
 */
createClass('ServiceError.NetworkError.RequestTimeout', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `Request timed out when trying to contact service '${serviceId}'`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 504, 'Used when a request to an service times out'); // ServiceError.NetworkError.RequestTimeout

/*
 * Used when a request to a service was blocked by DDos protection
 */
createClass('ServiceError.NetworkError.DDosProtection', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `Request to service '${serviceId}' was refused by DDoS protection`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 429, 'Used when a request to a service was blocked by DDos protection'); // ServiceError.NetworkError.DDosProtection

/*
 * Used when an unknown http error occurs when trying to contact service
 */
createClass('ServiceError.NetworkError.UnknownError', class extends BaseError {

/**
 * @param {string} serviceId identifier of the service
 * @param {string|object} message error message or object (optional)
 */
constructor(serviceId, message)
{
    let defaultMessage = `A network error occured when trying to contact service '${serviceId}'`;
    let data = {
        service:serviceId
    };
    super(getErrorMessage(defaultMessage, message), getErrorData(data, message));
}

}, 503, 'Used when an unknown http error occurs when trying to contact service'); // ServiceError.NetworkError.UnknownError

/**
 * Returns the list of all possible error types
 *
 * @return {string[]}
 */
Errors.types = () => {
    return Object.keys(errorTypes).sort();
}

/**
 * List all possible errors with description
 * @return [{type:string,httpCode:integer,description:string}]
 */
Errors.list = () => {
    let list = [];
    let types = Object.keys(errorTypes).sort();
    for (let i = 0; i < types.length; ++i)
    {
        list.push({type:types[i], httpCode:errorTypes[types[i]].httpCode, description:errorTypes[types[i]].description});
    }
    return list;
}

/**
 * Returns the http code corresponding to a given error
 *
 * @param {object|string} e error to retrieve http code for
 */
Errors.errorToHttpCode = (e) => {
    let errType = e;
    if (e instanceof Errors.BaseError)
    {
        errType = e.errorType;
    }
    if (undefined === errorTypes[errType])
    {
        return 503;
    }
    return errorTypes[errType].httpCode;
}

/**
 * Used to log an unexpected error
 * @param {string|object} error message or exception
 * @param {string} context (optional, used to log a message before logging the error)
 */
Errors.logError = (e, context) => {
    if (undefined !== context)
    {
        logger.error(`Exception (${context})`);
    }
    if (undefined !== e.stack)
    {
        logger.error(e.stack);
    }
    else
    {
        logger.error(e);
    }
}

/**
 * Sends an http error to client
 *
 * @param {object} res express response object
 * @param {string|object} err error message or exception
 * @param {string} context (optional, used to log a message before logging the error)
 * @return {false}
 */
Errors.sendHttpError = (res, err, context) => {
    let route = {method:res.req.method,path:res.req._parsedUrl.pathname};
    // this is a joi error
    if (true === err.isJoi)
    {
        let extError = JoiHelper.getError(err);
        res.status(Errors.errorToHttpCode(extError)).send({origin:'gateway', error:extError.message, route:route, extError:extError});
        return false;
    }
    if (err instanceof Errors.BaseError)
    {
        let code = Errors.errorToHttpCode(err);
        let origin = 'gateway';
        if (err instanceof Errors.ExchangeError || err instanceof Errors.ServiceError)
        {
            origin = 'remote';
        }
        res.status(code).send({origin:origin, error:err.message, route:route, extError:err});
        return false;
    }
    // by default throw an internal error
    Errors.logError(err, context);
    let extError = new Errors.GatewayError.InternalError();
    res.status(Errors.errorToHttpCode(extError)).send({origin:'gateway', error:extError.message, route:route, extError:extError});
    return false;
}

module.exports = Errors;

const JoiHelper = require('./joi-helper');
