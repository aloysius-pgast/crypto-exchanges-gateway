"use strict";

class RequestHelper
{

static getParam(req, param)
{
    if (undefined !== req.body && undefined !== req.body[param])
    {
        return req.body[param];
    }
    if (undefined !== req.query && undefined !== req.query[param])
    {
        return req.query[param];
    }
    return undefined;
}

}

module.exports = RequestHelper;
