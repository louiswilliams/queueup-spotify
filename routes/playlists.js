var async = require('async');
var express = require('express');
var ObjectID = require('mongodb').ObjectID;
var transform = require('../query/transform');
var utils = require('../utils');
var router = express.Router();


// router.use(function (req, res, next) {
//   if (!req.user) {
//     req.session.redirect_after = req.protocol + '://' + req.get('host') + req.originalUrl;
//     return res.redirect("/auth/facebook");
//   }
//   return next();  
// });

// playlist param
router.param('playlist', function(req, res, next, id) {
  var playlists = req.db.get('playlists');
  playlists.findOne({_id: id},{}, function(err, playlist) {
    if (err){
       return next(new Error("Find playlist Error: " + err));
    }
    if (playlist) {
      transform.playlist(playlist, function (p) {
        req.playlist = p;
        return next();
      });
    } else {
       return next(new Error("Cound't find playlist " + id));
    }
  }); 
});

router.param('name', function(req, res, next, id) {
  if (req.playlist.key != id) {
    res.redirect('/playlist/' + req.playlist._id + '/' + req.playlist.key);
  } else {
    return next();  
  }
});

// Pretty mode (for player)
// GET /playlist/[id]/[name]/pretty
router.get('/:playlist/:name?/pretty', function(req, res) {
  getPlaylist(req, res, true);
});

// GET /playlist/[id]/[name]
router.get('/:playlist/:name?', function(req, res) {
  getPlaylist(req, res);
});

function getPlaylist (req, res, pretty) {

  var next_state = (req.playlist.play) ? "pause" : "play"; 
  var play_state = (req.playlist.play) ? "true" : "false"; 

  var is_admin = false;
  var pretty = (pretty == true) ? true : false;

  if (req.user) {
    if (req.user._id.equals(req.playlist.admin)) {
      is_admin = true;
    }
  }

  var current = req.playlist.current;

  var current_name = "Nothing playing";
  var current_artist = "";
  var current_album_art = "";

  if (current) {
    current_name = current.name;    
    current_artist = current.artists[0].name;    
    current_album_art = current.album.images[0].url;
  }

  var queue = [];
  if (req.playlist.tracks) {
    queue = req.playlist.tracks;
  }
  res.render('playlist', {
    next_state: next_state,
    play_state: play_state,
    album_art_url: current_album_art,
    is_admin: is_admin,
    playlist: req.playlist,
    current_name: current_name,
    current_artist: current_artist,
    current_album_art: current_album_art,
    user: req.user,
    pretty: pretty,
    queue: queue
  });
}

// POST /playlist/[playlist]/play
// Change the playing status of the track (true | false)
router.post('/:playlist/:name?/play', function(req, res) {
  var play = (req.body.play == "true"); // Toggle play/pause
  var playlists = req.db.get('playlists');

  // Only the administrator can play/pause the track
  // if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {
    playlists.findAndModify(
      { _id: req.playlist._id },
      { $set: {
         play: play,
         last_updated: new Date().getTime()
        }
      }, {"new": true}).success(function (playlist) {
         console.log("Updated play to " + play);
         // Update socket playlists

        utils.emitStateChange(req.io, playlist, "play");

        // Send current state back
        res.json({play: play});
    });    
  // } else {
  //   res.json({error: "Only admin can play/pause"})
  // }

});

// POST /playlist/[playlist]/volume
// Change the playback volume of the track [0-100]
router.post('/:playlist/:name?/volume', function(req, res) {
  var playlists = req.db.get('playlists');

  // Only the administrator can play/pause the track
  if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {
    var volume = Math.min(Math.abs(req.body.volume), 100);

    playlists.findAndModify({
      query: { _id: req.playlist._id },
      update: {
        $set: {
          volume: volume,
          last_updated: new Date().getTime()
        }
      }
    }).success(function(playlist) {
       console.log("Updated volume to ", volume);
       
       // Update socket playlists
       utils.emitStateChange(req.io, req.playlist, "volume");

       // Send current state back
       res.json({volume: volume});
    }).error(function (err) {
      console.log(err);
      res.json(err);
    });
  } else {
    res.json({error: "Only admin can change volume"});
  }
});

// POST /playlist/[playlist]/add/[trackid]
// Adds a track to the playlist's queue
router.post('/:playlist/:name?/add/:trackid', function(req, res) {
  if (req.params.trackid) {

    utils.addTrackToPlaylist(req, req.params.trackid, req.playlist, function(err) {
      if (err) {
        res.end(err);
      } else {
        res.json({message: "Success"});
      }
    });

  } else {
    res.status(404).end();
  }
});

// Called when the current track is to be ended and the next in the queue is to be played
// POST /playlist/:playlist/skip
router.post('/:playlist/:name?/skip', function(req, res) {

  // Only the administrator can play/pause the track
  // if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {
    // Find and remove the first item in the queue
    utils.skipTrack(req.playlist, function (playlist, err) {
      if (playlist) {
        /* Broadcast the change */

        utils.emitStateChange(req.io, playlist, "next_track");

        res.json({message: "Skipped track"});
      } else {
        res.json(err);
      }
    });
  // } else {
  //   res.json({error: "Only admin can skip tracks"});
  // }
});

