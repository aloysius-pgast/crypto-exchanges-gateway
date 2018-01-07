class TradingViewHelper
{

constructor() {}

hasChartSupport(exchange)
{
    switch (exchange)
    {
        case 'bittrex':
        case 'poloniex':
        case 'binance':
            return true;
    }
    return false;
}

getChartId(exchange, pair)
{
    let arr = pair.split('-');
    switch (exchange)
    {
        case 'bittrex':
            return 'BITTREX:' + arr[1] + arr[0];
        case 'poloniex':
            return 'POLONIEX:' + arr[1] + arr[0];
        case 'binance':
            return 'BINANCE:' + arr[1] + arr[0];
    }
    return null;
}

}

export default new TradingViewHelper();
