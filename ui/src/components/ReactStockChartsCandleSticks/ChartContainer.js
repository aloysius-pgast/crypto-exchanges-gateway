import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import SaveChartAsImage from 'react-stockcharts/lib/helper/SaveChartAsImage';
import ToolBar from './ToolBar';
import Chart from './Chart';

const klinesPeriods = [
    {period:'4h', periodLabel:'4 hours', interval:'1m', count:240},
    {period:'12h', periodLabel:'12 hours', interval:'3m', count:240},
    {period:'1d', periodLabel:'1 day', interval:'5m', count:288},
    {period:'3d', periodLabel:'3 days', interval:'15m', count:288},
    {period:'7d', periodLabel:'7 days', interval:'30m', count:336},
    {period:'15d', periodLabel:'15 days', interval:'1h', count:360},
    {period:'1M', periodLabel:'1 month', interval:'2h', count:360},
    {period:'3M', periodLabel:'3 months', interval:'6h', count:360},
    {period:'6M', periodLabel:'6 months', interval:'12h', count:360},
    {period:'1Y', periodLabel:'1 year', interval:'1d', count:365}
]
const klinesPeriodToKlinesInterval = {};
const klinesIntervalToKlinesPeriod = {};
_.forEach(klinesPeriods, (e) => {
    klinesPeriodToKlinesInterval[e.period] = e;
    klinesIntervalToKlinesPeriod[e.interval] = e;
});

