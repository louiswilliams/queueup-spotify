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
var apiRouter = require('./routes/api');
var utils = require('./utils');
var fs = require('fs');

var mongo = require('mongodb');
var ObjectId = require('mongodb').ObjectID;
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

app.use(logger('common'));
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
app.use('/api', apiRouter);

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

    // Find client key in DB
    var playlists = db.get('playlists');
    if (typeof(data) == 'string') {
        console.log("Weird. Data coming in as string. Parsing anyways...");
        data = JSON.parse(data);
    }

    playlists.findOne({_id: new ObjectId(data.id)}).success(function (playlist) {

      if(playlist) {
        // Success
        console.log("Autheticated successfully...");
        socket.emit('auth_success');
        // Join a Socket room identified by the playlist's key
        socket.join(playlist._id);

        var queue = (playlist.tracks) ? playlist.tracks : [];
        // Send an initial update
        socket.emit('state_change', {
          play: playlist.play,
          volume: playlist.volume,
          track: playlist.current,
          queue: playlist.tracks,
          trigger: "playlist_connect"
        });

        socket.on('client_play_pause', function(play_state) {
          if (typeof(play_state) == 'string') {
              console.log("Weird. Data coming in as string. Parsing anyways...");
              play_state = JSON.parse(play_state);
          }
          console.log("Client play/pause.");
          playlists.findAndModify(
            {_id: playlist._id},
            { $set: {
              play: play_state.playing
            }},
            {"new": true}
          ).success(function (playlist) {
            io.to(playlist._id).emit('state_change', {
              play: playlist.play,
              trigger: "client_play_pause"
            });
          }).error(function (err) {
            console.log(err);
          });
        });

        // Capture track_finished event from playlist
        socket.on('track_finished', function() {
          console.log("Track finished... Going to next");
          playlists.findOne({_id: playlist._id}).success(function (playlist) {
            utils.skipTrack(db, io, playlist, function(result) {
              console.log(result);
              // do something?
            });
          }).error(function (err) {
            console.log(err);
          });
        });

        // Capture playing progress
        socket.on('track_progress', function(update) {
          // console.log("Track at " + update.progress + "/" + update.duration);

          io.to(playlist._id).emit('track_progress_update', {
            progress: update.progress,
            duration: update.duration
          });
        });

        // // Capture track_update
        // socket.on('playback_update', function(update) {
        //   var playing = update.playing;
        //   console.log("playback update");
        //   playlists.findAndUpdate(
        //     {_id: playlist._id},
        //     { $set: {
        //       play: playing
        //     }},
        //     {"new": true}
        //   ).success(function (playlist) {
        //     io.to(playlist._id).emit('state_change', {
        //       play: playlist.play
        //     });
        //   }).error(function (err) {
        //     console.log(err);
        //   });
        // });
      } else {
        // Key not found in DB
        console.log("Invalid playlist...");
        socket.emit('auth_fail', {message: "Playlist ID invalid"});
      }
    }).error(function (err) {
      // DB error
      console.log("Error finding playlist:", err);
      socket.emit('auth_fail', {message: "DB Error finding playlist" , error: err});
    });
  });
});
