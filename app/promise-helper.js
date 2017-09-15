"use strict";
const util = require('util');
const logger = require('winston');

const reflect = (descriptor, opt) => {
    return descriptor.promise.then(function(data){
        return {success:true, value:data, context:descriptor.context};
    }).catch(function(err){
        if (opt.logError)
        {
            logger.error('%s => %s', JSON.stringify(descriptor.context), JSON.stringify(err));
        }
        if (!opt.stopOnError)
        {
            return {success:false, value:err, context:descriptor.context};
        }
        throw err;
    });
};

class PromiseHelper
{

/**
 * Each array entry can be either a Promise object or an object {promise:Promise, context:{}} (data will be used when logging errors)
 * opt.logError : log promise error
 * opt.stopOnError : stop after one error (like default Promise.all behaviour)
 */
static all(arr, opt)
{
    let options = {logError:true, stopOnError:false};
    if (undefined !== opt)
    {
        if (undefined !== opt.logError)
        {
            options.logError = opt.logError;
        }
        if (undefined !== opt.stopOnError)
        {
            options.stopOnError = opt.stopOnError;
        }
    }
    return Promise.all(arr.map(function(entry) {
        // probably a promise
        if ('function' == typeof entry.then)
        {
            entry = {promise:entry, context:{}};
        }
        else if (undefined === entry.context)
        {
            entry.context = {};
        }
        return reflect(entry, options);
    }));
}

}

module.exports = PromiseHelper;
