import React, {Component} from 'react';
//import {Link, Switch, Route, Redirect} from 'react-router-dom';
import {Switch, Route, Redirect} from 'react-router-dom';
import {Container} from 'reactstrap';

import _ from 'lodash';

//-- registries
import serviceRegistry from './lib/ServiceRegistry';
import routeRegistry from './lib/RouteRegistry';

//-- general views
import Header from './views/Header/';
import Footer from './views/Footer/';
import SideBar from './views/SideBar/';
import DashBoard from './views/DashBoard/';
import TopMenu from './views/TopMenu/';

//-- exchanges views
import MarketOverview from './views/MarketOverview';
import Portfolio from './views/Portfolio';
import Prices from './views/Prices';
import OrderBooks from './views/OrderBooks';
import MyOrders from './views/MyOrders';
import NewOrder from './views/NewOrder';
import MyBalances from './views/MyBalances';

//-- services views
import CoinMarketCap from './views/CoinMarketCap/';

class App extends Component {

constructor(props)
{
   super(props);
   this._routes = [];
   this._loadRoutes();
}

_addExchangeRoutes(obj)
{
    // Prices view
    if (obj.features['tickers'].enabled)
    {
        // pair parameter is optional
        let path = '/exchanges/' + obj.id + '/prices';
        routeRegistry.registerExchangeRoute(path, obj.id, 'prices', true);
        path += '/:pair?';
        this._routes.push({
            path:path,
            exact:true,
            component:Prices,
            data:{exchange:obj.id}
        });
    }
    // OrderBooks view
    if (obj.features['orderBooks'].enabled)
    {
        // pair parameter is optional
        let path = '/exchanges/' + obj.id + '/orderBooks';
        routeRegistry.registerExchangeRoute(path, obj.id, 'orderBooks', true);
        path += '/:pair?';
        this._routes.push({
            path:path,
            exact:true,
            component:OrderBooks,
            data:{exchange:obj.id}
        });
    }
    // MyOrders view
    if (obj.features['openOrders'].enabled)
    {
        let path = '/exchanges/' + obj.id + '/myOrders';
        routeRegistry.registerExchangeRoute(path, obj.id, 'myOrders', true);
        this._routes.push({
            path:path,
            exact:true,
            component:MyOrders,
            data:{exchange:obj.id}
        });
    }
    // NewOrder view
    if (obj.features['openOrders'].enabled)
    {
        let path = '/exchanges/' + obj.id + '/newOrder';
        routeRegistry.registerExchangeRoute(path, obj.id, 'newOrder');
        path += '/:pair?';
        path += '/:rate?';
        path += '/:quantity?';
        this._routes.push({
            path:path,
            exact:true,
            component:NewOrder,
            data:{exchange:obj.id}
        });
    }
    // MyBalances view
    if (obj.features['balances'].enabled)
    {
        let path = '/exchanges/' + obj.id + '/myBalances';
        routeRegistry.registerExchangeRoute(path, obj.id, 'myBalances');
        this._routes.push({
            path:path,
            exact:true,
            component:MyBalances,
            data:{exchange:obj.id}
        });
    }
}

_loadRoutes()
{
    let self = this;

    //-- exchanges
    let exchanges = serviceRegistry.getExchanges();
    let exchangesWithBalancesSupport = [];
    if (0 != Object.keys(exchanges))
    {
        _.forEach(exchanges, function(obj){
            if (obj.features.balances.enabled)
            {
                exchangesWithBalancesSupport.push(obj.id);
            }
            self._addExchangeRoutes(obj);
        });
    }

    //-- services
    let services = serviceRegistry.getServices();
    // CoinMarketCap service
    if (undefined !== services['coinmarketcap'])
    {
        let path = '/services/coinMarketCap';
        routeRegistry.registerServiceRoute(path, 'coinmarketcap');
        this._routes.push({
            path:path,
            exact:true,
            component:CoinMarketCap
        });
    }

    //-- remaining routes
    let path;

    // Market Overview (requires local storage)
    if (window.ctx.hasLocalStorage)
    {
        path = '/services/marketOverview';
        routeRegistry.registerRoute(path, 'marketoverview', true);
        this._routes.push({
            path:path,
            exact:true,
            component:MarketOverview
        });
    }

    // Portfolio requires coinmarket cap & support for 'balances' features in exchanges
    if (undefined !== services['coinmarketcap'] && 0 != exchangesWithBalancesSupport.length)
    {
        path = '/services/portfolio';
        routeRegistry.registerRoute(path, 'portfolio', true);
        this._routes.push({
            path:path,
            exact:true,
            component:Portfolio
        });
    }

    //-- home route is default route
    path = '/';
    routeRegistry.registerRoute(path, 'home');
    this._routes.push({
        path:path,
        exact:false,
        component:DashBoard
    });
}

componentDidMount()
{
}

render()
{
    const routes = this._routes;
    const route = (item, index) => {
        // no extra properties to path
        if (undefined === item.data)
        {
            return (
                <Route key={index} exact={item.exact} path={item.path} component={item.component}/>
            );
        }
        return (
            <Route key={index} exact={item.exact} path={item.path} render={(props) => (
                <item.component {...props} data={item.data}/>
            )}/>
        );
    };

    const routeList = () => {
        return this._routes.map( (r, index) => route(r, index) );
    };

    return (
      <div className="app">
        <Header />
        <div className="app-body">
          <SideBar {...this.props}/>
          <main className="main">
            <TopMenu {...this.props}/>
            <Container fluid>
              <Switch>
              {routeList()}
              </Switch>
            </Container>
          </main>
        </div>
        <Footer />
      </div>
    );
}

}

export default App;
