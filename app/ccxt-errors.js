"use strict";
const Errors = {};

class BaseError extends Error
{

/**
 * @param {object} ccxtError error triggered by ccxt
 * @param {object} request {method:string,url:string}
 * @param {object} response {statusCode:integer,statusMessage:string,body:string}
 * @param {object} json parsed JSON data
 */
constructor(ccxtError, request, response, json)
{
    super(ccxtError.message);
    this.ccxtError = ccxtError;
    this.ccxtErrorType = ccxtError.constructor.name;
    this.request = request,
    this.response = response
    this.json = json
}

inspect()
{
    let arr = this.ccxtError.stack.split('\n');
    arr[0] = this.toString();
    return arr.join('\n');
}

toString()
{
    return `${this.ccxtErrorType}: ${this.message}`
}

toHash()
{
    return {
        ccxtErrorType:this.ccxtErrorType,
        message:this.ccxtError.message,
        request:this.request,
        response:this.response,
        json:this.json
    }
}

toJSON()
{
    return this.toHash();
}

}

Errors.BaseError = BaseError;

module.exports = Errors;
