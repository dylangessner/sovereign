import { Router } from 'meteor/iron:router';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { WebApp } from 'meteor/webapp';

import civic from 'civic';
import { decodeToken } from 'jsontokens';

//Include the civic.sip.js script on your page. This exposes a single global object, civic
//not sure where these are supposed to go
//<link rel="stylesheet" href="https://hosted-sip.civic.com/css/civic-modal.min.css">
//<script src="https://hosted-sip.civic.com/js/civic.sip.min.js"></script>
const civicAppId = 'ByZfy-_NM';
const civicPrivateSigningKey = "93a557fc54bf04e410640ad003b622245886ff66e83cd426ff9a63fc49408c16"; // need a secure place to store this, not sure where or how
const civicAppSecret = "10f6a1a1bcdc5ec6675ea30a3d5ba41c"; // need a secure place to store this, not sure where or how

if (Meteor.isClient) {
    // Instantiate instance of civic.sip
    // this is the sovereign app id w/ civic
    const civicSip = new civic.sip( { appId: civicAppId });

    const loginWithCivic = function(options, callback) {
        if (!callback && typeof options === "function") {
            callback = options;
            options = null;
        }

        const button = document.querySelector('#civic-login');
        button.addEventListener('click', function () {
            civicSip.signup(
                { style: 'popup', scopeRequest: civicSip.ScopeRequests.BASIC_SIGNUP });
        });

        // Listen for data
        civicSip.on('auth-code-received', function (event) {

            // encoded JWT Token is sent to the server
            var jwtToken = event.response;

            // pass JWT token to the server
            var methodName = 'login';
            var methodArguments = jwtToken;
            var router = this;

            Accounts.callLoginMethod({
                methodArguments,
                userCallback: function (err) {
                    Accounts._pageLoadLogin({
                        type: 'civic',
                        allowed: !err,
                        error: err,
                        methodName: methodName,
                        methodArguments: methodArguments
                    });
                    router.redirect('/');
                }
            });
        });

        // handle unauthorized requests
        civicSip.on('user-cancelled', function () {
            const msg = "Civic login failed. The user canceled the request.";
            throw new Error(msg);
        });
        civicSip.on('civic-sip-error', function (error) {
            console.log('Civic login failed with: ' + error.type);
            throw new Error(error.message);
        });
    };

    Accounts.registerClientLoginFunction('civic', loginWithCivic);
    Meteor.loginWithCivic = function () {
        return Accounts.applyLoginFunction('civic', arguments);
    };
}

if (Meteor.isServer) {
    const civicSip = require('civic-sip-api');

    // Initialize instance passing your appId and secret.
    const civicClient = civicSip.newClient({
        appId: civicAppId,
        prvKey: civicPrivateSigningKey,
        appSecret: civicAppSecret,
    });

    Accounts.registerLoginHandler('civic', function(opts) {
        const civicToken = opts;
        if (!civicToken) return undefined;

        // Exchange authorization code for user data.
        civicClient.exchangeCode(civicToken)
            .then((userData) => {
                // store user data and userId as appropriate
                const decodedToken = decodeToken(civicToken);
                const user = Accounts.updateOrCreateUserFromExternalService('civic', {
                    token: decodedToken,
                    userData,
                    id: decodedToken.userId
                });
                console.log(`Created user from Civic login: ${user}`);
                return user;
            }).catch((error) => {
            console.log(error);
        });
    });
}
