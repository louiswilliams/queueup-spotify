var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var SpotifyWebApi = require('spotify-web-api-node');
var routes = require('./routes/index');
var clientRouter = require('./routes/clients');
var spotifyRouter = require('./routes/spotify');

var mongo = require('mongodb');
var monk = require('monk');

var db = monk('localhost:27017/queueup');

var spotify = new SpotifyWebApi({
  clientId: '00fcc73d47814711b7879b41692a2f5d',
  clientSecret: '19f581c6732544af973eb6d08d45ba2d',
  redirectUri: 'http:\/\/node.louiswilliams/org/callback'
});
var app = express();


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(function(req,res,next) {
  req.db = db;
  req.spotify = spotify; // Make the API available to following middleware
  next();
});
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use('/', routes);
app.use('/client', clientRouter);
app.use('/spotify', spotifyRouter);

/*
*/
module.exports = app;
