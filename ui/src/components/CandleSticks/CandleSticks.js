import React, { Component } from 'react';
import tradingViewHelper from '../../lib/TradingViewHelper';

class CandleSticks extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        pair:undefined === this.props.pair ? null : this.props.pair,
        supportChart:false,
        viewPort:{
            width:0,
            height:0
        }
    }
    this._updateViewPortSize = this._updateViewPortSize.bind(this);
    this._containerId = "csc_" + ((1 + Math.random()) * 1048576 | 0).toString(16).substring(1);
    this._container = null;
}

_loadChart()
{
    let timezone = 'Etc/UTC';
    if ('undefined' !== typeof Intl)
    {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    let hide_drawing_toolbar = false;
    // hide drawing toolbar on small screens
    if (window.innerWidth < 768)
    {
        hide_drawing_toolbar = true;
    }
    new TradingView.widget({
      "autosize": true,
      "symbol": tradingViewHelper.getChartId(this.props.exchange, this.state.pair),
      "interval": "5",
      "range": "3d",
      "timezone": timezone,
      "theme": "Dark",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "withdateranges": true,
      "hideideas": true,
      "hide_side_toolbar":hide_drawing_toolbar,
      "container_id":this._containerId
    });
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

componentDidMount()
{
    this._isMounted = true;
    if (null === this.state.pair)
    {
        return;
    }
    this._updateViewPortSize();
    this._loadChart();
    window.addEventListener('resize', this._updateViewPortSize);
}

render()
{
    if (null === this.state.pair)
    {
        return null;
    }
    let height = this.state.viewPort.height * 0.80;
    return (
        <div id={this._containerId} ref={(node) => { this._container = node; }} style={{width:'92%',height:height+'px'}}/>
    )
}

}

export default CandleSticks;
