var express = require('express');
var utils = require('../utils');
var router = express.Router();
// playlist param
router.param('playlist', function(req, res, next, id) {
  var playlists = req.db.get('playlists');

  playlists.findOne({key: id},{}, function(err, playlist) {
    if (err){
       return next(new Error("Find playlist Error: " + err));
    }
    if (playlist) {
      req.playlist = playlist;
      return next();
    } else {
       return next(new Error("Cound't find playlist " + id));
    }
  }); 

});

// GET /playlist/[playlist]
router.get('/:playlist', function(req, res) {
  console.log(req.playlist);

  var next_state = (req.playlist.play) ? "pause" : "play"; 
  var play_state = (req.playlist.play) ? "true" : "false"; 

  var is_admin = false;

  if (req.user) {
    if (req.user._id.equals(req.playlist.admin)) {
      is_admin = true;
    }
  }
  console.log(is_admin);
  /* Check for a current track playing */
  if (req.playlist.current) {

    /* Get the tracks in the queue */
    req.db.get('queue').find(
      {playlist: req.playlist._id},
      {fields: {_id: 0, track: 1, added: 1, votes: 1}}
    ).success(function(queue) {
      console.log("Album images: ", req.playlist.current.album.images);

      var current = req.playlist.current;
      var current_name = "Nothing playing";
      var current_artist = "";
      var current_album_art = "";

      if (typeof current != 'undefined') {
        current_name = current.name;
        current_artist = current.artists[0].name;
      }

      res.render('playlist', {
        next_state: next_state,
        play_state: play_state,
        album_art_url: req.playlist.current.album.images[0].url,
        is_admin: is_admin,
        playlist: req.playlist,
        current_name: current_name,
        current_artist: current_artist,
        current_album_art: current_album_art,
        user: req.user,
        queue: queue
      });
    }).error(function(err) {
      res.json(err);
      console.log(err);
    });
  } else {
    res.render('playlist', {
      next_state: next_state,
      play_state: play_state,
      playlist: req.playlist,
      is_admin: is_admin,
      current: "Nothing playing",
      user: req.user,
      queue: []
    });
  }
});

// POST /playlist/[playlist]/play
// Change the playing status of the track (true | false)
router.post('/:playlist/play', function(req, res) {
  var play = (req.body.play == "true"); // Toggle play/pause

  // Only the administrator can play/pause the track
  if (req.user && req.user._id.equals(req.playlist.admin)) {
    req.db.get('playlists').update(
      { _id: req.playlist._id },
      { $set: {
         play: play,
         last_updated: new Date().getTime()
        }
      }, function() {
         console.log("Updated play to " + play);
         // Update socket playlists
         req.io.to(req.playlist.key).emit('state_change', {
           play: play,
           volume: req.playlist.volume,
           track: req.playlist.current,
           trigger: "play"
         });
         // Send current state back
         res.json({play: play});
    });    
  } else {
    res.json({error: "Only admin can play/pause"})
  }

});

// POST /playlist/[playlist]/volume
// Change the playback volume of the track [0-100]
router.post('/:playlist/volume', function(req, res) {

  // Only the administrator can play/pause the track
  if (req.user && req.user._id.equals(req.playlist.admin)) {
    var volume = Math.min(Math.abs(req.body.volume), 100);

    req.db.get('playlists').findAndModify({
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
       req.io.to(req.playlist.key).emit('state_change', {
         play: playlist.play,
         volume: volume,
         track: playlist.current,
         trigger: "volume"
       });
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
router.post('/:playlist/add/:trackid', function(req, res) {
  if (req.params.trackid) {

    /* First get the track information from Spotify */
    req.spotify.getTrack(req.params.trackid).then(function(track) {
      
      /* track should be defined if Spotify found a valid track */
      if (track) {

        /* If there isn't a current track, don't put this in the queue */
        if (!req.playlist.current) {

          /* Set the current track to the one just added */
          req.db.get('playlists').findAndModify(
            {_id: req.playlist._id},
            {
              $set: {
                current: track
              }
            }, { new: true }
          ).success(function(playlist) {
            console.log(req.playlist);

            if (playlist) {

              /* playlist found in DB */
              req.io.to(req.playlist.key).emit('state_change', {
                play: playlist.play,
                volume: playlist.volume,
                track: playlist.current,
                trigger: "add_track"

              });
            } else {
              res.json({error: "playlist not found :("});
            }
          }).error(function (err) {
            req.json({error: err});
          });

        /* Add the track to the end of the queue */
        } else {

          /* Insert it into the playlist's queue */
          req.db.get('queue').insert(
            {
              playlist: req.playlist._id,
              track: track,
              added: new Date().getTime()
            }
          ).success(function() {
              /* Added successfully */
              console.log("Added track: ", track);

              /* Retreive the queue */
              req.db.get('queue').find({
                playlist: req.playlist._id
              }, {
                fields: {_id: 0, track: 1, added: 1, votes: 1}
              }).success(function (queue) {
                res.json({message : "Added track successfully"});

                req.io.to(req.playlist.key).emit('state_change', {
                  play: req.playlist.play,
                  volume: req.playlist.volume,
                  track: req.playlist.current,
                  queue: queue,
                  trigger: "add_track_queue"
                });
              }).error(function (err) {
                res.json({error: err});
              });


          }).error(function(err) {

            /* MongoDB error */
            res.json({
              error: "Error adding the track to the queue"
            });
          });
        }

       
      } else {

        /* If the response from Spotify was undefined */
        res.json({
          error: "Track not found",
          message: "TrackID: " + req.params.trackid
        });
      }
      
    });
  } else {
    res.status(404).end();
  }
});

// Called when the current track is to be ended and the next in the queue is to be played
// POST /playlist/:playlist/skip
router.post('/:playlist/skip', function(req, res) {

  // Only the administrator can play/pause the track
  if (req.user && req.user._id.equals(req.playlist.admin)) {
    // Find and remove the first item in the queue
    utils.skipTrack(req.db, req.io, req.playlist, function (result) {

      res.json(result);
    });
  } else {
    res.json({error: "Only admin can skip tracks"});
  }
});

module.exports = router;
