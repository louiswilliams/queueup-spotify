var express = require('express');
var utils = require('../utils');
var router = express.Router();
// QClient param
router.param('qclient', function(req, res, next, id) {
  var clients = req.db.get('clients');

  clients.findOne({key: id},{}, function(err, qclient) {
    if (err){
       return next(new Error("Find client Error: " + err));
    }
    if (qclient) {
      req.qclient = qclient;
      return next();
    } else {
       return next(new Error("Cound't find client " + id));
    }
  }); 

});

// GET /client/[qclient]
router.get('/:qclient', function(req, res) {
  console.log(req.qclient);

  var next_state = (req.qclient.play) ? "pause" : "play"; 
  var play_state = (req.qclient.play) ? "true" : "false"; 

  /* Check for a current track playing */
  if (req.qclient.current) {

    /* Get the tracks in the queue */
    req.db.get('queue').find(
      {client: req.qclient._id},
      {fields: {_id: 0, track: 1, added: 1, votes: 1}}
    ).success(function(queue) {
      console.log("Album images: ", req.qclient.current.album.images);
      
      res.render('client', {
        next_state: next_state,
        play_state: play_state,
        album_art_url: req.qclient.current.album.images[0].url,
        client: req.qclient,
        current: req.qclient.current,
        queue: queue
      });
    }).error(function(err) {
      res.json(err);
      console.log(err);
    });
  } else {
    res.render('client', {
      next_state: next_state,
      play_state: play_state,
      client: req.qclient,
      current: "Nothing playing",
      queue: []
    });
  }
});

// POST /client/[qclient]/play
// Change the playing status of the track (true | false)
router.post('/:qclient/play', function(req, res) {
  var play = (req.body.play == "true"); // Toggle play/pause
  req.db.get('clients').update(
    { _id: req.qclient._id },
    { $set: {
       play: play,
       last_updated: new Date().getTime()
      }
    }, function() {
       console.log("Updated play to " + play);
       // Update socket clients
       req.io.to(req.qclient.key).emit('state_change', {
         play: play,
         volume: req.qclient.volume,
         track: req.qclient.current,
         trigger: "play"
       });
       // Send current state back
       res.json({play: play});
  });
});

// POST /client/[qclient]/volume
// Change the playback volume of the track [0-100]
router.post('/:qclient/volume', function(req, res) {

  var volume = Math.min(Math.abs(req.body.volume), 100);
  req.db.get('clients').findAndModify({
    query: { _id: req.qclient._id },
    update: {
      $set: {
        volume: volume,
        last_updated: new Date().getTime()
      }
    }
  }).success(function(client) {
     console.log("Updated volume to ", volume);
     // Update socket clients
     req.io.to(req.qclient.key).emit('state_change', {
       play: client.play,
       volume: volume,
       track: client.current,
       trigger: "volume"
     });
     // Send current state back
     res.json({volume: volume});
  }).error(function (err) {
    console.log(err);
    res.json(err);
  });
});

// POST /client/[qclient]/add/[trackid]
// Adds a track to the client's queue
router.post('/:qclient/add/:trackid', function(req, res) {
  if (req.params.trackid) {

    /* First get the track information from Spotify */
    req.spotify.getTrack(req.params.trackid).then(function(track) {
      
      /* track should be defined if Spotify found a valid track */
      if (track) {

        /* If there isn't a current track, don't put this in the queue */
        if (!req.qclient.current) {

          /* Set the current track to the one just added */
          req.db.get('client').findAndModify({
            query: req.qclient,
            update: {
              $set: {
                current: track
              }
            }
          }).success(function(client) {
            if (client) {

              /* Client found in DB */
              req.io.to(req.qclient.key).emit('state_change', {
                play: req.qclient.play,
                volume: req.qclient.volume,
                track: req.qclient.current,
                trigger: "add_track"

              });
            } else {
              req.json({error: "Client not found"});
            }
          }).error(function (err) {
            req.json({error: err});
          });

        /* Add the track to the end of the queue */
        } else {

          /* Insert it into the client's queue */
          req.db.get('queue').insert(
            {
              client: req.qclient._id,
              track: track,
              added: new Date().getTime()
            }
          ).success(function() {
              /* Added successfully */
              console.log("Added track: ", track);

              /* Retreive the queue */
              req.db.get('queue').find({
                client: req.qclient._id
              }, {
                fields: {_id: 0, track: 1, added: 1, votes: 1}
              }).success(function (queue) {
                res.json({message : "Added track successfully"});

                req.io.to(req.qclient.key).emit('state_change', {
                  play: req.qclient.play,
                  volume: req.qclient.volume,
                  track: req.qclient.current,
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
// POST /client/:qclient/skip
router.post('/:qclient/skip', function(req, res) {
  // Find and remove the first item in the queue
  utils.skipTrack(req.db, req.io, req.qclient, function (result) {

    res.json(result);
  });
});

module.exports = router;
