var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var passport = require('passport');
var SpotifyWebApi = require('spotify-web-api-node');
var routes = require('./routes/index');
var playlistRouter = require('./routes/playlists');
var spotifyRouter = require('./routes/spotify');
var passportRouter = require('./routes/passport');
var utils = require('./utils');
var fs = require('fs');

var mongo = require('mongodb');
var monk = require('monk');

var db = monk('localhost:27017/queueup');

var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/spotify.key', {encoding: 'utf8'}));

// Initialize Spotify web api
var spotify = new SpotifyWebApi(spotifyConfig);
var app = express();

// Initialize server and socket.io
var server = require('http').Server(app);
var io = require('socket.io')(server);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(function(req,res,next) {
  req.db = db;
  req.spotify = spotify; // Make the API available to following middleware
  req.io = io;
  next();
});
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({
  secret: 'queuemeup',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/', routes);
app.use('/playlist', playlistRouter);
app.use('/spotify', spotifyRouter);
app.use('/auth', passportRouter);

// Start server
server.listen(3002, function() {
  console.log("Server started on port %d", server.address().port);
});

// Handle client connection and authentication
io.on('connection', function(socket) {
  console.log("Client connection... Requesting auth...");
  // Request authentication
  socket.emit('auth_request');
  // Authentication received
  socket.on('auth_send', function(data) {
    console.log("Auth response from client...",data);

    // Find cliet key in DB
    var clients = db.get('playlists');
    clients.findOne({_id: data.id}, function(err, client) {
      if (err) {
        // DB error
        console.log("Error finding client:", err);
        socket.emit('auth_fail', {message: "DB Error finding client" , error: err});
      } else if(client) {
        // Success
        console.log("Autheticated successfully...");
        socket.emit('auth_success');
        // Join a Socket room identified by the client's key
        socket.join(client.key);

        // Send an initial update
        socket.emit('state_change', {
          play: client.play,
          volume: client.volume,
          track: client.current,
          trigger: "client_connect"
        });
    
        // Capture track_finished event from client
        socket.on('track_finished', function() {
          console.log("Track finished... Going to next");
          utils.skipTrack(db, io, client, function(result) {
            console.log(result);
            // do something?
          });
        });
      } else {
        // Key not found in DB
        console.log("Invalid authentication key...");
        socket.emit('auth_fail', {message: "Key invalid"});
      }
    });
  });
});
