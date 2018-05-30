"use strict";
const logger = require('winston');

const reflect = (descriptor, opt) => {
    return descriptor.promise.then(function(data){
        return {success:true, value:data, context:descriptor.context};
    }).catch(function(err){
        if (opt.logError)
        {
            let message;
            // not a BaseError
            if (err instanceof Error && undefined === err.errorType)
            {
                message = err.message;
            }
            else
            {
                message = JSON.stringify(err);
            }
            logger.error(`${JSON.stringify(descriptor.context)} => ${message}`);
            if (undefined !== err.stack)
            {
                logger.error(err.stack);
            }
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
 * opt.logError : log promise error (default = true)
 * opt.stopOnError : stop after one error (like default Promise.all behaviour) (default = false)
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
