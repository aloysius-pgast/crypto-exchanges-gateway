"use strict";
const path = require('path');
const _ = require('lodash');
const AbstractCcxtConfigCheckerClass = require('../../abstract-ccxt-config-checker');

// maximum number of requests per seconds for api
const GLOBAL_API_MAX_REQUESTS_PER_SECOND = 3;

class ConfigChecker extends AbstractCcxtConfigCheckerClass
{

constructor(exchangeId)
{
    // default config
    let cfg = {
        enabled:true,
        type:"okex",
        name:"OKEx",
        requirePair:false,
        key:"",
        secret:"",
        feesPercent:0.2,
        emulatedWs:{
            wsKlines:{
                enabled:true
            }
        },
        verbose:false,
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
