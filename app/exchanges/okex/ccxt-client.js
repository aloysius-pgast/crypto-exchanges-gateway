"use strict";
const DefaultCcxtClient = require('../../default-ccxt-client');
const Big = require('big.js');

class CcxtClient extends DefaultCcxtClient
{

/**
 * @param {string} ccxtExchangeId ccxt exchange id
 * @param {object} ccxtExchangeOpt ccxt options
 */
constructor(ccxtExchangeId, ccxtExchangeOpt)
{
    super(ccxtExchangeId, ccxtExchangeOpt);
}

/**
 * Extract actual rate from ccxt data
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {float}
 */
getActualRate(ccxtData)
{
    if (undefined !== ccxtData.average)
    {
        return ccxtData.average;
    }
    if (undefined !== ccxtData.price)
    {
        return ccxtData.price;
    }
    return null;
}

/**
 * Extract actual price from ccxt data
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchOpenOrders
 * @return {float}
 */
getActualPrice(ccxtData)
{
    let rate = this.getActualRate(ccxtData);
    return parseFloat(new Big(ccxtData.filled).times(rate).toFixed(8));
}

}

module.exports = CcxtClient;
