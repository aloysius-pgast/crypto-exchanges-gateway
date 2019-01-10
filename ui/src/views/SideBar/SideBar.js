import React, {Component} from 'react';
import {NavLink} from 'react-router-dom';
import {Nav, NavItem} from 'reactstrap';
import classNames from 'classnames';
import _ from 'lodash';

import serviceRegistry from '../../lib/ServiceRegistry'
import routeRegistry from '../../lib/RouteRegistry'

class SideBar extends Component
{

constructor(props) {
    super(props);
    // build menu entries
    this._menu = [];
    this._defineMenuEntries();
}


_defineExchangeEntry(obj, id)
{
    let entry = {
        name: serviceRegistry.getExchangeName(id),
        icon: 'fa fa-bitcoin',
        children:[]
    };
    // mapping route name => title
    let titles = {
        'prices':'Prices',
        'orderBooks':'Order Books',
        'myOrders':'My Orders',
        'allMyOrders':'All My Orders',
        'newOrder':'New Orders',
        'myBalances':'My Balances'
    }
    let routeNames = ['prices','orderBooks','myOrders','allMyOrders','newOrder','myBalances'];
    _.forEach(routeNames, function(n){
        // route does not exist
        if (undefined === obj[n])
        {
            return;
        }
        entry.children.push({
            name:titles[n],
            url:obj[n].path
        });
    });
    this._menu.push(entry);
}

_defineMarketOverviewEntry(obj)
{
    this._menu.push(
        {
            name: 'Market Overview',
            url: obj.path,
            icon: 'fa fa-bitcoin'
        }
    );
}

_defineMarketCapEntry(obj)
{
    this._menu.push(
        {
            name: 'Market Cap',
            url: obj.default.path,
            icon: 'fa fa-bitcoin'
        }
    );
}

_definePortfolioEntry(obj)
{
    this._menu.push(
        {
            name: 'My Portfolio',
            url: obj.path,
            icon: 'fa fa-bitcoin'
        }
    );
}

_defineSettingsEntry(obj)
{
    this._menu.push(
        {
            name: 'Settings',
            url: obj.path,
            icon: 'fa fa-cog'
        }
    );
}

_defineMyStreamsEntry(obj)
{
    this._menu.push(
        {
            name: 'My Streams',
            url: obj.path,
            icon: 'fa fa-plug'
        }
    );
}

_defineAlertsEntry(obj)
{
    this._menu.push(
        {
            name: 'Alerts',
            url: obj.path,
            icon: 'fa fa-bell'
        }
    );
}

_defineServiceEntry(obj, id)
{
    switch (id)
    {
        case 'marketCap':
            this._defineMarketCapEntry(obj);
            break;
    }
}

_defineMenuEntries()
{
    let self = this;
    let exchangesRoutes = routeRegistry.getExchangesRoutes();
    // do we have exchanges ?
    if (0 != Object.keys(exchangesRoutes))
    {
        this._menu.push(
            {
                title: true,
                name: 'Exchanges',
                wrapper: {            // optional wrapper object
                    element: "span",    // required valid HTML5 element tag
                    attributes: {}      // optional valid JS object with JS API naming ex: { className: "my-class", style: { fontFamily: "Verdana" }, id: "my-id"}
                },
                class: ""             // optional class names space delimited list for title item ex: "text-center"
            }
        );
        let exchanges = Object.keys(exchangesRoutes).sort();
        _.forEach(exchanges, function(id){
            self._defineExchangeEntry(exchangesRoutes[id], id);
        });
    }
    let servicesRoutes = routeRegistry.getServicesRoutes();
    let marketOverviewRoute = routeRegistry.getRoute('/services/marketOverview');
    let portfolioRoute = routeRegistry.getRoute('/services/portfolio');
    let settingsRoute = routeRegistry.getRoute('/services/settings');
    let alertsRoute = routeRegistry.getRoute('/services/alerts');
    let myStreamsRoute = routeRegistry.getRoute('/services/myStreams');
    // do we have services ?
    if (undefined !== marketOverviewRoute || undefined !== portfolioRoute || undefined !== settingsRoute || undefined !== alertsRoute || 0 != Object.keys(servicesRoutes))
    {
        this._menu.push(
            {
                title: true,
                name: 'Other services',
                wrapper: {            // optional wrapper object
                  element: "span",    // required valid HTML5 element tag
                  attributes: {}      // optional valid JS object with JS API naming ex: { className: "my-class", style: { fontFamily: "Verdana" }, id: "my-id"}
                },
                class: ""             // optional class names space delimited list for title item ex: "text-center"
            },
        );
        if (undefined !== marketOverviewRoute)
        {
            self._defineMarketOverviewEntry(marketOverviewRoute);
        }
        if (undefined !== portfolioRoute)
        {
            self._definePortfolioEntry(portfolioRoute);
        }
        if (undefined !== alertsRoute)
        {
            self._defineAlertsEntry(alertsRoute);
        }
        _.forEach(servicesRoutes, function(obj, id){
            self._defineServiceEntry(obj, id);
        });
        if (undefined !== myStreamsRoute)
        {
            self._defineMyStreamsEntry(myStreamsRoute);
        }
        if (undefined !== settingsRoute)
        {
            self._defineSettingsEntry(settingsRoute);
        }
    }
}

