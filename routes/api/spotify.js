/** 
 * Spotify authentication routes
 */

var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var https = require('https');
var querystring = require('querystring');
var router = express.Router();
var URL = require('url');
var utils = require('../../utils');

var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/../../spotify.key', {encoding: 'utf8'}));

var SPOTIFY_ENDPOINT = URL.parse('https://accounts.spotify.com/api/token');
var CLIENT_ID = spotifyConfig.clientId;
var CLIENT_SECRET = spotifyConfig.clientSecret;
var CLIENT_CALLBACK = spotifyConfig.appRedirectUri;
var ENCRYPTION_SECRET = spotifyConfig.encryptionSecret;

var authHeader = CLIENT_ID + ":" + CLIENT_SECRET;

var requestOptions = {
    host: SPOTIFY_ENDPOINT.host,
    method: 'POST',
    path: SPOTIFY_ENDPOINT.path,
    auth: authHeader,
    headers: {}
};

/* Get access tokens given an auth code */
router.post('/swap', function (req, res) {

  var authCode = req.body.code;

  if (!authCode) {
    console.log("No auth code sent");
    return res.status(400).json({error: "No auth code sent!"});
  }

  /* Create the POST data string */
  var data = querystring.stringify({
    grant_type: "authorization_code",
    redirect_uri: CLIENT_CALLBACK,
    code: authCode
  });

  /* Set the content type and length headers */
  requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  requestOptions.headers['Content-Length'] = Buffer.byteLength(data);

  var httpRequest = https.request(requestOptions, function (httpResponse) {
    getResponse(httpResponse, function (response) {

        /* Encrypt the token if necessary */
        if (response.refresh_token) {
            response.refresh_token = encyptToken(response.refresh_token)
        }
        res.json(response);
    }, function (err) {
        console.log("Error swapping token:", err);
        res.status(400).json(err);
    });
  });

  httpRequest.write(data);
  httpRequest.end();
});


/* Exchange a refresh token for an access token */
router.post('/refresh', function (req, res) {

  var refreshToken = req.body.refresh_token;

  if (!refreshToken) {
    console.log("No refresh token sent");
    return res.status(400).json({error: "No refresh token sent"});
  }

  /* Create the POST data string */
  var data = querystring.stringify({
    grant_type: "refresh_token",
    refresh_token: decryptToken(refreshToken)
  });

  /* Set the content type and length headers */
  requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  requestOptions.headers['Content-Length'] = Buffer.byteLength(data);

  var httpRequest = https.request(requestOptions, function (httpResponse) {
    getResponse(httpResponse, function (data) {
        res.json(data);
    }, function (err) {
        console.log("Error refreshing token", err);
        res.status(400).json(err);
    });
  });

  httpRequest.write(data);
  httpRequest.end();
});

var inputEncoding = 'utf8';
var outputEncoding = 'base64';

function encyptToken(token) {
    var cipher = crypto.createCipher('aes256', ENCRYPTION_SECRET);
    return cipher.update(token, inputEncoding, outputEncoding)
        + cipher.final(outputEncoding);
}

function decryptToken(message) {
    var decipher = crypto.createDecipher('aes256', ENCRYPTION_SECRET);
    return decipher.update(message, outputEncoding, inputEncoding)
        + decipher.final(inputEncoding);
}


function getResponse(httpResponse, success, error) {
    var response = "";
    httpResponse.on('data', function (d) {
        response += d;
    });

    httpResponse.on('end', function () {
        try {
            var json = JSON.parse(response);
            if (httpResponse.statusCode == 200) {
                success(json);
            } else {
                error(json);
            }

        } catch (err) {
            console.log("Err", err);
            error({error: err});
        }
    })
}

module.exports = router;