"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractCcxtConfigCheckerClass = require('../../abstract-ccxt-config-checker');

// maximum number of requests per seconds for api
const GLOBAL_API_MAX_REQUESTS_PER_SECOND = 1;

class ConfigChecker extends AbstractCcxtConfigCheckerClass
{

constructor(exchangeId)
{
    // default config
    let cfg = {
        enabled:true,
        type:"kucoin",
        name:"Kucoin",
        requirePair:false,
        key:"",
        secret:"",
        feesPercent:0.1,
        verbose:false,
        emulatedWs:{
            wsTickers:{
                enabled:true,
                period:30
            },
            wsOrderBooks:{
                enabled:true,
                period:30
            },
            wsTrades:{
                enabled:true,
                period:30
            },
            wsKlines:{
                enabled:true
            }
        },
        throttle:{
            global:{
                maxRequestsPerSecond:GLOBAL_API_MAX_REQUESTS_PER_SECOND
            }
        }
    }
    super(exchangeId, cfg);
}

}

module.exports = ConfigChecker;
