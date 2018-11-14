class FormatNumber
{

constructor() {}

/**
 * Format a float number
 *
 * @param {float} n float number to format
 * @param {integer} precision number of significant digits if abs(number) > 1, number of digits after the floating point otherwise
 * @param {boolean} opt.truncate if true, trailing 0 will be removed (default = false)
 * @return {string}
 */
formatFloat(n, precision, opt)
{
    let truncate = false;
    if (undefined !== opt)
    {
        if (true === opt.truncate)
        {
            truncate = true;
        }
    }
    // choose best precision based on number
    let type = typeof n;
    let value;
    if ('string' == type)
    {
        value = parseFloat(n);
    }
    else if ('number' == type)
    {
        value = n;
    }
    // probably a big number
    else
    {
        value = parseFloat(n);
    }
    let str;
    if (value > 1 || value < -1)
    {
        str = value.toPrecision(precision);
        // don't use exponential notation
        if (-1 != str.indexOf('e'))
        {
            str = parseFloat(str).toString();
        }
    }
    else
    {
        str = value.toFixed(precision);
    }
    // remove trailing 0
    if (truncate)
    {
        return str.replace(/(\.[0-9]*[1-9]+)0+$/,'$1');
    }
    return str;
}

}

export default new FormatNumber();
