import React, { Component } from 'react';
import restClient from '../../lib/RestClient';

import {
  Row,
  Col,
  Card,
  CardHeader,
  CardBlock,
  FormGroup,
  Label,
  Input,
  InputGroup,
  DropdownMenu,
  DropdownItem,
  DropdownToggle,
  ButtonDropdown
} from "reactstrap";

class Auth extends Component
{

constructor(props) {
   super(props);
   this.state = {
       apiKey:{
           value:'',
           empty:null,
           valid:null,
           remember:window.ctx.hasLocalStorage
       }
   }
   this._handleChangeApiKey = this._handleChangeApiKey.bind(this);
   this._handleCheckApiKey = this._handleCheckApiKey.bind(this);
   this._handleClickRememberApiKey = this._handleClickRememberApiKey.bind(this);
}

_handleCheckApiKey(e)
{
    e.preventDefault();
    e.stopPropagation();
    if ('' === this.state.apiKey.value)
    {
        return false;
    }
    let valid = false;
    let apiKey = {
        value:this.state.apiKey.value,
        empty:this.state.apiKey.empty,
        remember:this.state.apiKey.remember,
        valid:false
    }
    // check apiKey
    let self = this;
    restClient.setApiKey(apiKey.value);
    restClient.getServerStatus().then(function(result){
        // api key is valid
        let obj = {
            key:apiKey.value
        }
        let data = JSON.stringify(obj);
        // save to local storage
        if (self.state.apiKey.remember)
        {
            window.localStorage.setItem('apiKey', data);
        }
        else
        {
            // remove existing key from storage
            if (window.ctx.hasLocalStorage)
            {
                window.localStorage.removeItem('apiKey');
            }
        }
        // save to session storage
        window.sessionStorage.setItem('apiKey', data);
        // reload
        window.location.reload();
    }).catch (function(err){
        //api key is invalid
        self.setState({apiKey:apiKey});
    });
    return false;
}

_handleClickRememberApiKey(e)
{
    let apiKey = {
        value:this.state.apiKey.value,
        empty:this.state.apiKey.empty,
        valid:this.state.apiKey.valid
    }
    apiKey.remember = e.target.checked;
    this.setState({apiKey:apiKey});
}

_handleChangeApiKey(e)
{
    let apiKey = {
        value:e.target.value.trim(),
        valid:null,
        remember:this.state.apiKey.remember
    }
    if ('' == apiKey.value)
    {
        apiKey.empty = true;
    }
    else
    {
        apiKey.empty = false;
    }
    this.setState({apiKey:apiKey});
}

componentWillReceiveProps(nextProps) {}

componentDidMount() {}

render()
{
    let classNamesButton = "btn btn-secondary float-right";
    if ('' === this.state.apiKey.value)
    {
        classNamesButton += " disabled";
    }
    const RememberApiKey = () => {
        if (!window.ctx.hasLocalStorage)
        {
            return null;
        }
        return (
            <Row>
              <Col>
                <FormGroup>
                  <div className="checkbox">
                    <Label check htmlFor="remember">
                      <Input type="checkbox" id="remember" name="remember" checked={this.state.apiKey.remember} onChange={this._handleClickRememberApiKey}/> R<small>EMEMBER API KEY</small>
                    </Label>
                  </div>
                </FormGroup>
              </Col>
            </Row>
        )
    }
    return (
        <form noValidate style={{marginTop:'50px'}} onSubmit={this._handleCheckApiKey}>
        <Row>
          <Col className="col-auto mx-auto">
            <Card>
              <CardHeader>
                <strong>AUTHENTICATION REQUIRED</strong>
              </CardHeader>
              <CardBlock className="card-body">
                <Row>
                  <Col>
                    <FormGroup>
                      <Label htmlFor="key">A<small>PI KEY</small></Label>
                      <InputGroup>
                        <Input type="text" id="key" placeholder="API Key" style={{width:'300px'}} value={this.state.apiKey.value} onChange={this._handleChangeApiKey}/>
                      </InputGroup>
                      <div className="invalid-feedback" style={{display:true === this.state.apiKey.empty ? 'inline' : 'none'}}>
                        Please provide an API Key
                      </div>
                      <div className="invalid-feedback" style={{display:false === this.state.apiKey.empty && false === this.state.apiKey.valid ? 'inline' : 'none'}}>
                        API Key is invalid
                      </div>
                    </FormGroup>
                  </Col>
                </Row>
                <RememberApiKey/>
                <Row>
                  <Col>
                    <button type="button" className={classNamesButton} onClick={this._handleCheckApiKey}>O<small>K</small></button>
                  </Col>
                </Row>
              </CardBlock>
            </Card>
          </Col>
        </Row>
        </form>
    )
}

}

export default Auth;
