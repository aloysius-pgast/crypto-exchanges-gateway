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
 * Format trades returned by ccxt
 *
 * @param {object} ccxtData single trade returned by ccxt fetchTrades
 * @return {object}
 */
formatTrade(ccxtData)
{
    let trade = super.formatTrade(ccxtData);
    if (null === trade.id && ccxtData.info.length > 5)
    {
        trade.id = ccxtData.info[5];
    }
    return trade;
}

}

module.exports = CcxtClient;
