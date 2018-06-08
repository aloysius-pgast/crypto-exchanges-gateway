import React from "react";
import PropTypes from "prop-types";

import { format } from "d3-format";
import { timeFormat } from "d3-time-format";

import { ChartCanvas, Chart, ZoomButtons } from "react-stockcharts";
import {
	BarSeries,
	CandlestickSeries,
} from "react-stockcharts/lib/series";
import { XAxis, YAxis } from "react-stockcharts/lib/axes";
import {
	CrossHairCursor,
    EdgeIndicator,
	MouseCoordinateX,
	MouseCoordinateY,
} from "react-stockcharts/lib/coordinates";

import { discontinuousTimeScaleProvider } from "react-stockcharts/lib/scale";
import { last } from "react-stockcharts/lib/utils";

import OHLCTooltip from './OHLCTooltip';

const getPrecision = (floatValue) => {
    let arr = floatValue.toFixed(8).replace(/0+$/g, '').split('.');
    return (arr.length > 1) ? (arr[1].length) : 0;
}

class CandleStickChartWithDarkTheme extends React.Component {

    constructor(props) {
		super(props);
        this._isMounted = false;
        let scale = this._computeScale(this.props.data);
        this.state = {
            pricePrecision:this._computePricePrecision(this.props.data),
            xExtents:scale.xExtents,
            domain:scale.domain
        }
        this.handleReset = this.handleReset.bind(this);
	}

    _computePricePrecision(data)
    {
        // find min & max
        let min = null, max = null;
        for (let i = 0; i < data.length; ++i)
        {
            if (null !== data[i].low)
            {
                if (null === min || data[i].low < min)
                {
                    min = data[i].low;
                }
            }
            if (null !== data[i].high)
            {
                if (null === max || data[i].high > max)
                {
                    max = data[i].high;
                }
            }
        }
        let finalPrecision = 0;
        let precision;

        // check min precision
        precision = getPrecision(min);
        if (precision > finalPrecision)
        {
            finalPrecision = precision;
        }

        // check max precision
        precision = getPrecision(max);
        if (precision > finalPrecision)
        {
            finalPrecision = precision;
        }

        return finalPrecision;
    }

    _computeScale(initialData)
    {
        const xScaleProvider = discontinuousTimeScaleProvider
			.inputDateAccessor(d => d.date);
        const {
			data,
			xScale,
			xAccessor,
		} = xScaleProvider(initialData);
        const start = xAccessor(last(data));
        const end = xAccessor(data[Math.max(0, data.length - 225)]);
        const xExtents = [start, end];
        return {
            domain:xScale.domain(),
            xExtents:xExtents
        }
    }

    componentDidMount() {
        this._isMounted = true;
        this.node.subscribe("myUniqueId", { listener: this.handleEvents.bind(this) })
    }

    componentWillMount() {
		this.setState({
			suffix: 1
		});
	}

    componentWillUnmount() {
        this._isMounted = false;
        this.node.unsubscribe("myUniqueId")
    }

    handleEvents (type, moreProps, state) {
        if (!this._isMounted)
        {
            return;
        }
        // save xScale when user zoom or pan
        if ('panend' === type)
        {
            this.setState({domain:moreProps.xScale.domain()});
        }
        else if ('zoom' === type)
        {
            // nothing to do here, if we save the domain, zoom won't work anymore
        }
    }

    handleReset() {
		this.setState({
			suffix: this.state.suffix + 1
		});
	}

    componentWillReceiveProps(nextProps)
    {
        const precision = this._computePricePrecision(nextProps.data);
        let newState = {precision:precision};
        if (nextProps.reset)
        {
            const scale = this._computeScale(nextProps.data);
            newState.domain = scale.domain;
            newState.xExtents = scale.xExtents;
        }
        this.setState(newState);
    }