class ChartContainer extends Component {

constructor(props) {
    super(props);
    this._isMounted = false;
    this.state = {
        data:{loaded:false, data:null, err:null, refreshPeriod:0},
        klinesInterval:this.props.klinesInterval,
        klinesPeriod:this._klineIntervalToKlinePeriod(this.props.klinesInterval),
        count:225,
        dimensions:null,
        reset:true
    }
    this._klinesPeriods = [];
    // update periods
    _.forEach(this.props.klinesIntervals, (e) => {
        if (undefined !== klinesIntervalToKlinesPeriod[e])
        {
            this._klinesPeriods.push(klinesIntervalToKlinesPeriod[e]);
        }
    });
    if (undefined !== klinesIntervalToKlinesPeriod[this.props.klinesInterval])
    {
        this.state.count = klinesIntervalToKlinesPeriod[this.props.klinesInterval].count;
    }
    this._parentNode = null;
    this._chart = null;
    this._timer = null;
    this.handleSelectKlinesInterval = this.handleSelectKlinesInterval.bind(this);
    this.handleSelectKlinesPeriod = this.handleSelectKlinesPeriod.bind(this);
    this.handleSaveImage = this.handleSaveImage.bind(this);
}

_klineIntervalToKlinePeriod(interval)
{
    if (undefined === interval)
    {
        return null;
    }
    if (undefined === klinesIntervalToKlinesPeriod[interval])
    {
        return null;
    }
    return klinesIntervalToKlinesPeriod[interval].period;
}

loadData(isRefresh) {
    if (null !== this._timer)
    {
        clearTimeout(this._timer);
        this._timer = null;
    }
    if (undefined === isRefresh)
    {
        isRefresh = false;
    }
    let klinesInterval = this.state.klinesInterval;
    if (!isRefresh)
    {
        this.setState({reset:!isRefresh, data:{loaded:false, data:null, err:null, refreshPeriod:0}}, () => {
            let refreshPeriod = this.state.data.refreshPeriod;
            this.props.onLoadData(klinesInterval).then((result) => {
                if (!this._isMounted || klinesInterval !== this.state.klinesInterval)
                {
                    return;
                }
                if (undefined !== result.refreshPeriod)
                {
                    refreshPeriod = result.refreshPeriod;
                }
                this.setState({reset:true, data:{loaded:true, data:result.data, err:null, refreshPeriod:refreshPeriod}}, () => {
                    if (0 !== refreshPeriod)
                    {
                        if (null !== this._timer)
                        {
                            clearTimeout(this._timer);
                        }
                        this._timer = setTimeout(() => {
                            this.loadData(true);
                        }, refreshPeriod);
                    }
                });
            }).catch ((e) => {
                if (!this._isMounted || klinesInterval !== this.state.klinesInterval)
                {
                    return;
                }
                this.setState({reset:!isRefresh, data:{loaded:true, data:null, err:e, refreshPeriod:0}});
            });
        });
    }
    else
    {
        let refreshPeriod = this.state.data.refreshPeriod;
        this.props.onLoadData(klinesInterval).then((result) => {
            if (!this._isMounted || klinesInterval !== this.state.klinesInterval)
            {
                return;
            }
            if (undefined !== result.refreshPeriod)
            {
                refreshPeriod = result.refreshPeriod;
            }
            this.setState((prevState, props) => {
                let data = prevState.data;
                data.data = result.data;
                data.err = null;
                data.refreshPeriod = refreshPeriod
                return {reset:!isRefresh, data:data};
            }, () => {
                if (0 !== refreshPeriod)
                {
                    if (null !== this._timer)
                    {
                        clearTimeout(this._timer);
                    }
                    this._timer = setTimeout(() => {
                        this.loadData(true);
                    }, refreshPeriod);
                }
            });
        }).catch ((e) => {
            console.error(e);
            if (!this._isMounted || klinesInterval !== this.state.klinesInterval)
            {
                return;
            }
            this.setState((prevState, props) => {
                let data = prevState.data;
                data.err = e;
                return {reset:!isRefresh, data:data};
            }, () => {
                if (0 !== refreshPeriod)
                {
                    if (null !== this._timer)
                    {
                        clearTimeout(this._timer);
                    }
                    this._timer = setTimeout(() => {
                        this.loadData(true);
                    }, refreshPeriod);
                }
            });
        });
    }
}

_recomputeDimensions(cb) {
    if (!this._isMounted)
    {
        return;
    }
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
    this._recomputeDimensions(() => {
        this.loadData(false);
    });
    window.addEventListener('resize', () => {
        this._recomputeDimensions();
    });
}

componentWillUnmount() {
    this._isMounted = false;
    window.removeEventListener('resize', this._recomputeDimensions);
}

handleSelectKlinesInterval(interval)
{
    if (!this._isMounted)
    {
        return;
    }
    let count = 225;
    if (undefined !== klinesIntervalToKlinesPeriod[interval])
    {
        count = klinesIntervalToKlinesPeriod[interval].count;
    }
    this.setState((prevState, props) => {
        return {klinesInterval:interval,count:count};
    }, function(){
        this.loadData(false);
        if (undefined != this.props.onSelectKlinesInterval)
        {
            this.props.onSelectKlinesInterval(this.state.klinesInterval);
        }
    });
}

handleSelectKlinesPeriod(period)
{
    if (!this._isMounted)
    {
        return;
    }
    let klinesInterval = klinesPeriodToKlinesInterval[period].interval;
    let count = klinesPeriodToKlinesInterval[period].count;
    this.setState((prevState, props) => {
        return {klinesInterval:klinesInterval,count:count};
    }, function(){
        this.loadData(false);
        if (undefined != this.props.onSelectKlinesInterval)
        {
            this.props.onSelectKlinesInterval(this.state.klinesInterval);
        }
    });
}

handleSaveImage()
{
    let container = ReactDOM.findDOMNode(this._chart);
    SaveChartAsImage.saveWithBG(document, container, '#131722', function (src) {
        var a = document.createElement("a");
        a.setAttribute("href", src);
        a.setAttribute("download", "chart.png");
        document.body.appendChild(a);
        a.addEventListener("click", function () /* e */{
            a.parentNode.removeChild(a);
        });
        a.click();
    });
}

render() {
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
    if (!this.state.data.loaded)
    {
        return (
            <div style={{height:this.state.dimensions.height,display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#131722'}}>
                <i style={{color:'#ffffff',fontSize:'5.0rem'}} className="fa fa-spinner fa-spin"></i>
            </div>
        );
    }
    if (null === this.state.data.data && null !== this.state.data.err)
    {
        let color = '#ce1126';
        let message = this.state.data.err.message;
        if (undefined !== this.state.data.err.extError)
        {
            message = this.state.data.err.error;
        }
        return (
            <div style={{height:this.state.dimensions.height,display:'flex',alignItems:'center',backgroundColor:'#131722'}}>
                <table style={{width:'100%'}}>
                    <tbody>
                        <tr>
                            <td style={{width:'100%',textAlign:'center',color:color}}><i style={{fontSize:'5.0rem'}} className="fa fa-exclamation"></i></td>
                        </tr>
                        <tr><td>&nbsp;</td></tr>
                        <tr>
                            <td style={{width:'100%',textAlign:'center',color:color}}><span>{message}</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }
    const toolBarHeight = 60;
    return (
        <div style={{height:this.state.dimensions.height,color:'#ffffff',backgroundColor:'#131722'}}>
            <ToolBar height={toolBarHeight}
                klinesInterval={this.state.klinesInterval} klinesIntervals={this.props.klinesIntervals}
                klinesPeriods={this._klinesPeriods} klinesPeriod={this.state.klinesPeriod}
                onSelectKlinesInterval={this.handleSelectKlinesInterval}
                onSelectKlinesPeriod={this.handleSelectKlinesPeriod}
                onSaveImage={this.handleSaveImage}
            />
            <Chart
                ref={(node) => { if (null !== node) { this._chart = node }}}
                clamp={false}
                reset={this.state.reset}
                exchangeName={this.props.exchangeName} pair={this.props.pair} klinesInterval={this.state.klinesInterval}
                ratio={this.state.dimensions.ratio} width={this.state.dimensions.width} height={this.state.dimensions.height - toolBarHeight}
                type="hybrid" data={this.state.data.data} count={this.state.count}
            />
        </div>
    );
}

}

ChartContainer.defaultProps = {
    exchangeName:"",
    pair:"",
    klinesInterval:"5m",
    klinesIntervals:[],
    heightPercent:0.8,
    onLoadData:(interval) => {
        // no data, no refresh
        return Promise.resolve({data:[],refreshPeriod:0});
    }
}

export default ChartContainer;
