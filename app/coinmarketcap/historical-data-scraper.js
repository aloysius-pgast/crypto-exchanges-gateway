"use strict";
const htmlparser2 = require('htmlparser2');
const CSSselect = require('css-select');
const debug = require('debug')('CEG:CoinMarketCap');
const _ = require('lodash');
const request = require('request');
const util = require('util');
const logger = require('winston');

const DEFAULT_SOCKETTIMEOUT = 60 * 1000;
// coinmarketcap API base url
const BASE_URL = 'https://coinmarketcap.com/currencies/%s/historical-data/'

// mapping of each columns
const mapping = ['date', 'open', 'high', 'low', 'close', 'volume', 'market_cap'];

class Scraper
{

constructor()
{
    // nothing to do
}

/**
 * Retrieve data for a given currency
 *
 * @param {string} currency to retrieve data for
 * @param {boolean} opt.completeHistory whether or not complete history should be retrieved (optional, default = false)
 * @param {string} opt.from start date (yyyy-mm-dd) (optional, default to yesterday - 6 days) (will be ignored if opt.completeHistory is true)
 * @param {string} opt.to to date (yyyy-mm-dd) (optional, default to yesterday) (will be ignored if opt.completeHistory is true)
 * @param {string} opt.sort (asc|desc) (optional, default = desc)
 * @return {Promise} which will resolve to content such as below or reject an object {error:object,response:object,body:string} with informations returned by 'request' method
 */
/*
Example output

[
    {
        "date":"2018-04-17",
        "open":8071.66,
        "high":8285.96,
        "low":7881.72,
        "close":7902.09,
        "volume":6900880000,
        "market_cap":137070000000
    },
    {
        "date":"2018-04-18",
        "open":7944.43,
        "high":8197.8,
        "low":7886.01,
        "close":8163.42,
        "volume":6529910000,
        "market_cap":134926000000
    },...
    {
        "date":"2018-05-16",
        "open":8504.41,
        "high":8508.43,
        "low":8175.49,
        "close":8368.83,
        "volume":6760220000,
        "market_cap":144878000000
    }
]
*/
get(currency, opt)
{
    if (undefined === opt)
    {
        opt = {};
    }
    let sortDesc = true;
    if ('asc' == opt.sort)
    {
        sortDesc = false;
    }
    let now = Date.now();
    let yesterday = now - 3600 * 24 * 1000;
    let from, to;
    if (true === opt.completeHistory)
    {
        to = this._formatDate(new Date(yesterday), '');
        from = '20090103';
    }
    else
    {
        // by default use current date
        let toDate;
        if (undefined === opt.to)
        {
            toDate = new Date(yesterday);
            to = this._formatDate(toDate, '');
        }
        else
        {
            toDate = new Date(opt.to);
            to = opt.to.replace(/-/g,'');
        }
        // by default use to - 6 days
        if (undefined === opt.from)
        {
            let toTimestamp = toDate.getTime();
            let fromTimestamp = toTimestamp - 3600 * 24 * 6 * 1000;
            from = this._formatDate(new Date(fromTimestamp), '');
        }
        else
        {
            from = opt.from.replace(/-/g,'');
        }
    }
    return this._get(currency, from, to, sortDesc);
}

/**
 * Retrieve data for a given currency
 * @param {string} currency to retrieve data for
 * @param {string} from start date (yyyymmdd)
 * @param {string} to to date (yyyymmdd)
 * @param {boolean} sortDesc if true, newest will be first
 * @return {Promise}
 */
/*
Raw data example
<table class="table">
<thead>
<tr>
 <th class="text-left">Date</th>
<th class="text-right">Open</th>
<th class="text-right">High</th>
<th class="text-right">Low</th>
<th class="text-right">Close</th>
<th class="text-right">Volume</th>
<th class="text-right">Market Cap</th>
</tr>
</thead>
<tbody>
<tr class="text-right">
<td class="text-left">May 16, 2018</td>
<td data-format-fiat data-format-value="8504.41">8504.41</td>
<td data-format-fiat data-format-value="8508.43">8508.43</td>
<td data-format-fiat data-format-value="8175.49">8175.49</td>
<td data-format-fiat data-format-value="8368.83">8368.83</td>
<td data-format-market-cap data-format-value="6760220000.0">6,760,220,000</td>
<td data-format-market-cap data-format-value="1.44878e+11">144,878,000,000</td>
</tr>
...
</tbody>
</table>

*/
_get(currency, from, to, sortDesc)
{
    let options = {};
    options.json = false;
    options.timeout = DEFAULT_SOCKETTIMEOUT;
    options.method = 'GET';
    options.url = util.format(BASE_URL, currency);
    options.qs = {start:from,end:to};
    let self = this;
    return new Promise((resolve, reject) => {
        if (debug.enabled)
        {
            debug(`Retrieving history for ${JSON.stringify(options.qs)}`);
        }
        request(options, function (error, response, body) {
            if (null !== error || 200 != response.statusCode)
            {
                return reject({error:error,response:response,body:body});
            }
            let list = [];
            const dom = htmlparser2.parseDOM(body);
            const trList = CSSselect.selectAll('table tbody tr', dom);
            _.forEach(trList, (tr, trIndex) => {
                let tdList = CSSselect.selectAll('td', tr);
                // not enough column ?
                if (mapping.length != tdList.length)
                {
                    // no date (ie single column <td colspan="7">No data was found for the selected time period.</td> )
                    if (1 == tdList.length && 1 == trList.length)
                    {
                        return false;
                    }
                    logger.warn("Could not parse Coin Market Cap historical data for '%s' (row #%d) : got %d columns instead of %d", currency, trIndex, tdList.length, mapping.length);
                    return false;
                }
                let entry = {};
                _.forEach(tdList, (td, tdIndex) => {
                    entry[mapping[tdIndex]] = 0 != tdIndex ? self._parseFloat(td) : self._parseDate(td);
                });
                // coin market cap will return newest first
                if (sortDesc)
                {
                    list.push(entry);
                }
                else
                {
                    list.unshift(entry);
                }
            });
            return resolve(list);
        });
    });
}

/**
 * Formats a date to yyyymmdd
 *
 * @param {object} date date object
 * @param {string} separator (optional, default = '-')
 * @return {string} yyyy{separator}mm{separator} (ex: yyyy-mm-dd if separator is '-'s)
 */
_formatDate(date, separator)
{
    if (undefined === separator)
    {
        separator = '-';
    }
    let day = date.getDate();
    if (day < 10)
    {
        day = '0' + day;
    }
    let month = date.getMonth() + 1;
    if (month < 10)
    {
        month = '0' + month;
    }
    return `${date.getFullYear()}${separator}${month}${separator}${day}`
}

/**
 * Returns float value after parsing a node
 *
 * @param {object} DOM node
 * @return {float} float value of null if value is undefined
 */
_parseFloat(node)
{
    if (undefined === node.attribs['data-format-value'] || '-' == node.attribs['data-format-value'])
    {
        return null;
    }
    let value = parseFloat(node.attribs['data-format-value']);
    if (isNaN(value))
    {
        return null;
    }
    return value;
}

/**
 * Returns string representation of a date after parsing a node
 *
 * @param {object} DOM node
 * @return {string} yyyy-mm-dd
 */
_parseDate(node)
{
    let data = node.children[0].data;
    let date = new Date(data);
    return this._formatDate(date, '-');
}


}

module.exports = Scraper;
