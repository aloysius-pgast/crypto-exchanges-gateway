import React, { Component } from 'react';

//-- components
import MarketOverviewTickers from '../../components/MarketOverviewTickers';
import serviceRegistry from '../../lib/ServiceRegistry';
import starredPairs from '../../lib/StarredPairs';

class MarketOverview extends Component
{

constructor(props) {
   super(props);
   this._starredPairs = [];
   let list = starredPairs.getStarredPairs();
   _.forEach(list, (entry) => {
       let name = serviceRegistry.getExchangeName(entry.exchange);
       // exchange is not supported anymore
       if (undefined === name)
       {
           return;
       }
       this._starredPairs.push(entry);
   });
   this.state = {}
}

componentWillReceiveProps(nextProps) {}

componentDidMount() {}

render()
{
    const NoFavouritePair = () => {
        if (0 == this._starredPairs.length)
        {
            return (
                <div style={{color:'#e64400'}}>
                    You have no favourite pair for the moment.
                    <br/>
                </div>
            )
        }
        return null
    }
    return (
      <div className="animated fadeIn">
        <br/>
        <NoFavouritePair/>
        <MarketOverviewTickers pairs={this._starredPairs}/>
      </div>
    )
}

}

export default MarketOverview;
