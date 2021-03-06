/**
 * API version 2
 *
 * This API implements an HMAC-SHA1 scheme for API requests that
 * require authentication. A few routes can be accessed anonymously.
 */

var async = require('async');
var basicAuth = require('basic-auth');
var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var Graph = require('../../graph');
var monk = require('monk');
var router = express.Router();
var utils = require('../../utils');
var SpotifyWebApi = require('spotify-web-api-node');
var transform = require('../../query/transform');

var ObjectID = require('mongodb').ObjectID;

var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/../../spotify.key', {encoding: 'utf8'}));


/* Initialize an anonymous user with some device information */
router.post('/auth/init', function (req, res) {
  var device = req.body.device;

  /* Pre-generate the client_token */
  var client_token = genClientToken(req.body);

  req.Users.findAndModify({
    device: device,
    facebook: { $exists: false },
    email: { $exists: false}
  }, {
    $set: {      
      client_token: client_token
    }
  }, {upsert: true}).success(function (user) {
    res.json({
      user_id: user._id,
      client_token: client_token}
    );
  }).error(function (err) {
    sendBadRequest(res, err);
  });
});

/* Register an email client */
router.post('/auth/register', function (req, res) {
  var email = req.body.email;
  var name = req.body.name;
  var password = req.body.password;
  var user_id = req.body.user_id;
  var sent_client_token = req.body.client_token;

  /* Pre-generate the client_token */
  var client_token = genClientToken(req.body);

  if (email && password && name) {

    /* Check if user exists already */
    req.Users.findOne({
      email: email
    }).success(function (user) {
      if (user) {
         sendBadRequest(res, "This email is already registered");
      } else {

        console.log("New user", client_token);

        var hash = crypto.createHash('md5').update(password).digest('hex');

        /* If the user_id has previously been initialized */
        if (user_id) {

          /* Create the user if it doesn't already exist */
          req.Users.findAndModify({
            _id: user_id,
            client_token: sent_client_token
          }, {$set: {
            name: name,
            email: email,
            password: hash,
            client_token: client_token
          }}, {upsert: true, new: true}).success( function (user) {

            /* Success*/
            res.json({user_id: user._id, client_token: client_token});

          }).error(function (err) {
            console.log(err);
            sendBadRequest(res, err);
          });          
        } else {
          sendBadRequest(res, "user_id not sent. Needed to register user")
        }
      }
    }).error(function (err) {
      console.log(err);
      sendBadRequest(res, err);
    });
  } else {
    sendBadRequest(res, "Name, email, or password not sent");
  }
});