// POST /playlist/:playlist/delete/:id
router.post('/:playlist/:name?/delete/:id', function(req, res) {
  var playlists = req.db.get('playlists');

  var trackId = req.params.id;
  if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {

    playlists.findAndModify({
      _id: req.playlist._id
    }, {
      $pull: {
        tracks: {
          _id: new ObjectID(trackId)
        }
      }
    }, {
      "new": true
    }).success(function (playlist) {
      console.log(playlist);

      utils.emitStateChange(req.io, playlist, "track_deleted");

      res.json({message: "Deleted successfully"});
    }).error(function (err) {
      res.end(err);
    });

  } else {
    res.json({error: "Only admin can delete tracks"});
  }
});

// POST /playlist/:playlist/vote/:id
router.post('/:playlist/:name?/vote/:id', function(req, res) {

  if (!req.user) {
    req.session.redirect_after = req.protocol + '://' + req.get('host') + '/playlist/' + req.playlist._id;
    
    return res.json({redirect: "/auth/facebook"});
  }

  var playlists = req.db.get('playlists');

  var trackId = req.params.id;

  playlists.findAndModify({
    _id: req.playlist._id,
    "tracks._id": trackId
  }, {
    $inc: {
      "tracks.$.votes": 1
    },
    $push: {
      "tracks.$.voters": req.user._id
    }
  }, {
    "new": true
  }).success(function (playlist) {
    var queue = (playlist.tracks) ? playlist.tracks : [];
    console.log(playlist);

    utils.emitStateChange(req.io, playlist, "upvote");

    res.json({message: "Voted successfully"});
  }).error(function (err) {
    res.end(err);
  });
});

router.post('/:playlist/:name?/reorder', function(req, res) {
  var playlists = req.db.get('playlists');
  var tracks = req.playlist.tracks;
  var move = req.body;

  if (move.id && move.from && move.to) {

    /* Move the source track to where it was moved */
    var source = tracks.splice(move.from, 1)[0];
    tracks.splice(move.to, 0, source);

    // console.log(tracks);

    /* Insert the modified tracks list */
    playlists.findAndModify({
      _id: req.playlist._id
    }, {
      $set: {
        tracks: tracks
      }
    }, {
      "new": true
    }).success(function (playlist) {

      utils.emitStateChange(req.io, playlist, "queue_reordered");

      res.json({message: "Reordered successfully"});

    }).error(function (err) {
      console.log(err);
      res.end(err);
    });
  } else {
    res.end();
  }
});


// List importable playlists
router.get('/:playlist/:name?/import', function(req, res) {
  // Check first if admin
  if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {

    // Get the api object, as well as the new user object if it changed
    utils.getSpotifyApiForUser(req.user, function (err, spotify, user) {
      if (err) {
        res.end(err);
      } else {
        // Update the DB access token if it changed
        if (user) {
          utils.updateUser(req.db, req.user, {
            "spotify.accessToken": user.accessToken,
            "spotify.tokenExpiration": user.tokenExpiration
          });
        }

        // Get all the user's playlists
        spotify.getUserPlaylists(req.user.spotify.id, {limit: 50}).then(function(data) {
          res.render('import', {
            playlists: data.items,
            currentPlaylist: req.playlist
          });
        }, function(err) {
          res.end(err);
        });        
      }
    });
  } else {
    res.json({error: "Only admin can import"});
  }
});

// Import a Spotify playlist (owner/id) into the current playlist
router.get('/:playlist/:name?/import/:owner/:id', function(req, res) {
  if (utils.userIsPlaylistAdmin(req.user, req.playlist)) {

    // Get the api object, as well as the new user object if it changed
    utils.getSpotifyApiForUser(req.user, function (err, spotify, user) {
      if (err) {
        res.end(err);
      } else {
        // Update the DB access token if it changed
        if (user) {
          utils.updateUser(req.db, req.user, {
            "spotify.accessToken": user.accessToken,
            "spotify.tokenExpiration": user.tokenExpiration
          });
        }

        // Get all the user's playlists

        spotify.getPlaylistTracks(req.params.owner, req.params.id, {limit: 50}).then(function(data) {
          var tracks = data.items;
          // Insert the first one, then insert the reset.
          // This gets around the problem of wasting time retreiving the playlist data again from the database
          // At the first insert, playlist.current can be null
          var first = tracks.splice(-tracks.length, 1)[0];

          utils.addTrackToPlaylist(req, first.track.id, req.playlist, function( err, p) {
            var playlist = req.playlist;
            if (err) {
              return res.end(err);
            }
            if (p) {
              playlist = p;
            }

            // Synchronously add each track, IN ORDER
            // You wouldn't believe how troublesome this is without 'async'
            async.eachSeries(tracks, function (item, callback) {
              utils.addTrackToPlaylist(req, item.track.id, playlist, function (err, p) {
                if (err) {
                  res.end(err);
                  callback(err);
                } else {
                  playlist = p;
                  callback();
                }
              });

            }, function (err) {
              if (err) {
                res.end(err);
              }
            })
          });
          
          res.redirect('/playlist/' + req.playlist._id + '/' + req.playlist.key);
        }, function(err) {
          res.end(err);
        });        
      }
    });
  } else {
    res.json({error: "Only admin can import"});
  }
});

module.exports = router;
