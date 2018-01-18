import React, { Component } from 'react';
import Big from 'big.js';
import {PieChart} from 'react-d3-basic';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class PortfolioChart extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this._initializeData(props);
    this.state = {
        viewPort:{
            width:0,
            height:0
        }
    }
    this._handleManualRefresh = this._handleManualRefresh.bind(this);
    this._updateViewPortSize = this._updateViewPortSize.bind(this);
}

_initializeData(props)
{
    this._props = props;
}

_handleManualRefresh()
{
    if (undefined !== this._props.OnRefresh)
    {
        this._props.OnRefresh();
    }
}

_updateViewPortSize()
{
    this.setState({ viewPort:{width: window.innerWidth, height: window.innerHeight }});
}

componentWillUnmount()
{
    this._isMounted = false;
    window.removeEventListener('resize', this._updateViewPortSize);
}

componentWillReceiveProps(nextProps) {
    this._initializeData(nextProps);
}

componentDidMount()
{
    this._isMounted = true;
    this._updateViewPortSize();
    window.addEventListener('resize', this._updateViewPortSize);
}

render()
{
    let classNames = '';
    if (this._props.isFirstLoad)
    {
        classNames = 'animated fadeIn';
    }
    const dataName = (e) => {
        return e.currency;
    }
    const dataValue = (e) => {
        return e.price;
    }
    let width = this.state.viewPort.width * 0.95;
    if (width > 700)
    {
        width = 700;
    }
    const margins = {top: 0, right: 0, bottom: 0, left: -100};
    const height =  0.7 * width;
    const chartSeries = [];
    _.forEach(this._props.data.balances, (e) => {
        if (e.pricePercent > 1)
        {
            chartSeries.push({
                "field":e.currency,
                "name":e.currency
            })
        }
    });
    if (0 == chartSeries.length)
    {
        return null;
    }
    return (
        <div className={classNames}>
          <ComponentLoadedTimestamp isRefreshing={this._props.isRefreshing} timestamp={this._props.updateTimestamp} err={this._props.err} onManualRefresh={undefined === this._props.OnRefresh ? undefined : this._handleManualRefresh}/>
          <PieChart
            title="Portfolio"
            data={this._props.data.balances}
            margins={margins}
            width={width}
            height={height}
            chartSeries={chartSeries}
            value={dataValue}
            name={dataName}
          />
        </div>
    )
}

}

export default PortfolioChart;
