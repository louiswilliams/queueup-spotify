/**
 * API version 2
 *
 * This API implements an HMAC-SHA1 scheme for API requests that
 * require authentication. A few routes can be accessed anonymously.
 */


var basicAuth = require('basic-auth');
var crypto = require('crypto');
var express = require('express');
var Graph = require('../../graph');
var monk = require('monk');
var router = express.Router();
var utils = require('../../utils');
var transform = require('../../query/transform');

var ObjectID = require('mongodb').ObjectID;
var db = monk('localhost:27017/queueup');

var Playlists = db.get('playlists');
var Users = db.get('users');


/* Register an email client */
router.post('/auth/register', function (req, res) {
  var email = req.body.email;
  var name = req.body.name;
  var password = req.body.password;

  /* Pre-generate the client_token */
  var client_token = genClientToken(req.body);

  if (email && password && name) {

    /* Check if user exists already */
    Users.findOne({
      email: email
    }).success(function (user) {
      if (user) {
         sendBadRequest(res, "This email is already registered");
      } else {

        console.log("New user", client_token);

        var hash = crypto.createHash('md5').update(password).digest('hex');

        /* Create the user if it doesn't already exist */
        Users.insert({
          name: name,
          email: email,
          password: hash,
          client_token: client_token
        }).success( function (user) {

          /* Success*/
          res.json({user_id: user._id, client_token: client_token});

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
    sendBadRequest(res, "Name or Email or pass not sent");
  }
});

/* Login a user. Returns the user_id and a new token */
router.post('/auth/login', function (req, res) {
  var accessToken = req.body.facebook_access_token;
  var email = req.body.email;
  var password = req.body.password;

  var client_token = genClientToken(req.body);

  /* If logging in with a Facebook AcessToken */
  if (accessToken) {

    var G = new Graph(accessToken);

    /* Use the Graph API to verify the user's data  */
    G.get('/me', function (profile) {

      console.log(profile);

      G.get('/me/friends', function (fbfriends) {

        console.log(fbfriends.data);

        /* If a no error from FB*/
        if (!profile.error) {

          /* We want to regenerate the token at every login request */
          Users.findOne({
            "facebook.id": profile.id
          }).success(function (user) {


            if (user) {
              /* In system without a token */
              console.log("User is in db. Handing out new token");
              Users.update({
                _id: user._id
              }, {
                $set: {
                  client_token: client_token
                }
              }).success(function () {
                res.json({user_id: user._id, client_token: client_token});
              }).error(function (err) {
                res.json({error: err});
              });

            } else {

              /* New user */
              console.log("new user token", client_token);

              /* Insert record */
              Users.insert({
                name: profile.name,
                email: profile.email,
                loginOrigin: 'api',
                facebook: profile,
                client_token: client_token,
                friends: fbfriends
              }).success( function (user) {

                /* Success */
                console.log("Created account for", user.email);
                res.json({user_id: user._id, client_token: client_token});

              }).error(function (err) {
                res.json({error: err});
              });
            }

          }).error(function (err) {
            res.json({error: err});
          });
        } else {
          res.json({error: profile.error});
        }
      });
    });

  /* If logging in with email and password */
  } else if (email && password) {
    var hash = crypto.createHash('md5').update(password).digest('hex');

    /* Get the user, then verify the hash */
    Users.findAndModify({
      email: email,
      password: hash
    }, { $set: {
      client_token: client_token
    }}, { "new": true }).success(function (user) {
      if (user) {

        /* Logged in */
        res.json({user_id: user._id, client_token: client_token});
      } else {
        sendBadRequest(res, "Email and password not found");
      }
    }).error( function (err) {
      sendBadRequest(res, err);
    });
  } else {
    sendBadRequest(res, "Email/pass OR access token not sent");
  }
});


/* Playlist_id param */
router.param('playlist', function(req, res, next, id) {

  var playlist_id;
  try {
    playlist_id = ObjectID(id);
  } catch (err) {
    console.error(err);
    return sendBadRequest(res, "Bad object ID");
  }

  Playlists.findOne({_id: playlist_id},{}, function(err, playlist) {
    if (err){
      sendBadRequest(res, "Find playlist Error: " + err);
    }
    if (playlist) {

      transform.playlist(playlist, function (playlist) {
        req.playlist = playlist;
        return next();
      });
    } else {
      sendBadRequest(res, "Couldn't find playlist " + id);
    }

  });
});

/* User_id parameter */
router.param('user', function(req, res, next, id) {

  Users.findOne({_id: id},{}, function(err, user) {
    if (err){
      sendBadRequest(res, "Find user Error: " + err);
    } else if (user) {
      req.user = user;
      return next();
    } else {
      sendBadRequest(res, "Couldn't find user " + id);
    }

  });
});

/* Routes beyond here should pass through the authentication middleware */
router.use('/', apiAuthenticate);


/** UNAUTHENTICATED ROUTES: Do not require an authenticated user **/

/* Search spotify with a page offset*/
router.get('/search/tracks/:query/:offset?', function (req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;

  /* Essentially wrap the Spotify search by the server to not require authentication */
  req.spotify.searchTracks(req.params.query, {limit: 10, offset: offset, market: "US"}).then(function(data) {
    res.json({tracks: data.body.tracks.items});
  }, function(err) {
    console.log("Query error: ",err);
    res.json({error: err});
  });
});

router.get('/search/playlists/:query', function (req, res) {

  /* Strip anything that isn't alphanumeric or whitespace*/
  var query = req.params.query.replace(/[^A-Za-z0-9]+/gi, '.+?');

  /* Match starts of words */
  var regex = '\\b' + query + '.*?\\b';
  var query_regex = { $regex: regex, $options: 'i' };

  console.log("Searching for '" + query + "'");

  var playlists = [];

  /* Search using the regex and return the simplified results*/
  Playlists.find({
    'name': query_regex
  }, {
    sort: { 'last_updated': -1 },
    fields: { 'name': 1, 'current': 1, 'admin': 1, 'admin_name': 1 }
  }).each(function (playlist) {
    var stream_regex = new RegExp(regex, 'gi');
    var allmatches = [];
    while (matches = stream_regex.exec(playlist.name)) {
        allmatches.push(matches[0]);
    }
    playlist.matches = allmatches;
    playlists.push(playlist);
  }).success(function () {
    res.json({playlists: playlists});
  }).error(function (err) {
    res.status(400).json({error: err});
  });
});

/* Get all playlists */
router.get('/playlists', function (req, res) {
  var playlists = req.db.get('playlists');

  playlists.find({},{sort: {"last_updated": -1}, fields: {tracks: 0}}).success(function (documents) {
    res.json({playlists: documents});
  }).error(function (err) {
    res.json({error: err});
  });

});

/* Get a playlist's info */
router.get('/playlists/:playlist', function (req, res) {
  res.json({playlist: req.playlist});
});


/* Add a track to a playlist */
router.post('/playlists/:playlist/add', function (req, res) {
  if (req.body.track_id) {
    var track_id = req.body.track_id;
      utils.addTrackToPlaylist(req, track_id, req.playlist, function(err) {
        if (err) {
          res.json({error: err});
        } else {
          res.json({message: "Success"});
        }
      });

    } else {
      console.log(req.body);
      sendBadRequest(res, "No track_id sent");
    }
});

/** AUTHENTICATED ROUTES: All routes from now on require an authenticated user **/
router.use('/', requireAuth);


/* Create a new playlist */
router.post('/playlists/new', function (req, res) {
  var playlist = req.body.playlist;

  if (playlist && playlist.name) {

    var key = playlist.name.replace(/[^\w]/gi,'').toLowerCase();

    Playlists.insert({
      admin: req.apiUser._id,
      admin_name: req.apiUser.name,
      key: key,
      name: playlist.name,
      playing: false,
      volume: 50,
      date_created: new Date().getTime(),
      last_updated: new Date().getTime()

    }).success(function (playlist) {

      res.json({playlist: playlist});
    }).error(function (err) {

      res.json({error: err});
    });


  } else {
    sendBadRequest(res, "Playlist and name not given");
  }
});

/* Rename a playlist */
router.post('/playlists/:playlist/rename', function (req, res) {

  /* Make sure user is the admin of the playlist */
  if (req.apiUser._id.equals(req.playlist.admin)) {
    var newName = req.body.name;

    console.log("Renaming to " + newName);

    /* If the name is set, make the update */
    if (newName) {
      var key = req.playlist.name.replace(/[^\w]/gi,'').toLowerCase();

      Playlists.findAndModify({
        _id: req.playlist._id
      }, {
        $set: {
          key: key,
          name: newName
        }
      }, {
        "new": true
      }).success(function (playlist) {

        res.json({playlist: playlist});
      }).error(function (err) {

        res.json({error: err});
      });

    } else {
      sendBadRequest(res, "New name not set.");
    }

  } else {
    sendBadRequest(res, "User is not the admin");
  }

});


/* Delete a playlist */
router.post('/playlists/:playlist/delete', function (req, res) {

  /* Make sure user is the admin of the playlist */
  if (req.apiUser._id.equals(req.playlist.admin)) {

    Playlists.remove({
      _id: req.playlist._id
    }).success(function (count) {

      if (count == 1) {
        res.json({success: true});
      } else {
        sendBadRequest(res, "Deleted " + count + " records.");
      }
    }).error(function (err) {

      res.json({error: err});
    });

  } else {
    sendBadRequest(res, "User is not the admin");
  }

});


/* Vote on a track, a vote is either cast or not at all. */
/* A true vote is to add it, false is to remove it (only positive votes) */
router.post('/playlists/:playlist/vote', function (req, res) {
  /* The track_id is given when listing tracks on a playlist */
  var trackId = req.body.track_id;
  var upvote = req.body.vote;

  utils.voteOnTrack(req.apiUser._id, req.playlist._id, trackId, upvote,
    function (playlist) {

      utils.emitStateChange(req.io, playlist, "vote");

      transform.playlist(playlist, function (playlist) {
        res.json({playlist: playlist});
      });
  }, function (message) {
    sendBadRequest(res, message);
  }, function (err) {
    sendServerError(err);
  });

});

/* Import a spotify playlist into queueup */
router.post('/playlists/:playlist/import', function (req, res) {
  // socket.emit(playlist:changed)
});

/** User Routes **/

/* Describe a user */
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

/* Show a user's playlists */
router.post("/users/:user/playlists", function (req, res) {
  Playlists.find({
    admin: req.user._id
  }, {fields: {tracks: 0}}).success(function (playlists) {

    res.json({playlists: playlists});
  }).error(function (err) {
    res.json({error: err});
  });
});

/* Show a user's Facebook friends' playlists */
router.post("/users/:user/friends/playlists", function (req, res) {
  Users.find({'facebook.id': {$in : req.body.fbids}}).success(function (friends) {
    var qupIds = [];
    friends.forEach( function(user) {
      qupIds.push(user._id)
    });

    Playlists.find({
      admin: {$in : qupIds}
    }, {fields: {tracks: 0}}).success(function (playlists) {
      res.json({playlists: playlists});
    }).error(function (err) {
      res.json({error: err});
    });
  });
});

/* Ensure that there is an authenticated API user*/
function requireAuth (req, res, next) {
  /* If the apiUser isn't set, don't allow anonymous access */
  if (req.apiUser) {
    next();
  } else {
    console.log("User FORBIDDEN");
    sendForbidden(res, "Requires authentication");
  }
}


/* Middleware to verify client token for certain routes */
/* The signature is a SHA1 hex digest of the URL in the folling form:
 *   "METHOD+HOSTNAME+PATH+TIMESTAMP"
 * where TIMESTAMP is the UNIX timestamp in SECONDS. Note that the date header
 * is accurate up to seconds, so when computing hashes, ALWAYS truncate to seconds
 */

/* We don't want to accept Date headers that are more than 5 mins old */
var MAX_DIFF = 5 * 60 * 1000;

function apiAuthenticate (req, res, next) {

  var auth = basicAuth(req);

  if (!auth) {
    return next();
  }

  /* This checks for Authentication: Basic headers */
  if (!auth.name || !auth.pass) {
    return sendBadRequest(res, "Username or password not set");
  }

  if (!req.get('Date')) {
    return sendBadRequest(res, "Date header not sent");
  }

  var curDate = new Date();

  /* The Date header must be sent, and within the 5 minute window to be valid */
  var reqDate = new Date(req.get('Date'));
  if (isNaN(reqDate)) {
    return sendBadRequest(res, "Unable to parse date: " + req.get('Date') + ". Must be in RFC2822 or ISO 8601 for predictable results.");
  }

  if (Math.abs(curDate - reqDate) > MAX_DIFF) {
    return sendBadRequest(res, "Request is out of window");
  }

  var user_id = auth.name;
  var signature = auth.pass;

  /* user_id must be sent to get the key */
  if (user_id) {
    Users.findOne({
      _id: user_id
    }).success(function (user) {

      /* If the user_id was found, continue to verify the signature */
      if (user && user.client_token) {

        /* Note that we truncate the time to the second */
        var message = [req.method, req.hostname, req.originalUrl, reqDate.getTime() / 1000].join('+');

        // console.log("Hashing: '" + message + "'");
        /* Compute the HMAC digest of the URL */
        var digest = crypto.createHmac('sha1', user.client_token).update(message).digest('hex');

        /* If the signature matches the computed digest, populate the current user parameter */
        if (digest == signature) {
          req.apiUser = user;
          return next();
        } else {
          console.log("Bad signature");
          console.log("> Signature: ", signature);
          console.log("> Hashed: ", message);
          console.log("> Result: ", digest);
          return sendBadRequest(res, "Incorrect signature");
        }
      } else {
        console.log("Client not found");
        /* Don't proceed to other middleware if client token isn't verified */
        sendForbidden(res, "Client not found");
      }
    }).error(function (err) {
      console.log(err);
      return sendBadRequest(res, err);
    });
  } else {
    /* It needs to be sent */
    return sendBadRequest(res, "user_id not set in URL");
  }

}

function genClientToken(seed) {
  return crypto.createHash('sha1').update(JSON.stringify(seed + Math.random().toString())).digest('hex');
}

function sendBadRequest(res, message) {
  res.status(400).json({error: {message: message}});
}

function sendForbidden(res, message) {
  res.status(403).json({error: {message: message}});
}

function sendServerError(res, error) {
  res.status(500).json({error: error});
}

module.exports = router;
