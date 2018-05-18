"use strict";
const joi = require('joi');
const _ = require('lodash');
const Assert = require('../../../lib/assert');
const MochaHelper = require('../../../lib/mocha-helper');
const restClient = require('../../../lib/rest-client').getInstance();

MochaHelper.prepare(() => {

    MochaHelper.createSuite('/pushover', (services) => {

        MochaHelper.describe('POST', '/pushover/notify', function(method, path, params){
            it("it should send a push notification using PushOver", (done) => {
                restClient.makeRequest(method, path, params).then((result) => {
                    Assert.validateResult(result, undefined);
                    done();
                }).catch((e) => {
                    done(e);
                });
            });
        },{message:"Hi !"});

    }, (services) => {
        return MochaHelper.checkService('pushover');
    });

});