	render() {
        const { mouseMoveEvent, panEvent, zoomEvent, zoomAnchor } = this.props;
		const { type, data: initialData, width, height, ratio, clamp } = this.props;

		const margin = { left: 50, right: 90, top: 20, bottom: 30 };

        const gridHeight = height;
		const gridWidth = width;
        const canvasHeight = height;
        const candleSticksChartHeight = Math.floor(canvasHeight - margin.top - margin.bottom);
        const volumeChartHeight = Math.floor(canvasHeight - margin.top - margin.bottom);

		const showGrid = true;
		const yGrid = showGrid ? { innerTickSize: -1 * gridWidth, tickStrokeOpacity: 0.2 } : {};
		const xGrid = showGrid ? { innerTickSize: -1 * gridHeight, tickStrokeOpacity: 0.2 } : {};
		const xScaleProvider = discontinuousTimeScaleProvider
			.inputDateAccessor(d => d.date);
		const {
			data,
            xScale,
			xAccessor,
			displayXAccessor,
		} = xScaleProvider(initialData);

        const xExtents = this.state.xExtents;
        xScale.domain(this.state.domain);

        let displayOHLC = false;
        let displayExchange = false;
        if (width < 600)
        {
            displayExchange = true;
        }
        else if (width < 1024)
        {
            displayOHLC = true;
        }
        else
        {
            displayExchange = true;
            displayOHLC = true;
        }

        // how many ticks to display on x axis
        let xTicks = undefined;
        if (width < 600)
        {
            xTicks = 3;
        }
        else if (width < 1024)
        {
            xTicks = 5;
        }

		return (
			<ChartCanvas height={canvasHeight}
				width={width}
				ratio={ratio}
				margin={margin}
                mouseMoveEvent={mouseMoveEvent}
				panEvent={panEvent}
				zoomEvent={zoomEvent}
				zoomAnchor={zoomAnchor}
				type={type}
                seriesName={`MSFT_${this.state.suffix}`}
				data={data}
                clamp={clamp}
				xScale={xScale}
				xAccessor={xAccessor}
				displayXAccessor={displayXAccessor}
				xExtents={xExtents}
                ref={node => { this.node = node; } }
			>

                <Chart id={1}
                    yExtents={d => d.volume}
                    height={volumeChartHeight} origin={(w, h) => [0, candleSticksChartHeight - volumeChartHeight]}
                >
                    <XAxis axisAt="bottom" orient="bottom"
                        {...xGrid}
                        tickStroke="#FFFFFF"
                        stroke="#FFFFFF"
                        showTicks={true}
                        ticks={xTicks}
                        tickFormat={(index) => {
                            let point = initialData[index];
                            let format;
                            if (true === point.year)
                            {
                                format = timeFormat("%Y");
                            }
                            else if (true === point.month)
                            {
                                format = timeFormat("%b");
                            }
                            else if (true === point.day)
                            {
                                format = timeFormat("%d");
                            }
                            else
                            {
                                format = timeFormat("%H:%M");
                            }
                            return format(point.date);
                        }}
                    />
                    <YAxis axisAt="left" orient="left" ticks={5} tickFormat={format(".2s")}
                        tickStroke="#FFFFFF" />
                    <BarSeries
                        yAccessor={d => d.volume}
                        fill={d => d.close >= d.open ? "#346a56" : "#823240"}
                        opacity={0.58}
                        />

                    <MouseCoordinateY
                        at="left"
                        orient="left"
                        displayFormat={format(".4s")}
                    />
                </Chart>

    			<Chart id={2} height={candleSticksChartHeight}
    				yExtents={[d => [d.high, d.low]]}
    				padding={{ top: 10, bottom: 20 }}
    			>

        			<YAxis axisAt="right" orient="right" ticks={5} {...yGrid} inverted={true}
        				tickStroke="#FFFFFF"
                        zoomEnabled={zoomEvent}
                        tickFormat={format(`.${this.state.pricePrecision}f`)}
                    />
        			<XAxis axisAt="bottom" orient="bottom" showTicks={false} outerTickSize={0}
        				stroke="#FFFFFF" opacity={0.5}
                        zoomEnabled={zoomEvent}
                    />

                    <MouseCoordinateX
        				at="bottom"
        				orient="bottom"
        				displayFormat={timeFormat("%Y-%m-%d %H:%M:%S")}
                    />

        			<MouseCoordinateY
        				at="right"
        				orient="right"
        				displayFormat={format(`.${this.state.pricePrecision}f`)}
                    />

        			<CandlestickSeries
        				stroke={d => d.close >= d.open ? "#53b987" : "#eb4d5c"}
        				wickStroke={d => d.close >= d.open ? "#53b987" : "#eb4d5c"}
        				fill={d => d.close >= d.open ? "#53b987" : "#eb4d5c"}
                        opacity={1}
                    />

        			<EdgeIndicator itemType="last" orient="right" edgeAt="right"
        				yAccessor={d => d.close}
                        fill={
                            (d) => {
                                return d.close >= d.open ? "#53b987" : "#eb4d5c"
                            }
                        }
                        displayFormat={format(`.${this.state.pricePrecision}f`)}
                    />

        			<OHLCTooltip
                        textFill={
                            (d) => {
                                if (undefined === d)
                                {
                                    return '#ffffff';
                                }
                                return d.close >= d.open ? "#53b987" : "#eb4d5c"
                            }
                        }
                        displayOHLC={displayOHLC}
                        displayExchange={displayExchange}
                        exchangeName={this.props.exchangeName}
                        pair={this.props.pair}
                        klinesInterval={this.props.klinesInterval}
                        labelFill="#ffffff"
                        origin={[0, -6]}
                        fontSize={15}
                        ohlcFormat={format(`.${this.state.pricePrecision}f`)}
                    />

                    <ZoomButtons
        				onReset={this.handleReset}
                        size={[40,40]}
        			/>
        		</Chart>
		        <CrossHairCursor opacity={1} stroke="#FFFFFF" />
	        </ChartCanvas>
		);
	}
}
CandleStickChartWithDarkTheme.propTypes = {
	data: PropTypes.array.isRequired,
	width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
	ratio: PropTypes.number.isRequired,
    exchangeName: PropTypes.string,
    pair: PropTypes.string,
    klinesInterval: PropTypes.string,
    reset: PropTypes.bool,
	type: PropTypes.oneOf(["svg", "hybrid"]).isRequired,
};

CandleStickChartWithDarkTheme.defaultProps = {
	type: "hybrid",
    exchangeName: '',
    pair: '',
    klinesInterval: '',
    reset:true
};

export default CandleStickChartWithDarkTheme;
