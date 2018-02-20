import React, { Component } from 'react';
import Big from 'big.js';
import ComponentLoadedTimestamp from '../../components/ComponentLoadedTimestamp';

class PortfolioBalances extends Component
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
}

_handleManualRefresh()
{
    if (undefined !== this._props.OnRefresh)
    {
        this._props.OnRefresh();
    }
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps) {
    this._initializeData(nextProps);
}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    let classNames = 'col-lg-5 p-0';
    if (this._props.isFirstLoad)
    {
        classNames = 'animated fadeIn col-lg-5 p-0';
    }
    return (
        <div className={classNames}>
          <ComponentLoadedTimestamp isRefreshing={this._props.isRefreshing} timestamp={this._props.updateTimestamp} err={this._props.err} onManualRefresh={undefined === this._props.OnRefresh ? undefined : this._handleManualRefresh}/>
          <table className="table table-responsive table-sm" style={{fontSize:'0.80rem'}}>
            <thead className="thead-inverse">
              <tr>
                <th style={{width:'10%'}}>CURRENCY</th>
                <th className="text-right">VALUE</th>
                <th className="text-right">PERCENT</th>
                <th className="text-right">VOLUME</th>
              </tr>
              </thead>
              <tbody>
              {
                _.map(this._props.data.balances, (item, index) => {
                  let stylePrice = {};
                  let titlePrice = '';
                  if (item.unknownPrice)
                  {
                      stylePrice={color:'#e64400'};
                      titlePrice = 'Value is unknown';
                  }
                  return <tr key={index}>
                      <td>{item.currency}</td>
                      <td className="text-right"><span title={titlePrice} style={stylePrice}>{item.price.toFixed(2)}</span></td>
                      <td className="text-right">{item.pricePercent.toFixed(2)} %</td>
                      <td className="text-right">{item.volume.toFixed(4)}</td>
                  </tr>
                })
              }
              </tbody>
            </table>
        </div>
    )
}

}

export default PortfolioBalances;
