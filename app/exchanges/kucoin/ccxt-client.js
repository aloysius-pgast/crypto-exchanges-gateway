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
    if (null === trade.id && undefined !== ccxtData.info['sequence'])
    {
        trade.id = ccxtData.info['sequence'];
    }
    return trade;
}

/**
 * Formats a single ticker entry returned by ccxt
 *
 * @param {string} pair pair in custom format
 * @param {object} ccxtData ticker entry returned by ccxt fetchTickers
 * @return {object}
 */
formatTicker(pair, ccxtData)
{
    let ticker = super.formatTicker(pair, ccxtData);
    if (null === ticker.timestamp)
    {
        ticker.timestamp = Date.now() / 1000.0;
    }
    return ticker;
}

}

module.exports = CcxtClient;
