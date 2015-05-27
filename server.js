var apiRouter = require('./routes/api');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var express = require('express');
var fs = require('fs');
var logger = require('morgan');
var mongo = require('mongodb');
var monk = require('monk');
var passport = require('passport');
var passportRouter = require('./routes/passport');
var path = require('path');
var playlistRouter = require('./routes/playlists');
var routes = require('./routes/index');
var session = require('express-session');
var spotifyRouter = require('./routes/spotify');
var SpotifyWebApi = require('spotify-web-api-node');
var utils = require('./utils');

var ObjectId = mongo.ObjectID;
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
app.enable('trust proxy');

app.use(logger('common'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(function(req,res,next) {
  req.db = db;
  req.spotify = spotify; // Make the API available to following middleware
  req.io = io;
  next();
});
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
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
server.listen(3004, function() {
  console.log("Server started on port %d", server.address().port);
});


io.use(function (socket, next) {
  console.log("SOCKET " + socket.nsp.name);
  next();
});
// Handle client connection and authentication

var Playlists = db.get('playlists');
var Users = db.get('users');


io.on('connection', function(socket) {
  console.log("Socket connection...");

  /* Wait for socket API authentication */
  socket.on("auth", function (data) {
      var client_id = data.client_id;
      var email = data.email;

      /* Both client_id and email must be send together */
      if (client_id && email) {
        Users.findOne({
          email: email,
          client_id: client_id}).success(function (user) {

          /* If the email/token pair was found */
          if (user) {
            console.log("Authenticated socket client");
            
            /* Attach new socket listeners*/
            socket.emit("auth_response");
            subscribeListen(user._id, socket);

          } else {
            console.log("Client not found");

            /* Don't proceed to other middleware if client ID isn't verified */
            socket.emit("auth_response", {error: {
              message: "Client not found"
            }});
          }
        }).error(function (err) {
          console.log(err);
          socket.emit("auth_response", {error:  err});
        });
      } else {
        console.log("Client ID and email not both sent");

        /* Again, client ID is not universally unique, so it must be sent with an email */
        socket.emit("auth_response", {error: {
          message: "Client id and email not both sent"
        }});
      }
  });  

  /*

  BEGIN old socket listeners

  */

  // Request authentication
  socket.emit('auth_request');

  // Authentication received
  socket.on('auth_send', function(data) {
    console.log("Auth response from client...",data);

// Find client key in DB

    if (typeof(data) == 'string') {
        console.log("Weird. Data coming in as string. Parsing anyways...");
        data = JSON.parse(data);
    }

    Playlists.findOne({_id: new ObjectId(data.id)}).success(function (playlist) {

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
          Playlists.findAndModify(
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
          Playlists.findOne({_id: playlist._id}).success(function (playlist) {
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

function subscribeListen(user_id, socket) {

  var client_subscription;
  var player_subscription;

  /* Disconnect handler */
  socket.on('disconnect', function () {
    console.log("Client disconnecting");

    /* Clean up */
    clientUnsubscribe();
    playerUnsubscribe();
  });

  /* Client requests subscription to a playlist's updates */
  socket.on('client_subscribe', clientSubscribe);

  /* ON "playlist:player:request" */
  socket.on('player_subscribe', playerSubscribe);

  /* Client requests to unsubscribe from updates */
  socket.on('client_unsubscribe', clientUnsubscribe);

  /* ON "playlist:player:disconnect" */
  socket.on('player_unsubscribe', playerUnsubscribe);

  /* Register listeners for player updates */
  function playerListen() {
    console.log("Registering player listeners");

    /* Player is sending progress updates */
    socket.on("track_progress", function (data) {

      /* Don't do anything if no longer current (from forced override) */
      if (!isCurrentPlayer()) {
        socket.disconnect();
      }

      /* Broadcast the progress update */
      io.to(playlist._id).emit('track_progress_update', {
        progress: data.progress,
        duration: data.duration
      });
    });

    /* Player track is over and requesting new track*/
    socket.on("track_finished", function (data) {
      console.log("Track finished... Going to next");
      
      /* Don't do anything if no longer current (from forced override) */
      if (!isCurrentPlayer()) {
        socket.disconnect();
      }

      /* Get the most recent playlist and skip the track */
      Playlists.findOne({_id: player_subscription}).success(function (playlist) {
        utils.skipTrack(db, io, playlist, function(result) {
          console.log(result);
        });
      }).error(function (err) {
        console.log(err);
      });
    });

    /* Player device is paused */
    socket.on("track_play_pause", function (data) {
      console.log("Client play/pause.");
      var playing = data.play;

      /* Don't do anything if no longer current (from forced override) */
      if (!isCurrentPlayer()) {
        socket.disconnect();
      }

      /* Update the DB */
      Playlists.findAndModify(
        {_id: playlist._id},
        { $set: {
          play: playing
        }},
        {"new": true}
      ).success(function (playlist) {
        utils.emitStateChange(io, playlist, "track_play_pause");
      }).error(function (err) {
        console.log(err);
      });
    });
  }

  function playerStopListen() {
    socket.off("track_progress");
    socket.off("track_finished");
    socket.off("track_play_pause");

  }

  function isCurrentPlayer() {
    /* Check the playlist id*/
    Playlists.findOne({_id: player_subscription}).success( function (playlist) {

      /* If the user is the admin of a playlist */
      if (playlist) {

        if (playlist.player == user_id) {
          return true
        } else {
          return false;
        }
      } else {
        return false;
      }
    }).error (function (err) {
      console.log(err);
      return false;
    });
  }

  function clientSubscribe(data) {
    var playlist_id = data.playlist_id;

    /* Find the playlist */
    Playlists.findOne({_id: new ObjectId(playlist_id)}).success(function (playlist) {
      if (playlist) {
        /* Save the currently subscribed playlist */
        client_subscription = playlist._id;

        /* Join the socket to the this playlists's socket room */
        socket.join(playlist._id);

        /* Send an initial state_change event to populate */
        utils.sendStateChange(socket, playlist, "client_subscribe");
      }
    });

    console.log("Client Subscribing");
  }

  function playerSubscribe (data) {
    var playlist_id = data.playlist_id;
    var force = (data.force) ? true : false;

    /* In the case that the server crashes before it can clean up*/
    if (force) {
      console.log("Forcing play subscription...");
    }

    /* Check the playlist id*/
    Playlists.findOne({_id: playlist_id, admin: user_id}).success( function (playlist) {

      /* If the user is the admin of a playlist */
      if (playlist) {

        /* If the playlist already has a registerd player */
        if (playlist.player && !force) {
          socket.emit("player_subscribe_response", {
            message: "Player already connected. Disconnect first..."
          });

        /* Register the player in the DB */
        } else {
          Playlists.update({_id: playlist._id}, {
            $set: {
              player: user_id
            }
          }, {"new": true}).success(function (playlist) {

            /* Subscribe the player as a client */
            clientSubscribe(data);

            /* Register player listeners */
            playerListen();
          });
        }
      } else {
        console.log("No playlist " + playlist_id + " with " + user_id + " as an admin");
        socket.emit("player_subscribe_response", {error: {message: "No playlist with this user as an admin"}});
      }
    }).error (function (err) {
      console.log(err);
      socket.emit("player_subscribe_response", {error: err});
    });

    console.log("Player subscribing");
  }

  function clientUnsubscribe() {
    /* Check if a client is subscribed */ 
    if (client_subscription) {

      /* Remove the socket from the room */
      socket.leave(client_subscription);
      client_subscription = null;      
    } else {
      console.log("No clent subscription");
    }

    console.log("Client unsubscribing");
  }

  function playerUnsubscribe() {

    /* Check if a the socket is a player, and if so, invalidate it */
    if (player_subscription) {
      Playlists.update({_id: player_subscription}, {
        $set: {
          player: null
        }
      }).success(function (playlist) {
        player_subscription = null;
        
        /* Stop listening to play updates*/
        playerStopListen();

        /* Unsubscribe as a client */
        clientUnsubscribe();
      }).error(function (err) {
        console.log(err);
      });
    } else {
      console.log("No player subscription");
    }

    console.log("Player unsubscribing");
  }
}

