import React, {Component} from 'react';
import {NavLink} from 'react-router-dom';
import {Nav, NavItem} from 'reactstrap';
import ReactMarkdown from 'react-markdown';
import classNames from 'classnames';
import serviceRegistry from '../../lib/ServiceRegistry';
import routeRegistry from '../../lib/RouteRegistry';
import axios from 'axios';

class TopMenu extends Component
{

constructor(props)
{
    super(props);
    this._isMounted = false;
    this.state = {
        title:'',
        navList:[],
        help:{
            id:null,
            loaded:false,
            err:null,
            content:null,
            visible:false
        }
    }
    this._handleToggleHelp = this._handleToggleHelp.bind(this);
}

_loadHelpContent()
{
    let self = this;
    let p = {
        method:'get',
        url:'help/' + this.state.help.id + '.md'
    }
    axios(p).then(function(response) {
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
            let obj = prevState.help;
            obj.loaded = true;
            obj.err = null;
            obj.content = response.data;
            obj.visible = true;
            return {help:obj}
        });
    }).catch(function(err){
        if (!self._isMounted)
        {
            return;
        }
        self.setState((prevState, props) => {
            let obj = prevState.help;
            obj.loaded = true;
            obj.err = err;
            return {help:obj}
        });
    });
}

_handleToggleHelp(e)
{
    e.preventDefault();
    if (!this.state.help.loaded)
    {
        this._loadHelpContent();
        return;
    }
    // ignore if we couldn't load help
    if (null !== this.state.help.err)
    {
        return;
    }
    this.setState((prevState, props) => {
        let obj = prevState.help;
        obj.visible = !obj.visible;
        return {help:obj};
    });
}

_buildExchangeNavList(route, viewNames)
{
    let navList = [];
    let routes = routeRegistry.getExchangesRoutes(route.exchange)[route.exchange];
    let routeNames = ['prices','orderBooks','myOrders','newOrder','myBalances'];
    _.forEach(routeNames, function(name){
        if (route.name == name || undefined === routes[name] || undefined === viewNames[name])
        {
            return;
        }
        navList.push({
            name:viewNames[name],
            url:routes[name].path
        });
    });
    return navList;
}

_updateStateFromRoute(props)
{
    // reset
    let title = '';
    let navList = [];
    let helpId = null;
    // find matching route
    let route = routeRegistry.findRoute(props.location.pathname);
    if (undefined !== route)
    {
        if (undefined !== route.hasHelp && route.hasHelp)
        {
            helpId = route.name;
        }
        if ('exchange' === route.type)
        {
            title = serviceRegistry.getExchangeName(route.exchange);
            let viewName = '';
            let viewNames = {
                'prices':'Prices',
                'orderBooks':'Order Books',
                'myOrders':'My Orders',
                'newOrder':'New Order',
                'myBalances':'My Balances'
            }
            if (undefined !== viewNames[route.name])
            {
                viewName = viewNames[route.name];
            }
            if ('' != viewName)
            {
                title += ' / ' + viewName;
            }
            navList = this._buildExchangeNavList(route, viewNames);
        }
        else if ('service' == route.type)
        {
            title = serviceRegistry.getServiceName(route.service);
        }
        else if (undefined !== route.name)
        {
            switch (route.name)
            {
                case 'home':
                    title = 'Home';
                    break;
                case 'marketoverview':
                    title = 'Market Overview';
                    helpId = 'marketOverview';
                    break;
            }
        }
    }
    this.setState((prevState, props) => {
        return {
            title:title,
            navList:navList,
            help:{
                id:helpId,
                loaded:false,
                content:null,
                visible:false
           }
       }
   });
}

componentWillReceiveProps(nextProps)
{
    this._updateStateFromRoute(nextProps);
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._updateStateFromRoute(this.props);
}

render(){
    // nav item with nav link
    const navItem = (item, key) => {
      const classes = classNames( "nav-link", item.class);
      return (
        <NavItem key={key}>
          <NavLink to={item.url} className={ classes } >
            {item.name}
          </NavLink>
        </NavItem>
      )
    };

    const navList = (items) => {
      return items.map( (item, index) => navItem(item, index) );
    };

    const HelpIcon = () => {
        if (null === this.state.help.id)
        {
            return null
        }
        return (
            <div className="float-right">
             <a href="#" onClick={this._handleToggleHelp}><i className="fa fa-question-circle" style={{fontSize:'2rem'}}></i></a>
            </div>
        )
    }

    const HelpContent = () => {
        if (!this.state.help.visible || null !== this.state.help.err)
        {
            return null
        }
        return (
            <div className="animated fadeIn" style={{paddingLeft:'30px',width:'80%'}}>
                <br/>
                <div style={{border:'2px solid #55595a',color:'#55595a',borderRadius:'10px',paddingTop:'15px',paddingLeft:'15px'}}>
                    <ReactMarkdown source={this.state.help.content}/>
                </div>
            </div>
        )
    }

    return(
        <div>
          <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
            <span className="navbar-brand" style={{marginRight:'40px'}}>{this.state.title}</span>
            <div className="navbar-collapse collapse" id="navbarNav">
              <ul className="navbar-nav">
                {navList(this.state.navList)}
              </ul>
            </div>
            <HelpIcon/>
          </nav>
          <HelpContent/>
        </div>
    )
}

}

export default TopMenu;
