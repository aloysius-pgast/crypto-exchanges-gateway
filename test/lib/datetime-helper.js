"use strict";
class DateTimeHelper
{

static formatTime(timestamp)
{
    let d = new Date(timestamp);
    return this._formatTime(d);
}

static formatDate(timestamp)
{
    let d = new Date(timestamp);
    return this._formatDate(d);
}

static formatDateTime(timestamp)
{
    let d = new Date(timestamp);
    return this._formatDate(d) + '_' + this._formatTime(d);
}

static _formatTime(date)
{
    let h = date.getHours();
    if (h < 10)
    {
        h = '0' + h;
    }
    let m = date.getMinutes();
    if (m < 10)
    {
        m = '0' + m;
    }
    let s = date.getSeconds();
    if (s < 10)
    {
        s = '0' + s;
    }
    return `${h}${m}${s}`;
}

static _formatDate(date)
{
    let d = date.getDate();
    if (d < 10)
    {
        d = '0' + d;
    }
    let m = date.getMonth() + 1;
    if (m < 10)
    {
        m = '0' + m;
    }
    return `${date.getFullYear()}${m}${d}`;
}

}

module.exports = DateTimeHelper;
