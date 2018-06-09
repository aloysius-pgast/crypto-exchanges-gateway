import React, { Component } from "react";
import PropTypes from "prop-types";
import { format } from "d3-format";
import { timeFormat } from "d3-time-format";
import GenericChartComponent from "react-stockcharts/lib/GenericChartComponent";
import displayValuesFor from "react-stockcharts/lib/tooltip/displayValuesFor";

import { isDefined, functor } from "react-stockcharts/lib/utils";
import ToolTipText from "react-stockcharts/lib/tooltip/ToolTipText";
import ToolTipTSpanLabel from "react-stockcharts/lib/tooltip/ToolTipTSpanLabel";

/*
 This is a customized version of the file provided by react-stockcharts with support for
 - text color based on close/open order (ie: green if close >= open)
 - display exchange & pair
 */

class OHLCTooltip extends Component {
	constructor(props) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
	}
	renderSVG(moreProps) {
        const { displayValuesFor } = this.props;
		const {
			accessor,
			volumeFormat,
			ohlcFormat,
			percentFormat,
			displayTexts
		} = this.props;

		const { chartConfig: { width, height } } = moreProps;

		const currentItem = displayValuesFor(this.props, moreProps);

		let open, high, low, close, volume, percent;
		open = high = low = close = volume = percent = displayTexts.na;

        let item;
        if (isDefined(currentItem) && isDefined(accessor(currentItem))) {
			item = accessor(currentItem);
			volume = isDefined(item.volume) ? volumeFormat(item.volume) : displayTexts.na;
			open = ohlcFormat(item.open);
			high = ohlcFormat(item.high);
			low = ohlcFormat(item.low);
			close = ohlcFormat(item.close);
			percent = percentFormat((item.close - item.open) / item.open);
		}

		const { origin: originProp } = this.props;
		const origin = functor(originProp);
		const [x, y] = origin(width, height);

		const itemsToDisplay = {
			open,
			high,
			low,
			close,
			percent,
			volume,
			x,
			y,
            item
		};
		return this.props.children(this.props, moreProps, itemsToDisplay);
	}
	render() {
		return (
			<GenericChartComponent
				clip={false}
				svgDraw={this.renderSVG}
				drawOn={["mousemove"]}
			/>
		);
	}
}

OHLCTooltip.propTypes = {
	className: PropTypes.string,
	accessor: PropTypes.func,
	xDisplayFormat: PropTypes.func,
	children: PropTypes.func,
	volumeFormat: PropTypes.func,
	percentFormat: PropTypes.func,
	ohlcFormat: PropTypes.func,
	origin: PropTypes.oneOfType([PropTypes.array, PropTypes.func]),
	fontFamily: PropTypes.string,
	fontSize: PropTypes.number,
	onClick: PropTypes.func,
	displayValuesFor: PropTypes.func,
	textFill: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
	labelFill: PropTypes.string,
	displayTexts: PropTypes.object,
    displayOHLC: PropTypes.bool.isRequired,
    displayExchange: PropTypes.bool.isRequired,
    exchangeName: PropTypes.string.isRequired,
    pair: PropTypes.string.isRequired,
    klinesInterval: PropTypes.string.isRequired,
};

const displayTextsDefault = {
	o: " O: ",
	h: " H: ",
	l: " L: ",
	c: " C: ",
	v: " V: ",
	na: "n/a"
};

OHLCTooltip.defaultProps = {
	accessor: d => {
		return {
			open: d.open,
			high: d.high,
			low: d.low,
			close: d.close,
			volume: d.volume
		};
	},
	xDisplayFormat: timeFormat("%Y-%m-%d"),
	volumeFormat: format(".4s"),
	percentFormat: format(".2%"),
	ohlcFormat: format(".2f"),
	displayValuesFor: displayValuesFor,
	origin: [0, 0],
	children: defaultDisplay,
	displayTexts: displayTextsDefault,
};

function defaultDisplay(props, moreProps, itemsToDisplay) {

	/* eslint-disable */
	const {
		className,
		labelFill,
		onClick,
		fontFamily,
		fontSize,
		displayTexts
	} = props;
	/* eslint-enable */

	const {
		open,
		high,
		low,
		close,
		volume,
		x,
		y,
        item
	} = itemsToDisplay;

    const textFill = functor(props.textFill)(item);

    const renderToolTipTSpanLabel = (k) => {
        if (!props.displayOHLC)
        {
            return null;
        }
        return (
            <ToolTipTSpanLabel fill={labelFill} key={'label_' + k}>{displayTexts[k]}</ToolTipTSpanLabel>
        )
    }

    const renderTspan = (k, val) => {
        if (!props.displayOHLC)
        {
            return null;
        }
        return (
            <tspan key={'value_' + k} fill={textFill}>{val}</tspan>
        )
    }

    const renderExchangeInfo = () => {
        if (!props.displayExchange || ('' === props.exchangeName && '' === props.pair && '' === props.klinesInterval))
        {
            return null;
        }
        let s = props.exchangeName.toUpperCase();
        if ('' !== props.pair)
        {
            if (s !== '')
            {
                s += ' '
                s += props.pair;
            }
        }
        if ('' !== props.klinesInterval)
        {
            if (s !== '')
            {
                s += ' '
                s += props.klinesInterval;
            }
        }
        return (
            <ToolTipTSpanLabel style={{marginRight:'100px'}} fill={labelFill} key={'label_exchange'}>{s}&nbsp;</ToolTipTSpanLabel>
        )
    }

    return (
		<g
			className={`react-stockcharts-tooltip-hover ${className}`}
			transform={`translate(${x}, ${y})`}
			onClick={onClick}
		>
			<ToolTipText
				x={0}
				y={0}
				fontFamily={fontFamily}
				fontSize={fontSize}
			>
                {renderExchangeInfo()}
                {renderToolTipTSpanLabel('o')}
                {renderTspan('o', open)}
                {renderToolTipTSpanLabel('h')}
                {renderTspan('h', high)}
                {renderToolTipTSpanLabel('l')}
                {renderTspan('l', low)}
                {renderToolTipTSpanLabel('c')}
                {renderTspan('c', close)}
                {renderToolTipTSpanLabel('v')}
                {renderTspan('v', volume)}
			</ToolTipText>
		</g>
	);
}

export default OHLCTooltip;
