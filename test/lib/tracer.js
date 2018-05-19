"use strict";
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const os = require('os');
const DateTimeHelper = require('./datetime-helper');

const sanitizeDirName = (name) => {
    return name.replace(/\//g,'.').replace(/^\.(.*)$/, '$1');
}

class Tracer
{

constructor()
{
    // whether or not tracer is enabled (disabled by default)
    this._enabled = false;
    // list of http codes to enable trace for
    this._httpCodes = [];

    // the directory where we should generate a new sub directory
    this._rootDir = os.tmpdir();
    // the directory we will generate
    this._dir = null;
    this._currentSuite = null;
    this._suites = {};
}

/**
 * Enable/disable traces
 *
 * @param {boolean} flag true to enable
 * @param {integer[]} list of http codes to enable trace for (if undefined or empty traces will be enable for all code) (ignored if 'flag' is false)
 */
enable(flag, httpCodes)
{
    this._enabled = flag;
    this._httpCodes = [];
    if (this._enabled)
    {
        if (undefined !== httpCodes)
        {
            this._httpCodes = httpCodes;
        }
    }
}

/**
 * Indicates whether or not traces are enabled
 *
 * @param {integer} httpCode http code to check (optional)
 */
shouldTrace(httpCode)
{
    if (!this._enabled)
    {
        return;
    }
    if (null === this._currentSuite)
    {
        return;
    }
    if (0 == this._httpCodes.length)
    {
        return true;
    }
    return -1 != this._httpCodes.indexOf(httpCode);
}

setRootDir(dir)
{
    this._rootDir = dir;
    this._dir = null;
}

_mkdirRecursive(dir)
{
    if (fs.existsSync(dir))
    {
        return;
    }
    let p = dir;
    let arr = [dir];
    while ('/' != p)
    {
        p = path.dirname(p);
        if (!fs.existsSync(p))
        {
            arr.unshift(p);
        }
    }
    try
    {
        _.forEach(arr, (p) => {
            fs.mkdirSync(p);
        });
    }
    catch (e)
    {
        console.log(`Could not create directory '${dir}' : ${e.message}`);
        process.exit(1);
    }
}

getDir()
{
    if (null === this._dir)
    {
        let datetime = DateTimeHelper.formatDateTime(Date.now());
        this._dir = path.join(this._rootDir, `${datetime}_${process.pid}`);
        this._mkdirRecursive(this._dir);
    }
    return this._dir;
}

getCurrentSuite()
{
    return this._currentSuite;
}

setCurrentSuite(name)
{
    this._currentSuite = name;
    if (undefined === this._suites[name])
    {
        this._suites[name] = {
            path:sanitizeDirName(name),
            requests:{}
        }
    }
}

/**
 * Trace the http request (internal use)
 * @param {object} request {method:string,path:string,params:object,json:boolean,timestamp:float}
 * @param {object} result {httpCode:integer,body:object,duration:integer}
 * @return Promise
 */
trace(request, result)
{
    if (!this.shouldTrace(result.httpCode))
    {
        return;
    }
    let requestDir = `${request.method}_${sanitizeDirName(request.path)}`;
    if (undefined === this._suites[this._currentSuite].requests[requestDir])
    {
        this._suites[this._currentSuite].requests[requestDir] = 0;
    }
    let index = ++this._suites[this._currentSuite].requests[requestDir];
    if (index < 100)
    {
        index = `0${index}`;
        if (index < 10)
        {
            index = `0${index}`;
        }
    }
    index = `${index}_${result.httpCode}`;
    let subdir = path.join(this._dir, this._suites[this._currentSuite].path, requestDir, index);
    try
    {
        this._mkdirRecursive(subdir);
        let requestFile = `${subdir}/request.json`;
        fs.writeFileSync(requestFile, JSON.stringify(request, null, 4));
        let responseFile = `${subdir}/response.json`;
        fs.writeFileSync(responseFile, JSON.stringify(result, null, 4));
    }
    catch (e)
    {
        console.log(e);
        process.exit(1);
    }
}

}

let instance = new Tracer();

module.exports = instance;
