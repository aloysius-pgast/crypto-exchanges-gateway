import axios from 'axios';
import _ from 'lodash';

class Config
{

constructor()
{
    let apiEndpoint = window.location.protocol + '://' + window.location.hostname + ':' + window.location.port + '/';
    this.config = {
        apiEndpoint:apiEndpoint
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
    // add trailing '/' to apiEndpoint
    if ('/' != this.config.apiEndpoint.substr(-1))
    {
        this.config.apiEndpoint += '/';
    }
}

}

export default new Config();
