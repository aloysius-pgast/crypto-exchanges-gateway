import React, { Component } from 'react';

class ToolBar extends Component {

constructor(props) {
    super(props);
    this.state  = {
        klinesInterval:props.klinesInterval
    }
    this.handleSelectKlinesInterval = this.handleSelectKlinesInterval.bind(this);
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
            <SaveImage/>
        </div>
    );
}

}

ToolBar.defaultProps = {
    klinesInterval:"5m",
    klinesIntervals:[],
    height:50,
    onSelectKlinesInterval:() => {}
}

export default ToolBar;
