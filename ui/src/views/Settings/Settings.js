import React, { Component } from 'react';
import {
  Input,
  FormGroup,
  Label
} from "reactstrap";
import FileSaver from  'file-saver';

import serviceRegistry from '../../lib/ServiceRegistry';
import starredPairs from '../../lib/StarredPairs';
import restClient from '../../lib/RestClient';

//-- components
import ComponentLoadingSpinner from '../../components/ComponentLoadingSpinner';

class Settings extends Component
{

constructor(props) {
   super(props);
   this._isMounted = false;
   this._apiKey = restClient.getApiKey();

   this.state = {
       exportStarredPairs:true,
       exportApiKey:false,
       settings:{
           data:null,
           file:null,
           valid:false,
           imported:false
       }
   }
   this._handleExport = this._handleExport.bind(this);
   this._handleImport = this._handleImport.bind(this);
   this._handleChooseImportFile = this._handleChooseImportFile.bind(this);
   this._handleCheck = this._handleCheck.bind(this);
}

componentWillUnmount()
{
    this._isMounted = false;
}

componentWillReceiveProps(nextProps) {}

componentDidMount()
{
    this._isMounted = true;
}

_handleCheck(e)
{
    let newState = {};
    newState[e.target.id] = e.target.checked;
    this.setState(newState);
}

_handleExport(e)
{
    e.preventDefault();
    e.stopPropagation();
    let settings = {};
    if (this.state.exportStarredPairs)
    {
        settings.starredPairs = [];
        _.forEach(starredPairs.getStarredPairs(), (e) => {
            settings.starredPairs.push(e);
        });
    }
    if (this.state.exportApiKey)
    {
        let apiKey = restClient.getApiKey();
        if (null !== apiKey)
        {
            settings.apiKey = apiKey;
        }
    }
    let blob = new Blob([JSON.stringify(settings)], {type: 'text/plain;charset=utf-8'});
    FileSaver.saveAs(blob, 'settings.json');
}

_handleImport(e)
{
    if (undefined !== this.state.settings.data.starredPairs)
    {
        starredPairs.reset();
        _.forEach(this.state.settings.data.starredPairs, (e) => {
            starredPairs.star(e.exchange, e.pair, e.timestamp);
        });
    }
    let newState = {settings:this.state.settings};
    newState.settings.imported = true;
    this.setState(newState);
}

_handleChooseImportFile(e)
{
    let reader = new FileReader();
    let newState = {settings:{file:e.target.files[0],valid:false,data:null,imported:false}};
    let self = this;
    reader.addEventListener('load', function () {
        let settings;
        try
        {
            settings = JSON.parse(reader.result);
        }
        catch (e)
        {
        }
        if (undefined !== settings)
        {
            if (undefined !== settings.starredPairs)
            {
                newState.settings.data = settings;
                newState.settings.valid = true;
            }
        }
        self.setState(newState);
    }, false);
    reader.readAsText(newState.settings.file);
}

render()
{
    const ExportApiKey = () => {
        if (!restClient.hasApiKey())
        {
            return null;
        }
        return (
            <FormGroup check>
              <Input className="form-check-input" type="checkbox" id="exportApiKey" name="exportApiKey" defaultChecked={this.state.exportApiKey} onChange={this._handleCheck}/>
              <Label className="form-check-label" check htmlFor="exportApiKey"><small>API KEY</small></Label>
            </FormGroup>
        );
    }

    const ExportSettings = () => {
        return (
            <div>
                <h6>EXPORT SETTINGS</h6>
                <FormGroup check>
                  <Input className="form-check-input" type="checkbox" id="exportStarredPairs" name="exportStarredPairs" defaultChecked={this.state.exportStarredPairs} onChange={this._handleCheck}/>
                  <Label className="form-check-label" check htmlFor="exportStarredPairs"><small>STARRED PAIRS</small></Label>
                </FormGroup>
                <ExportApiKey/>
                <button type="button" className="btn btn-secondary" onClick={this._handleExport}>E<small>XPORT</small></button>
            </div>
        );
    }

    const ImportButton = () => {
        if (null === this.state.settings.file || !this.state.settings.valid)
        {
            return (
                <button type="button" disabled className="btn btn-secondary">I<small>MPORT</small></button>
            );
        }
        return (
            <button type="button" className="btn btn-secondary" onClick={this._handleImport}>I<small>MPORT</small></button>
        );
    }

    const InvalidSettingsWarning = () => {
        if (null === this.state.settings.file || this.state.settings.valid)
        {
            return (
                <br/>
            );
        }
        return (
            <div className="text-danger mb-1">Invalid settings file</div>
        )
    }

    const ImportFeedback = () => {
        if (null === this.state.settings.file || !this.state.settings.valid || !this.state.settings.imported)
        {
            return null;
        }
        return (
            <div className="text-success mt-1">Settings successfully imported</div>
        )
    }

    const ImportSettings = () => {
        return (
            <div>
                <h6>IMPORT SETTINGS</h6>
                <input onChange={this._handleChooseImportFile} type="file" id="fileChooser" style={{opacity:0,height:0,width:0}}/>
                <label htmlFor="fileChooser" className="btn btn-secondary">C<small>HOOSE FILE</small></label>
                <InvalidSettingsWarning/>
                <ImportButton/>
                <ImportFeedback/>
            </div>
        );
    }

    return (
        <div className="animated fadeIn">
          <br/>
          <ExportSettings/>
          <br/><br/>
          <ImportSettings/>
        </div>
    );
}

}

export default Settings;
