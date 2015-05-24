var async = require('async');
var crypto = require('crypto');
var express = require('express');
var Graph = require('../graph');
var monk = require('monk');
var router = express.Router();
var utils = require('../utils');

var ObjectID = require('mongodb').ObjectID;
var db = monk('localhost:27017/queueup');

var Playlists = db.get('playlists');
var Users = db.get('users');

/* Playlist_id param */
router.param('playlist', function(req, res, next, id) {

  Playlists.findOne({_id: id},{}, function(err, playlist) {
    if (err){
      res.json({error: {message: "Find playlist Error: " + err}});
    }
    if (playlist) {
      req.playlist = playlist;
      return next();
    } else {
      res.json({error: {message: "Couldn't find playlist " + id}});
    }

  }); 
});

/* User_id parameter */
router.param('user', function(req, res, next, id) {

  Users.findOne({_id: id},{}, function(err, user) {
    if (err){
      res.json({error: {message: "Find user Error: " + err}});
    } else if (user) {
      req.user = user;
      return next();
    } else {
      res.json({error: {message: "Couldn't find user " + id}});
    }

  }); 
});

/** PLAYLIST ROUTES **/

/** Handle API authentication **/
router.use('/playlists', apiAuthenticate);

/** Handle API authentication **/
router.use('/users', apiAuthenticate);

router.post('/playlists', function (req, res) {
  var playlists = req.db.get('playlists');

  playlists.find({},{sort: {"last_updated": -1}, fields: {tracks: 0}}).success(function (documents) {
    res.json({playlists: documents});
  }).error(function (err) {
    res.json({error: err});
  });

});

router.post('/playlists/:playlist', function (req, res) {
  res.json({playlist: req.playlist});

});


/* ON "playlist:skip" */
router.post('/playlists/:playlist/skip', function (req, res) {
    utils.skipTrack(req.playlist, function(playlist, err) {

      if (playlist) {
        /* Broadcast the change */
        utils.emitStateChange(io, playlist, "skip_track");

        res.json({playlist: playlist});
        console.log("Skipped track");  
      } else {
        console.log(err);
        res.json(err);
      }
      
    });
});

/* ON "playlist:update" */
router.post('/playlists/:playlist/update', function (req, res) {
  // socket.emit('playlist:changed');
});

/* ON "playlist:vote" */
router.post('/playlists/:playlist/vote', function (req, res) {
  // socket.emit(playlist:changed)    
});

/* ON "playlist:import" */
router.post('/playlists/:playlist/import', function (req, res) {
  // socket.emit(playlist:changed)
});

/** User Routes **/

router.post("/users/:user", function (req, res) {
  var user = {
    _id: req.user._id,
    name: req.user.name,
  };

  if (req.user.facebook) {
    user.facebook = {
      id: req.user.facebook.id
    }
  }
  if (req.user.spotify) {
    user.spotify = {
      id: req.user.spotify.id
    }
  }

  res.json({user: user});
});

router.post("/users/:user/playlists", function (req, res) {
  Playlists.find({
    admin: req.user._id
  }, {fields: {tracks: 0}}).success(function (playlists) {

    res.json({playlists: playlists});
  }).error(function (err) {
    res.json({error: err});
  });
});

/** AUTH ROUTES **/

/* ON "auth:init" */
router.post('/auth/register', function (req, res) {
  var accessToken = req.body.facebook_access_token;
  var email = req.body.email;
  var name = req.body.name;
  var password = req.body.password;

  /* Pre-generate the client_id */
  var client_id = crypto.createHash('sha1').update(JSON.stringify(res.body + Math.random().toString())).digest('hex');

  if (accessToken) {

    /* Find user by Facebook ID */
    var G = new Graph(accessToken);
    G.get('/me', function (profile) {
      console.log(profile.id);

      /* Check to see if user exists already */
      Users.findOne({
        "facebook.id": profile.id
      }).success(function (user) {

        /* If the user exists, redirect to login router*/
        if (user) {
          res.json({error: {message: "This Facebook account is already registered"}})
        } else {
          /* Otherwise, add the user */
          console.log("new user", client_id);
          
          /* Insert record */
          Users.insert({
            name: profile.name,
            email: profile.email,
            facebook: profile,
            client_id: client_id
          }).success( function (user) {

            /* Success */
            console.log("Created account for", user.email);
            res.json({client_id: user.client_id});

          }).error(function (err) {
            res.json({error: err});
          });
        }
      }).error(function (err) {
        res.json({error: err});
      });
    });
  } else if (email && password && name) {

    /* Check if user exists already */
    Users.findOne({
      email: email
    }).success(function (user) {
      if (user) {
         res.json({error: {message: "This email is already registered"}})
      } else {

        console.log("New user", client_id);

        var hash = crypto.createHash('md5').update(password).digest('hex');
    
        /* Create the user if it doesn't already exist */
        Users.insert({
          name: name,
          email: email,
          password: hash,
          client_id: client_id
        }).success( function (user) {

          /* Success*/
          res.json({client_id: client_id});

        }).error(function (err) {
          console.log(err);
          res.json({error: err});
        });
      }
    }).error(function (err) {
      console.log(err);
      res.json({error: err});
    });
  } else {
    res.json({error: {message: "Email/pass OR access token not sent"}});
  }
});

/* Login a user */
router.post('/auth/login', function (req, res) {
  var accessToken = req.body.facebook_access_token;
  var email = req.body.email;
  var password = req.body.password;

  /* If logging in with a Facebook AcessToken */
  if (accessToken) {

    var G = new Graph(accessToken);

    /* Use the Graph API to verify the user's data  */
    G.get('/me', function (profile) {

      /* If a non-null profile response from FB*/
      if (!profile.error) {

        Users.findOne({
          "facebook.id": profile.id
        }).success(function (user) {

          /* Check if the user exists */
          if (user) {
            console.log("User found. client_id: ", user.client_id);
            res.json({client_id: user.client_id});
          } else {
            res.json({error: {
              message: "User not found"
            }});
          }
        }).error(function (err) {
          console.log(err);
          res.json({error:  err});
        });
      } else {
        res.json({error: profile.error});
      }
    });

  /* If logging in with email and password */
  } else if (email && password) {
    var hash = crypto.createHash('md5').update(password).digest('hex');
    
    /* Get the user, then verify the hash */
    Users.findOne({
      email: email
    }).success(function (user) {
      if (user && user.password == hash) {

        /* Logged in */
        res.json({client_id: user.client_id, message: "Logged in"});
      } else {

        res.json({error: {
          message: "Email and password not found"
        }});
      }
    });
  } else {
    res.json({error: {message: "Email/pass OR acces token not sent"}});
  }
});

/* Middleware to verify client ID for certain routes */
function apiAuthenticate (req, res, next) {
  var client_id = req.body.client_id;
  var email = req.body.email;

  /* Both client_id and email must be send together */
  if (client_id && email) {
    Users.findOne({
      email: email,
      client_id: client_id}).success(function (user) {

      /* If the email/token pair was found, continue to next middleware */
      if (user) {
        console.log("Authenticated client");
        return next();
      } else {
        console.log("Client not found");

        /* Don't proceed to other middleware if client ID isn't verified */
        res.json({error: {
          message: "Client not found"
        }});
      }
    }).error(function (err) {
      console.log(err);
      res.json({error:  err});
    });
  } else {
    console.log("Client ID and email not both sent");

    /* Again, client ID is not universally unique, so it must be sent with an email */
    res.json({error: {
      message: "Client id and email not sent"
    }})
  }
}

module.exports = router;
