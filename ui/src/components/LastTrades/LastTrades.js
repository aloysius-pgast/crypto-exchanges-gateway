import React, { Component } from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';
import routeRegistry from '../../lib/RouteRegistry';
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class LastTrades extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this._initializeData(props);
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
}

_initializeData(props)
{
    this._props = props;
    let arr = props.pair.split('-');
    this._baseCurrency = arr[0];
    this._currency = arr[1];
    this._baseUrl = null;
    this._getBaseUrl();
}

_getBaseUrl()
{
    let routes = routeRegistry.getExchangesRoutes(this._props.exchange);
    if (undefined !== routes[this._props.exchange]['newOrder'])
    {
        this._baseUrl = '#' + routes[this._props.exchange]['newOrder']['path'] + '/';
    }
}

_handleManualRefresh()
{
    if (undefined !== this._props.OnRefresh)
    {
        this._props.OnRefresh();
    }
}

_handlePageClick(pageNumber, e) {
    e.preventDefault();
    if (undefined !== this._props.OnSelectPage)
    {
        this._props.OnSelectPage(pageNumber);
    }
}

componentWillUnmount()
{
    this._isMounted = false;
    // reset document title
    document.title = 'My Personal Exchange';
}

componentWillReceiveProps(nextProps) {}

shouldComponentUpdate(nextProps, nextState)
{
    if (this._props.updateTimestamp != nextProps.updateTimestamp || this._props.page != nextProps.page || this._props.pages != nextProps.pages ||
        this._props.exchange != nextProps.exchange || this._props.pair != nextProps.pair ||
        this._props.loaded != nextProps.loaded || this._props.isRefreshing != nextProps.isRefreshing)
    {
        this._initializeData(nextProps);
        return true;
    }
    //console.log(`Trades : no update`);
    return false;
}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    if (!this._props.loaded)
    {
        return (
            <ComponentLoadingSpinner/>
        )
    }

    let self = this;

    const trades = () => {
        if (null === this._props.data)
        {
            return null;
        }
        if (this._props.data.length < this._props.pageSize)
        {
            for (var i = this._props.data.length; i < this._props.pageSize; ++i)
            {
                this._props.data.push({pad:true});
            }
        }
        return _.map(this._props.data, (item, index) => {
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
            if ('sell' == item.orderType)
            {
                classNamesRate = "text-danger";
            }
            // no link to newOrder if we don't have api key & secret
            if (null !== self._baseUrl)
            {
                let rateUrl = self._baseUrl + self.props.pair + '/' + item.rate;
                let priceUrl = rateUrl + '/' + item.quantity;
                return <tr key={index}>
                    <td>{dateTimeHelper.formatDateTime(item.timestamp * 1000)}</td>
                    <td className="text-right"><a className={classNamesRate} href={rateUrl}>{item.rate.toFixed(8)}</a></td>
                    <td className="text-right">{item.quantity.toFixed(8)}</td>
                    <td className="text-right"><a href={priceUrl}>{item.price.toFixed(8)}</a></td>
                </tr>
            }
            else
            {
                return <tr key={index}>
                    <td>{dateTimeHelper.formatDateTime(item.timestamp * 1000)}</td>
                    <td className="text-right"><span className={classNamesRate}>{item.rate.toFixed(8)}</span></td>
                    <td className="text-right">{item.quantity.toFixed(8)}</td>
                    <td className="text-right">{item.price.toFixed(8)}</td>
                </tr>
            }
        });
    };

    const pageLink = (pageNumber) => {
        if (pageNumber == this._props.page)
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
        let list = [];
        for (var i = 0 ; i < this._props.pages; ++i)
        {
            list.push(pageLink(i + 1));
        }
        return list;
    };

    const pagination = (top) => {
        if (null === this._props.data)
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

    let classNames = '';
    if (this._props.isFirstLoad)
    {
        classNames = 'animated fadeIn';
    }
    return (
        <div className={classNames}>
          <ComponentLoadedTimestamp isRefreshing={this._props.isRefreshing} timestamp={this._props.updateTimestamp} err={this._props.err} onManualRefresh={undefined === this._props.OnRefresh ? undefined : this._handleManualRefresh}/>
          {pagination(true)}
          <table className="table table-sm table-responsive" style={{fontSize:'0.80rem',marginBottom:'0px'}}>
            <thead className="thead-inverse">
              <tr>
                <th>DATE</th>
                <th className="text-right">BID/ASK ({this._baseCurrency})</th>
                <th className="text-right">QTY ({this._currency})</th>
                <th className="text-right">PRICE ({this._baseCurrency})</th>
              </tr>
              </thead>
              <tbody>
              {trades()}
              </tbody>
            </table>
            {pagination(false)}
        </div>
    )
}

}

export default LastTrades;
