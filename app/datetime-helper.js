"use strict";

let utcOffset = 0;

// used to compute utc offset in seconds (negative offset means we're ahead of utc time)
const computeUtcOffset = () => {
    utcOffset = new Date().getTimezoneOffset() * 60;
}
computeUtcOffset();
let timer = null;

class DateTimeHelper
{

/**
 * Enables / disable loop used to recompute utc offset
 *
 * @param {boolean} flag
 */
static enableRefreshLoop(flag)
{
    if (flag)
    {
        if (null !== timer)
        {
            return;
        }
        // recompute offset periodically (every 1h)
        timer = setInterval(function(){
            computeUtcOffset();
        }, 3600000);
    }
    else
    {
        if (null === timer)
        {
            return;
        }
        clearInterval(timer);
        timer = null;
    }
}

/**
 * Parses a datetime in UTC format (YYYY-mm-dd HH:MM:SS)
 * @param {date}
 * @return {integer} unix timestamp based on local timezone
 */
static parseUtcDateTime(dateTime)
{
    return parseInt(Date.parse(dateTime) / 1000.0) - utcOffset;
}

/**
 * Returns utf offset in seconds
 *
 * @return {integer} utc offset
 */
static getUtcOffset()
{
    return utcOffset;
}

}

module.exports = DateTimeHelper;
