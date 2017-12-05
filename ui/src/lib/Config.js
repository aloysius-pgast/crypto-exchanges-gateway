import axios from 'axios';
import _ from 'lodash';

class Config
{

constructor()
{
    let restEndpoint = window.location.protocol + '://' + window.location.hostname + ':' + window.location.port + '/';
    let wsEndpoint;
    if ('http' ==  window.location.protocol)
    {
        wsEndpoint = 'ws://' + window.location.hostname + ':8001/';
    }
    else
    {
        wsEndpoint = 'wss://' + window.location.hostname + ':8001/';        
    }
    this.config = {
        restEndpoint:restEndpoint,
        wsEndpoint:wsEndpoint
    };
}

load()
{
    let self = this;
    return new Promise((resolve, reject) => {
        let p = {
            method:'get',
            url:'config/config.json'
        }
        axios(p).then(function(response) {
            _.assign(self.config, response.data);
            self._finalizeConfig();
            resolve(true);
        }).catch(function(err){
            resolve(false);
        });
    });
}

_finalizeConfig()
{
    // add trailing '/' to restEndpoint
    if ('/' != this.config.restEndpoint.substr(-1))
    {
        this.config.restEndpoint += '/';
    }
    // add trailing '/' to wsEndpoint
    if ('/' != this.config.wsEndpoint.substr(-1))
    {
        this.config.wsEndpoint += '/';
    }
}

}

export default new Config();
