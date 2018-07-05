import React, { Component } from 'react';

class ToolBar extends Component {

constructor(props) {
    super(props);
    this.state  = {
        klinesInterval:props.klinesInterval,
        klinesPeriod:props.klinesPeriod
    }
    this.handleSelectKlinesInterval = this.handleSelectKlinesInterval.bind(this);
    this.handleSelectKlinesPeriod = this.handleSelectKlinesPeriod.bind(this);
    this.handleSaveImage = this.handleSaveImage.bind(this);
}

handleSelectKlinesInterval(event)
{
    let interval = event.target.value;
    this.setState((prevState, props) => {
        return {klinesInterval:interval};
    }, function(){
        this.props.onSelectKlinesInterval(interval);
    });
}

handleSelectKlinesPeriod(event)
{
    let period = event.target.value;
    this.setState((prevState, props) => {
        return {klinesPeriod:period};
    }, function(){
        this.props.onSelectKlinesPeriod(period);
    });
}

handleSaveImage(e)
{
    e.preventDefault();
    if (undefined !== this.props.onSaveImage)
    {
        this.props.onSaveImage();
    }
}

render() {

    const KlinesIntervals = () => {
        if (0 === this.props.klinesIntervals.length)
        {
            return null;
        }
        return (
            <select className="custom-select" style={{width:"100px",backgroundColor:"white"}} onChange={this.handleSelectKlinesInterval} value={this.state.klinesInterval}>
              {
                  this.props.klinesIntervals.map((interval, index) => {
                      return <option key={index} value={interval}>{interval}</option>
                  })
              }
            </select>
        )
    }

    const KlinesPeriods = () => {
        if (0 === this.props.klinesPeriods.length)
        {
            return null;
        }
        let periods = this.props.klinesPeriods;
        if (null === this.state.klinesPeriod)
        {
            periods = [{period:'',periodLabel:'Choose',interval:null}];
            _.forEach(this.props.klinesPeriods, (e) => {
                periods.push(e);
            });
        }
        return (
            <select className="custom-select" style={{width:"120px",marginLeft:'8px',backgroundColor:"white"}} onChange={this.handleSelectKlinesPeriod} value={null === this.state.klinesPeriod ? '' : this.state.klinesPeriod }>
              {
                  periods.map((obj, index) => {
                      return <option key={index} value={obj.period}>{obj.periodLabel}</option>
                  })
              }
            </select>
        )
    }

    const SaveImage = () => {
        if (window.ctx.isMobile)
        {
            return null;
        }
        return (
            <a className="btn" href="#"><i onClick={this.handleSaveImage} style={{fontSize:'2.0rem',color:'#536c79'}} className="fa fa-cloud-download"/></a>
        )
    }

    return (
        <div style={{display:'table',height:this.props.height,paddingLeft:'6px'}}>
            <KlinesIntervals/>
            <KlinesPeriods/>
            <SaveImage/>
        </div>
    );
}

}

ToolBar.defaultProps = {
    klinesInterval:"5m",
    klinesIntervals:[],
    klinesPeriod:"1d",
    KlinesPeriods:[],
    height:50,
    onSelectKlinesInterval:() => {},
    onSelectKlinesPeriod:() => {}
}

export default ToolBar;
