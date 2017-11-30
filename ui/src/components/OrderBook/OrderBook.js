import React, { Component } from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';
import routeRegistry from '../../lib/RouteRegistry';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class OrderBook extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        page:this.props.page
    }
    let arr = this.props.pair.split('-');
    this._baseCurrency = arr[0];
    this._currency = arr[1];
    this._data = [];
    this._baseUrl = null;
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
    this._getBaseUrl();
    this._splitData();
    // use first page if requested page does not exist
    if (this.state.page > this._data.length)
    {
        this.state.page = 1;
    }
}

_getBaseUrl()
{
    let routes = routeRegistry.getExchangesRoutes(this.props.exchange);
    if (undefined !== routes[this.props.exchange]['newOrder'])
    {
        this._baseUrl = '#' + routes[this.props.exchange]['newOrder']['path'] + '/';
    }
}

/**
 * Split data per pages
 */
_splitData()
{
    if (null === this.props.data)
    {
        return;
    }
    let maxPage = 10;
    this._data = _.slice(_.chunk(this.props.data, this.props.pageSize), 0, maxPage);
    // pad last page
    let lastPage = this._data[this._data.length - 1];
    if (lastPage.length < this.props.pageSize)
    {
        for (var i = lastPage.length; i < this.props.pageSize; ++i)
        {
            lastPage.push({pad:true});
        }
    }
}

_handleManualRefresh()
{
    if (undefined !== this.props.OnRefresh)
    {
        this.props.OnRefresh();
    }
}

_handlePageClick(pageNumber, e) {
    e.preventDefault();
    this.setState({page:pageNumber}, function(){
        if (undefined !== this.props.OnSelectPage)
        {
            this.props.OnSelectPage(this.props.orderType, pageNumber);
        }
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps) {}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    if (!this.props.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }
    let self = this;

    const orderBookEntries = () => {
        if (null === this.props.data)
        {
            return null;
        }
        return _.map(this._data[this.state.page - 1], (item, index) => {
            // only used for padding the table with empty rows
            if (item.pad)
            {
                return <tr key={index}>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                </tr>
            }
            let classNamesRate = "text-success";
            if ('sell' == this.props.orderType)
            {
                classNamesRate = "text-danger";
            }
            // no link to newOrder if we don't have api key & secret
            if (null !== self._baseUrl)
            {
                let rateUrl = self._baseUrl + self.props.pair + '/' + item.rate;
                let priceUrl = rateUrl + '/' + item.quantity;
                return <tr key={index}>
                    <td className="text-right"><a className={classNamesRate} href={rateUrl}>{item.rate.toFixed(8)}</a></td>
                    <td className="text-right">{item.quantity.toFixed(8)}</td>
                    <td className="text-right"><a href={priceUrl}>{item.price}</a></td>
                    <td className="text-right">{item.sum}</td>
                </tr>
            }
            else
            {
                return <tr key={index}>
                    <td className="text-right"><span className={classNamesRate}>{item.rate.toFixed(8)}</span></td>
                    <td className="text-right">{item.quantity.toFixed(8)}</td>
                    <td className="text-right">{item.price}</td>
                    <td className="text-right">{item.sum}</td>
                </tr>
            }
        });
    };

    const pageLink = (pageNumber) => {
        if (pageNumber == this.state.page)
        {
            return (
                <li key={pageNumber} className="page-item active"><a className="page-link border-0" href="#" onClick={this._handlePageClick.bind(this, pageNumber)}>{pageNumber}</a></li>
            )
        }
        return (
            <li key={pageNumber} className="page-item"><a className="page-link border-0" href="#" onClick={this._handlePageClick.bind(this, pageNumber)}>{pageNumber}</a></li>
        )
    };

    const pageList = () => {
        let list = _.map(this._data, (item, index) => index + 1);
        return _.map(list, (item) => pageLink(item));
    };

    const pagination = (top) => {
        if (null === this.props.data)
        {
            return null;
        }
        let style = {};
        // change margin when nav is on top
        if (top)
        {
            style={marginBottom:'0px',marginTop:'6px'}
        }
        return (
            <nav>
              <ul className="pagination pagination-sm justify-content-left" style={style}>
                {pageList()}
              </ul>
            </nav>
        );
    };

    let bidAskType = 'BID';
    if ('sell' == this.props.orderType)
    {
        bidAskType = 'ASK';
    }
    let classNames = '';
    if (this.props.isFirstLoad)
    {
        classNames = 'animated fadeIn';
    }
    return (
        <div className={classNames}>
          <ComponentLoadedTimestamp isRefreshing={this.props.isRefreshing} timestamp={this.props.loadedTimestamp} err={this.props.err} onManualRefresh={this._handleManualRefresh}/>
          {pagination(true)}
          <table className="table table-sm table-responsive" style={{fontSize:'0.80rem',marginBottom:'0px',marginTop:'0px'}}>
            <thead className="thead-inverse">
              <tr>
                <th className="text-right">{bidAskType} ({this._baseCurrency})</th>
                <th className="text-right">QTY ({this._currency})</th>
                <th className="text-right">PRICE ({this._baseCurrency})</th>
                <th className="text-right">SUM ({this._baseCurrency})</th>
              </tr>
              </thead>
              <tbody>
              {orderBookEntries()}
              </tbody>
            </table>
            {pagination(false)}
        </div>
    )
}

}

export default OrderBook;
