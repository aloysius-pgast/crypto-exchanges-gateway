import React, { Component } from 'react';

class ComponentLoadingSpinner extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
}

render()
{
    return (
        <i className="fa fa-spinner fa-spin" style={{fontSize:'1.0rem'}}/>
    )
}

}

export default ComponentLoadingSpinner;
