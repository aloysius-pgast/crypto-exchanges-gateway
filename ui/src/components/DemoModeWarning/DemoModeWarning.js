import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';

class DemoModeWarning extends Component
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
    if ('exchange' == this.props.type)
    {
        let name = serviceRegistry.getExchangeName(this.props.exchange);
        return (
            <div style={{color:'#e64400'}}>
                {name} exchange is running in <span className="font-italic">demo mode</span>. Random data will be returned by gateway.
            </div>
        )
    }
    else
    {
        let name = serviceRegistry.getServiceName(this.props.service);
        <div style={{color:'#e64400'}}>
            {name} service is running in <span className="font-italic">demo mode</span>. Random data will be returned by gateway.
        </div>
    }
}

}

export default DemoModeWarning;