/* Login a user. Returns the user_id and a new token */
router.post('/auth/login', function (req, res) {
  var accessToken = req.body.facebook_access_token;
  var user_id = req.body.user_id;
  var sent_client_token = req.body.client_token;
  var email = req.body.email;
  var password = req.body.password;

  /* Generate a new client token */
  var client_token = genClientToken(req.body);

  /* If logging in with a Facebook AcessToken */
  if (accessToken) {

    var G = new Graph(accessToken);

    /* Use the Graph API to verify the user's data  */
    G.get('/me', function (profile) {

      // console.log(profile);

      /* If a no error from FB*/
      if (!profile.error) {

        /* We want to regenerate the token at every login request */
        req.Users.findOne({
          "facebook.id": profile.id
        }).success(function (user) {


          if (user) {
            /* In system without a token */
            console.log("User is in db. Handing out new token");
            req.Users.update({
              _id: user._id
            }, {
              $set: {
                client_token: client_token
              }
            }).success(function () {
              res.json({user_id: user._id, client_token: client_token});
            }).error(function (err) {
              sendBadRequest(res, err);
            });

          } else {

            /* New user */
            console.log("new user token", client_token);

            /* Insert record */
            req.Users.insert({
              name: profile.name,
              email: profile.email,
              loginOrigin: 'api',
              facebook: profile,
              client_token: client_token
            }).success( function (user) {

              /* Success */
              console.log("Created account for", user.email);
              res.json({user_id: user._id, client_token: client_token});

            }).error(function (err) {
              sendBadRequest(res, err);
            });
          }

        }).error(function (err) {
          sendBadRequest(res, err);
        });
      } else {
        res.json({error: profile.error});
      }
    });

  /* If logging in with email and password */
  } else if (email && password) {
    var hash = crypto.createHash('md5').update(password).digest('hex');

    /* Get the user, then verify the hash */
    req.Users.findAndModify({
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

  /* Logging in anonymously with a unique device identifier */
  } else {
    sendBadRequest(res, "Neither email/pass or access token sent");
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

  req.Playlists.findOne({_id: playlist_id},{}, function(err, playlist) {
    if (err){
      sendBadRequest(res, "Find playlist Error: " + err);
    }
    if (playlist) {

      transform.playlist(req, playlist, function (playlist) {
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

  req.Users.findOne({_id: id},{}, function(err, user) {
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

/* Search spotify with a page offset*/
router.get('/search/tracks/:query/:offset?', function (req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;

  /* Essentially wrap the Spotify search by the server to not require authentication */
  req.spotify.searchTracks(req.params.query, {limit: 10, offset: offset, market: "US"}).then(function(data) {
    res.json({tracks: data.body.tracks.items});
  }, function(err) {
    console.log("Query error: ",err);
    sendBadRequest(res, err);
  });
});

router.post('/spotify/users/:spotifyuser/playlists/:offset?', function(req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;
  var user = req.params.spotifyuser;
  var accessToken = req.body.access_token;

  var spotify = new SpotifyWebApi(spotifyConfig);

  spotify.setAccessToken(accessToken);

  /* Query spotify with an optional offset for pages of results */
  spotify.getUserPlaylists(user, {limit: 10, offset: offset}).then(function(data) {
    var response = {};
    var playlists = data.body.items;
    console.log("Playlists found for user \"" + user + "\": " +  playlists.length);

    res.json({playlists: playlists});
  }, function(err) {
    console.log("Query error: ",err);
    res.json({error: err});
  });
});


router.get('/search/playlists/:query', function (req, res) {

  /*  Strip anything that isn't alphanumeric or whitespace
      The idea here is to replace those characters with a ".",
      which will match any character reluctantly
  */
  var query = req.params.query.replace(/[^A-Za-z0-9]+/gi, '.+?');

  /* Match starts of words */
  var regex = '\\b' + query + '.*?\\b';
  var query_regex = { $regex: regex, $options: 'i' };

  console.log("Searching for '" + query + "'");

  var playlists = [];

  /* Search using the regex and return the simplified results*/
  req.Playlists.find({
    $or: [
        {'name': query_regex},
        {'admin_name': query_regex}
    ]
    
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

  req.Playlists.find({},{sort: {"last_updated": -1}, fields: {tracks: 0}}).success(function (documents) {
    res.json({playlists: documents});
  }).error(function (err) {
    sendBadRequest(res, err);
  });

});

router.post('/playlists/nearby/:offset?', function (req, res) {

  var location = req.body.location;
  var offset = (req.params.offset) ? req.params.offset : 20;
  var max = 2.0 * 1609.34; // 2 mi in meters

  if (location.latitude && location.longitude) {
    var point = {
        type: "Point",
        coordinates: [location.longitude, location.latitude]
    };
    
    req.Playlists.col.aggregate([
      {$geoNear: {
        distanceField: "distance",
        spherical: true,
        near: point,
        maxDistance: max
      }},
      /* Aggregate $project only allows for inclusion, not exclusion... */
      {$project: {
        admin: 1,
        admin_name: 1,
        key: 1,
        name: 1, 
        play: 1,
        location: 1,
        current: 1,
        distance: 1
      }},
      {$sort: {
        distance: 1
      }}
    ], function (err, documents) {
      if (err) {
        sendBadRequest(res, err);        
      } else {
        res.json({playlists: documents});
      }
    });
  } else {
    sendBadRequest(res, "location.latitude and location.longitude required");
  }

});


/* Get a playlist's info */
router.get('/playlists/:playlist', function (req, res) {
  res.json({playlist: req.playlist});
});


/** AUTHENTICATED ROUTES: All routes from now on require an authenticated user **/
router.use('/', requireAuth);


/* Add track to a playlist */
router.post('/playlists/:playlist/add', function (req, res) {

  if (req.body.track_id) {
    var track_id = req.body.track_id;
    utils.addTrackToPlaylist(req, track_id, req.playlist, function(err, playlist) {
      if (err) {
        sendBadRequest(res, err);
      } else {
        utils.emitStateChange(req, playlist, "add_track");
        res.json({message: "Success"});
      }
    });
  } else {
    // console.log(req.body);
    sendBadRequest(res, "No track_id sent");
  }
});

/* Add multiple tracks to a playlist */
router.post('/playlists/:playlist/add_multiple', function (req, res) {

  if (req.body.tracks) {
    var playlist = req.playlist;
    async.eachSeries(req.body.tracks, function (item, callback) {
      utils.addTrackToPlaylist(req, item, playlist, function (err, p) {
        if (err) {
          callback(err);
        } else {
          playlist = p;
          callback();
        }
      });
    }, function (err) {
      if (err) {
        sendBadRequest(res, err);
      } else {
        utils.emitStateChange(req, playlist, "add_track_multiple");
        res.json({playlist: playlist});
      }
    });
  } else {
    sendBadRequest(res, "No tracks sent");
  }
});

/* Create a new playlist */
router.post('/playlists/new', function (req, res) {
  var playlist = req.body.playlist;

  if (playlist && playlist.name) {

    var key = playlist.name.replace(/[^\w]/gi,'').toLowerCase();

    var location = (playlist.location ) ? {
      type: "Point",
      coordinates: [playlist.location.longitude, playlist.location.latitude]
    } : null;

    console.log("Creating playlist at", playlist.location);
    req.Playlists.insert({
      admin: req.apiUser._id,
      admin_name: req.apiUser.name,
      key: key,
      name: playlist.name,
      playing: false,
      location: location,
      volume: 50,
      date_created: new Date().getTime(),
      last_updated: new Date().getTime()

    }).success(function (playlist) {

      res.json({playlist: playlist});
    }).error(function (err) {

      sendBadRequest(res, err);
    });


  } else {
    sendBadRequest(res, "Playlist and name not given");
  }
});


/* Relocate a playlist */
router.post('/playlists/:playlist/relocate', function (req, res) {

  /* Make sure user is the admin of the playlist */
  if (req.apiUser._id.equals(req.playlist.admin)) {
    var location = req.body.location;

    if (!location) {
      return sendBadRequest(res, "Location field not set");
    }
    if (!location.longitude || !location.latitude) {
      return sendBadRequest(res, "location.latitude and location.longitude fields must be set");
    }
    console.log("Updating: " + update);

    var update = {};
    update.location = {
      type: "Point",
      coordinates: [location.longitude, location.latitude]
    };

    req.Playlists.findAndModify({
      _id: req.playlist._id
    }, {
      $set: update
    }, {
      "new": true
    }).success(function (playlist) {
      console.log("Playlist", playlist._id, "relocated to", location);
      res.json({playlist: playlist});
    }).error(function (err) {
      sendBadRequest(res, err);
    });

  } else {
    sendBadRequest(res, "User is not the admin");
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

      req.Playlists.findAndModify({
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

        sendBadRequest(res, err);
      });

    } else {
      sendBadRequest(res, "New name not set.");
    }

  } else {
    sendBadRequest(res, "User is not the admin");
  }

});

/* Reset a playlist */
router.post('/playlists/:playlist/reset', function (req, res) {

  /* Make sure user is the admin of the playlist */
  if (req.apiUser._id.equals(req.playlist.admin)) {

    utils.resetPlaylist(req, req.playlist, function (playlist, err) {
      if (playlist) {
        res.json({playlist: playlist});
      } else {
        sendBadRequest(res, err);
      }
    });

  } else {
    sendBadRequest(res, "User is not the admin");
  }

});



/* Delete a playlist */
router.post('/playlists/:playlist/delete', function (req, res) {

  /* Make sure user is the admin of the playlist */
  if (req.apiUser._id.equals(req.playlist.admin)) {

    req.Playlists.remove({
      _id: req.playlist._id
    }).success(function (count) {

      if (count == 1) {
        res.json({success: true});
      } else {
        sendBadRequest(res, "Deleted " + count + " records.");
      }
    }).error(function (err) {

      sendBadRequest(res, err);
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

  utils.voteOnTrack(req, trackId, upvote,
    function (playlist) {

      utils.emitStateChange(req, playlist, "vote");

      transform.playlist(req, playlist, function (playlist) {
        res.json({playlist: playlist});
      });
  }, function (message) {
    sendBadRequest(res, message);
  }, function (err) {
    sendServerError(err);
  });

});

/* Delete a track from a playlist */
router.post('/playlists/:playlist/delete/track', function(req, res) {
  var playlists = req.Playlists;

  var trackId = req.body.track_id;
  req.Playlists.findAndModify({
    _id: req.playlist._id,
    "tracks._id": new ObjectID(trackId),
    $or: [
      { "tracks.addedBy._id": req.apiUser._id },
      { "admin": req.apiUser._id }
    ]
  }, {
    $pull: {
      tracks: {
        _id: new ObjectID(trackId)
      }
    }
  }, {
    "new": true
  }).success(function (playlist) {
    if (playlist) {
      console.log("Deleted track", trackId, " from ", playlist._id);

      utils.emitStateChange(req, playlist, "track_deleted");

      transform.playlist(req, playlist, function (playlist)  {
        res.json({playlist: playlist});
      });
    } else {
      console.log("User is not allowed to delete this track...");
      sendBadRequest(res, "You are not allowed to delete this track");
    }
  }).error(function (err) {
    sendBadRequest(res, err);
  });
});

/* Import a spotify playlist into queueup */
router.post('/playlists/:playlist/import', function (req, res) {
  // socket.emit(playlist:changed)
});

/** User Routes **/

/* Describe a user */
router.get("/users/:user", function (req, res) {
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
router.get("/users/:user/playlists", function (req, res) {
  req.Playlists.find({
    admin: req.user._id
  }, {
    fields: {tracks: 0},
    sort: {last_updated: -1}
  }).success(function (playlists) {

    res.json({playlists: playlists});
  }).error(function (err) {
    sendBadRequest(res, err);
  });
});

router.post("/users/:user/name", function (req, res) {
  if (req.body.name) {
    req.Users.findAndModify({
      _id: req.user._id
    }, {
      $set: {
        name: req.body.name
      }
    }, {"new": true}).success(function (user) {
      res.json({user: user});
    }).error(function (err) {
      sendBadRequest(res, err);
    });
  } else {
    sendBadRequest(res, "No name sent");    
  }
});

/* Show a user's Facebook friends' playlists */
router.post("/users/friends/playlists", function (req, res) {

  /* Get the QueueUp ids from the FB ids    */
  req.Users.find({
    'facebook.id': {$in : req.body.fb_ids}
  }).success(function (friends) {

    var friendIds = [];
    var i;
    for (i =0; i < friends.length; i++) {
      friendIds.push(friends[i]._id);
    }

    req.Playlists.find({
      admin: {$in: friendIds}
    }, {
      fields: {tracks: 0},
      sort: { last_updated: -1}
    }).success(function (playlists) {
      res.json({playlists: playlists});
    }).error(function (err) {
      sendBadRequest(res, err);
    });

  }).error(function (err) {
    sendBadRequest(res, err);
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
    return sendBadRequest(res, "User time is out of sync with server");
  }

  var user_id = auth.name;
  var signature = auth.pass;

  /* user_id must be sent to get the key */
  if (user_id) {
    req.Users.findOne({
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
        console.log("Client not found: ", user_id);
        /* Don't proceed to other middleware if client token isn't verified */
        sendForbidden(res, "Client not found: ", user_id);
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
