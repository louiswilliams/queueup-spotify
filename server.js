var apiRouter = require('./routes/api');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var Graph = require('./graph');
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
  
  var user_id = null;
  var playlist_player = null;

  /* Disconnect handler */
  socket.on('disconnect', function () {

    /* Clean up if player disconnects */
    if (playlist_player) {
      Playlists.update({_id: playlist._id}, {
        $set: {
          player: null
        }
      }).success(function () {
        playlist_player = null;
      });
    }
  })

  /* ON "playlist:all" */
  socket.on('playlist:all', function (data) {
    console.log('playlist_all');
    Playlists.find({}, {sort: {
      last_udpated: -1
    }}).success(function (playlists) {
      socket.emit('playlist:all:result', playlists);
    }).error(function (err) {
      console.log(err);
      socket.emit('error', {
        message: "Error listing playlists: " + JSON.stringify(err),
        event: 'playlist:all'
      });
    });
  });

  /* ON "playlist:subscribe" */
  socket.on('playlist:subscribe', function (data) {
    Playlists.findOne({_id: new ObjectId(data.id)}).success(function (playlist) {
      if (playlist) {
        socket.join(data.id);

        utils.sendStateChange(socket, playlist, "playlist_subscribe");
      }
    });
  });

  /* ON "playlist:unsubscribe" */
  socket.on('playlist:unsubscribe', function (data) {
    Playlists.findOne({_id: new ObjectId(data.id)}).success(function (playlist) {
      if (playlist) {
        socket.leave(data.id);      
      }
    });
  });

  /* ON "playlist:update" */
  socket.on('playlist:update', function (data) {
    // socket.emit('playlist:changed');
  });

  /* ON "playlist:skip" */
  socket.on('playlist:skip', function (data) {
    Playlists.findOne({_id: data._id}).success(function (playlist) {
      utils.skipTrack(playlist, function(playlist, err) {

        if (playlist) {
          /* Broadcast the change */
          utils.emitStateChange(io, playlist, "skip_track");

          console.log("Skipped track");  
        } else {
          console.log(err);
        }
        
      });
    }).error(function (err) {
      console.log(err);
    });
  });

  /* ON "playlist:vote" */
  socket.on('playlist:vote', function (data) {
    // socket.emit(playlist:changed)    
  });

  /* ON "playlist:import" */
  socket.on('playlist:import', function (data) {
    // socket.emit(playlist:changed)
  });

  /* ON "playlist:player:request" */
  socket.on('playlist:player:request', function (data) {
    if (user_id && data.id) {
      Playlists.findOne({_id: data.id, admin: user_id})
      .success( function (playlist) {
        if (playlist.player) {
          socket.emit("error", {
            message: "Player already connected. Disconnect first...",
            event: "playlist:player:request"
          });
        } else {
          Playlists.update({_id: playlist._id}, {
            $set: {
              player: user_id
            }
          }).success(function () {
            playlist_player = playlist._id;            
            socket.join(playlist._id);
            socket.emit("playlist:player:connected");
          });
        }
      }).error (function (err) {
        console.log(err);
      })
    } else {
      socket.emit('error', {
        message: "Either user not authenticated or no playlist_id sent",
        event: "playlist:player:request"
      });
    }
  });

  /* ON "playlist:player:disconnect" */
  socket.on('playlist:player:disconnect', function (data) {
    if (user_id && data.id) {
      Playlists.findOne({_id: data.id, admin: user_id})
      .success( function (playlist) {
        if (playlist) {
          Playlists.update({_id: playlist._id}, {
            $set: {
              player: null
            }
          }).success(function () {
            playlist_player = null;
            socket.leave(playlist._id);
            socket.emit("playlist:player:disconnected");
          })
        } else {
          socket.emit('error', {
            message: "No playlist found for this user",
            event: "playlist:player:disconnect"
          });

        }
      }).error (function (err) {
        console.log(err);
      })
    } else {
      socket.emit('error', {
        message: "Either user not authenticated or no playlist_id sent",
        event: "playlist:player:disconnect"
      });
    }
  });

  /* ON "auth:init" */
  socket.on('auth:init', function (data) {
    console.log("auth:init - ",data);

    if (data.facebook_access_token) {

      /* Find user by Facebook ID */
      var G = new Graph(data.facebook_access_token);
      G.get('/me', function (profile) {
        console.log(profile.id);
        Users.findOne({
          "facebook.id": profile.id
        }).success(function (user) {
          if (user) {

            /* Set the current session as authenticated and broadcast success */
            socket.emit('auth:init:success', {client_id: user.client_id, message: "Verified Facebook account"});

          } else {

            if (profile.email) {

              /* Create the user if it doesn't already exist */
              var client_id = crypto.createHash('sha1').update(JSON.stringify(profile + Math.random().toString())).digest('hex');
              console.log("new user", client_id);
              
              Users.insert({
                email: profile.email,
                facebook: profile,
                client_id: client_id
              }).success( function (user) {
                socket.emit('auth:init:success', {client_id: user.client_id, message: "Created account"});
              }).error(console.log);
            }
          }
        }).error(console.log);
      });
    } else if (data.email && data.password) {

      /* Find user by email and password*/

      var hash = crypto.createHash('md5').update(data.password).digest('hex');
      
      Users.findOne({
        email: data.email
      }).success(function (user) {
        if (user) {
          if (user.password == hash) {

            /* Set the current session as authenticated and broadcast success */
            socket.emit('auth:init:success', {client_id: user.client_id, message: "Logged in"});
          } else {

            /* Broadcast error */
            socket.emit('error', {
              message: "Incorrect password",
              event: "auth:init"
            });
          }
        } else {

          var client_id = crypto.createHash('sha1').update(JSON.stringify(data + Math.random().toString())).digest('hex');
          console.log("New user", client_id);

          /* Create the user if it doesn't already exist */
          Users.insert({
            email: data.email,
            password: hash,
            client_id: client_id
          }).success( function (user) {
            socket.emit('auth:init:success', {client_id: client_id, message: "Created account"});
          }).error(console.log);
        }
      }).error(console.log);
    }
  });

  /* ON "auth:request" */
  socket.on('auth:request', function (data) {
    console.log("auth:request - ",data);
    /* Check client ID and emails */
    if (data.client_id && data.email) {
      Users.findOne({
        email: data.email,
        client_id: data.client_id})
      .success(function (user) {
        if (user) {
          console.log("Authenticated client");
          
          user_id = user._id;
          socket.emit('auth:request:success', {message: "Authenticated successfully"});
        } else {
          console.log("Client not found");
        }
      }).error(console.log);
    } else {
      console.log("Client ID and email not both sent");
      socket.emit("error", {
        message: "Client id and email not found",
        event: "auth:request"
      });
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
