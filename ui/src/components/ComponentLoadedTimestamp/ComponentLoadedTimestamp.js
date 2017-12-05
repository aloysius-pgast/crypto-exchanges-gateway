import React, { Component } from 'react';
import {Link} from 'react';
import dateTimeHelper from '../../lib/DateTimeHelper';

class ComponentLoadedTimestamp extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        isRefreshing:undefined === this.props.isRefreshing ? false : this.props.isRefreshing
    }
    this._handleRefresh = this._handleRefresh.bind(this);
}

_handleRefresh(e)
{
    e.preventDefault();
    this.setState((prevState, props) => {
        return {isRefreshing:true};
    }, function(){
        if (undefined !== this.props.onManualRefresh)
        {
            this.props.onManualRefresh();
        }
    });
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps)
{
    this.setState((prevState, props) => {
        return {isRefreshing:nextProps.isRefreshing};
    });
}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    const RefreshIcon = () => {
        // no manual refresh button
        if (undefined === this.props.onManualRefresh)
        {
            return null;
        }
        if (this.state.isRefreshing)
        {
            return (
                <i className="fa fa-refresh fa-spin text-dark" style={{fontSize:'1rem'}}></i>
            )
        }
        return (
            <a href="#" onClick={this._handleRefresh}><i className="fa fa-refresh text-dark" style={{fontSize:'1rem'}}></i></a>
        )
    }

    // no error
    if (null === this.props.err)
    {
        return (
          <div className="text-success" style={{marginBottom:'5px'}}>
            <span style={{fontSize:'0.92rem'}}>{dateTimeHelper.formatTime(this.props.timestamp)}</span>&nbsp;&nbsp;<RefreshIcon/>
          </div>
        )
    }
    return (
        <div className="text-danger" style={{marginBottom:'5px'}}>
            <span style={{fontSize:'0.92rem'}}>{dateTimeHelper.formatTime(this.props.timestamp)}</span>&nbsp;&nbsp;<RefreshIcon/>
        </div>
    )
}

}

export default ComponentLoadedTimestamp;
