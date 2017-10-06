import serviceRegistry from './ServiceRegistry';

class RouteRegistry
{

constructor()
{
    this._routes = {};
}

/**
 * @param {string} path route path
 * @param {string} exchange exchange identifier
 * @param {string} name route name
 * @param {boolean} hasHelp indicates whether or not help will be available for this route (optional, default = false)
*/
registerExchangeRoute(path, exchange, name, hasHelp)
{
    this._routes[path] = {
        path:path,
        type:'exchange',
        exchange:exchange,
        name:name,
        hasHelp:undefined !== hasHelp && hasHelp
    }
}

/**
 * @param {string} path route path
 * @param {string} service service identifier
 * @param {string} name route name
 * @param {boolean} hasHelp indicates whether or not help will be available for this route (optional, default = false)
 */
registerServiceRoute(path, service, name, hasHelp)
{
    if (undefined === name)
    {
        name = 'default';
    }
    this._routes[path] = {
        path:path,
        type:'service',
        service:service,
        name:name,
        hasHelp:undefined !== hasHelp && hasHelp
    }
}

/**
 * Register a route
 *
 * @param {string} path route path
 * @param {string} name route name
 * @param {boolean} hasHelp indicates whether or not help will be available for this route (optional, default = false)
 */
registerRoute(path, name, hasHelp)
{
    this._routes[path] = {
        path:path,
        name:name,
        hasHelp:undefined !== hasHelp && hasHelp
    }
}

/**
 * Indicates whether or not a route exist
 *
 * @param {string} path route to check
 * @return {boolean} true if route exist, false otherwise
 */
checkRoute(path)
{
    if (undefined === this._routes[path])
    {
        return false;
    }
    return true;
}

/**
 * Get route descriptor {type:string, exchange:string, name:string} or {type:string, service:string, name:string} or {name:string}
 *
 * @param {string} path path to retrieve route descriptor for
 * @return {object} route descriptor
 */
getRoute(path)
{
    if (undefined === this._routes[path])
    {
        return;
    }
    return this._routes[path];
}

findRoute(path)
{
    if (undefined !== this._routes[path])
    {
        return this._routes[path];
    }
    // find route with longer match
    let r;
    _.forEach(this._routes, function(obj){
        // we found a matching route
        if (path.startsWith(obj.path))
        {
            // route is longer than previous
            if (undefined === r || obj.path.length > r.path.length)
            {
                r = obj;
            }
        }
    });
    return r;
}

/**
 * Returns all exchanges routes
 * {
 *     "exchange1":{
 *         "name1":{},
 *         "name2":{},
 *         ...
 *     },
 *     ...
 * }
 *
 * @param {string} exchange exchange identifier (optional, if not set routes for all exchanges will be returned)
 * @return {object}
 */
getExchangesRoutes(exchange)
{
    let routes = {};
    _.forEach(this._routes, function(obj){
        // not an exchange route
        if ('exchange' != obj.type)
        {
            return;
        }
        // specific exchange was requested
        if (undefined !== exchange)
        {
            // not expected exchange
            if (exchange != obj.exchange)
            {
                return;
            }
        }
        if (undefined === routes[obj.exchange])
        {
            routes[obj.exchange] = {};
        }
        routes[obj.exchange][obj.name] = obj;
    });
    return routes;
}

/**
 * Returns all services routes
 * {
 *     "service1":{
 *         "name1":{},
 *         "name2":{},
 *         ...
 *     },
 *     ...
 * }
 *
 * @param {string} service service identifier (optional, if not set routes for all services will be returned)
 * @return {object}
 */
getServicesRoutes(service)
{
    let routes = {};
    _.forEach(this._routes, function(obj){
        // not a service route
        if ('service' != obj.type)
        {
            return;
        }
        // specific service was requested
        if (undefined !== service)
        {
            // not expected exchange
            if (service != obj.service)
            {
                return;
            }
        }
        if (undefined === routes[obj.service])
        {
            routes[obj.service] = {};
        }
        routes[obj.service][obj.name] = obj;
    });
    return routes;
}

}

export default new RouteRegistry();
