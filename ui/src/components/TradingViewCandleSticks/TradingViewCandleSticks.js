import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import tradingViewHelper from '../../lib/TradingViewHelper';

class TradingViewCandleSticks extends Component {

constructor(props) {
    super(props);
    this._isMounted = false;
    this.state = {
        pair:undefined === this.props.pair ? null : this.props.pair
    }
    this._parentNode = null;
    this._containerId = "csc_" + ((1 + Math.random()) * 1048576 | 0).toString(16).substring(1);
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

_recomputeDimensions(cb) {
    let style = window.getComputedStyle(this._parentNode);
    let width = parseFloat(style.width) - (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight));
    width = Math.round(Math.max(width, 100));
    let ratio = window.devicePixelRatio || 1;
    this.setState((prevState, props) => {
        let height = Math.round(window.innerHeight * props.heightPercent);
        return {dimensions:{ratio:ratio,width:width,height:height}}
    }, () => {
        if (undefined !== cb)
        {
            cb();
        }
    });
}

componentDidMount() {
    this._isMounted = true;
    if (null === this.state.pair)
    {
        return;
    }
    this._recomputeDimensions(() => {
        this._loadChart();
    });
    window.addEventListener('resize', () => {
        this._recomputeDimensions();
    });
}

componentWillUnmount() {
    this._isMounted = false;
    window.removeEventListener('resize', this._recomputeDimensions);
}

render() {
    if (null === this.state.pair)
    {
        return null;
    }
    if (null === this._parentNode)
    {
        return (
            <div ref={(node) => { if (null !== node) { this._parentNode = node.parentNode }}}>
            </div >
        );
    }
    if (null === this.state.dimensions)
    {
        return null;
    }
    return (
        <div style={{height:this.state.dimensions.height}}>
            <div id={this._containerId} style={{width:'100%',height:'100%'}}/>
        </div>
    )
}

}

TradingViewCandleSticks.defaultProps = {
    heightPercent:0.8
}


export default TradingViewCandleSticks;
