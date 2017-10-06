import React, { Component } from 'react';

//-- components
import MarketOverviewTickers from '../../components/MarketOverviewTickers';

class MarketOverview extends Component
{

constructor(props) {
   super(props);
   this._starredPairs = [];
   this.state = {}
   this._loadStarredPairs();
}

_loadStarredPairs()
{
    if (!window.ctx.hasLocalStorage)
    {
        return;
    }
    let keys = [];
    for (var i = 0; i < window.localStorage.length; i++)
    {
        let key = window.localStorage.key(i);
        if (!key.startsWith('starredPair:'))
        {
            continue;
        }
        keys.push(key);
    }
    if (0 == keys.length)
    {
        return;
    }
    let self = this;
    let pairs = [];
    _.forEach(keys, (k) => {
        let data = window.localStorage.getItem(k);
        if (null === data)
        {
            return;
        }
        let obj = JSON.parse(data);
        pairs.push(obj);
    });
    this._starredPairs = pairs.sort(function(a,b){
        return a.timestamp > b.timestamp ? -1 : 1;
    });
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
