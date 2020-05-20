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
 * Returns charts data
 *
 * @param {string} pair pair to retrieve chart data for
 * @param {string} interval charts interval
 * @param {integer} fromTimestamp unix timestamp in seconds
 * @param {integer} toTimestamp unix timestamp in seconds
 * @param {object} ccxtParams custom parameters (optional, might not be defined)
 * @return {ccxt:object[],custom:object[]}
 */
async getKlines(pair, interval, fromTimestamp, toTimestamp, ccxtParams)
{
    // remove 1s since implementation of parseOHLCV in ccxt 1.28.5 will ignore the candle with the exact same timestamp
    return super.getKlines(pair, interval, fromTimestamp - 1, toTimestamp, ccxtParams);
}

/**
 * Extract actual rate from ccxt data
 *
 * @param {object} ccxtData single order entry returned by ccxt fetchClosedOrders
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
 * @param {object} ccxtData single order entry returned by ccxt fetchClosedOrders
 * @return {float}
 */
getActualPrice(ccxtData)
{
    let rate = this.getActualRate(ccxtData);
    return parseFloat(new Big(ccxtData.filled).times(rate).toFixed(8));
}

}

module.exports = CcxtClient;
