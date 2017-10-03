import React, { Component } from 'react';
import serviceRegistry from '../../lib/ServiceRegistry';

//-- components
import DemoModeWarning from '../../components/DemoModeWarning';
import Balances from '../../components/Balances';

class MyBalances extends Component
{

constructor(props) {
   super(props);
   this.state = {
       exchange:null
   };
   this._demoMode = false;
}

componentWillReceiveProps(nextProps)
{
    let exchange = nextProps.data.exchange;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchange);
    this.setState(function(prevState, props){
        return {exchange:exchange};
    });
}

componentDidMount()
{
    let exchange = this.props.data.exchange;
    this._demoMode = serviceRegistry.checkExchangeDemoMode(exchange);
    this.setState(function(prevState, props){
        return {exchange:exchange};
    });
}

render()
{
    if (null === this.state.exchange)
    {
        return null;
    }

    const DemoMode = () => {
        if (!this._demoMode)
        {
            return null
        }
        return (
            <div>
                <br/>
                <DemoModeWarning type="exchange" exchange={this.state.exchange}/>
            </div>
        )
    }

    return (
      <div className="animated fadeIn">
        <DemoMode/>
        <br/>
        <Balances exchange={this.state.exchange}/>
      </div>
    )
}

}

export default MyBalances;