  _handleClick(e) {
    e.preventDefault();
    e.target.parentElement.classList.toggle('open');
  }

  _activeRoute(routeName, props) {
      return props.location.pathname.indexOf(routeName) > -1 ? 'nav-item nav-dropdown open' : 'nav-item nav-dropdown';
  }

  // todo Sidebar nav secondLevel
  // secondLevelActive(routeName) {
  //   return this.props.location.pathname.indexOf(routeName) > -1 ? "nav nav-second-level collapse in" : "nav nav-second-level collapse";
  // }


render()
{
    document.body.classList.add('sidebar-hidden');
    document.body.classList.remove('sidebar-mobile-show');

    const props = this.props;
    const menu = this._menu;
    const activeRoute = this._activeRoute;
    const handleClick = this._handleClick;

    // simple wrapper for nav-title item
    const wrapper = item => { return (!item.wrapper ? item.name : (React.createElement(item.wrapper.element, item.wrapper.attributes, item.name))) };

    // nav list section title
    const title =  (title, key) => {
      const classes = classNames( "nav-title", title.class);
      return (<li key={key} className={ classes }>{wrapper(title)} </li>);
    };

    // nav item with nav link
    const navItem = (item, key) => {
      const classes = classNames( "nav-link", item.class);
      return (
        <NavItem key={key}>
          <NavLink to={item.url} className={ classes } activeClassName="active">
            <i className={item.icon}></i>{item.name}
          </NavLink>
        </NavItem>
      )
    };

    // nav dropdown
    const navDropdown = (item, key) => {
      return (
        <li key={key} className={activeRoute(item.url, props)}>
          <a className="nav-link nav-dropdown-toggle" href="#" onClick={handleClick.bind(this)}><i className={item.icon}></i> {item.name}</a>
          <ul className="nav-dropdown-items">
            {navList(item.children)}
          </ul>
        </li>)
    };

    // nav link
    const navLink = (item, idx) =>
      item.title ? title(item, idx) :
      item.divider ? divider(item, idx) :
      item.children ? navDropdown(item, idx)
                    : navItem(item, idx) ;

    // nav list
    const navList = (items) => {
      return items.map( (item, index) => navLink(item, index) );
    };

    // sidebar-nav root
    return (
      <div className="sidebar">
        <nav className="sidebar-nav">
          <Nav>
            {navList(menu)}
          </Nav>
        </nav>
      </div>
    )
  }
}

export default SideBar;
