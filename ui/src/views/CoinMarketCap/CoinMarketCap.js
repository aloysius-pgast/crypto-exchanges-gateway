import React, { Component } from 'react';

//-- components
import CoinMarketCapTickers from '../../components/CoinMarketCapTickers';

class CoinMarketCap extends Component
{

constructor(props) {
   super(props);
   this.state = {}
}

componentWillReceiveProps(nextProps) {}

componentDidMount() {}

render()
{
    return (
      <div className="animated fadeIn">
        <br/>
        <CoinMarketCapTickers limit="20"/>
      </div>
    )
}

}

export default CoinMarketCap;
