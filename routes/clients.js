var express = require('express');
var router = express.Router();

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

router.get('/:qclient', function(req, res) {
  if (current) {
    req.db.get('queue').find(
      {client: req.qclient._id},
      {fields: {_id: 0, track: 1, added: 1, votes: 1}},
    function(err, queue) {
      if (err) { return next(new Error("Error finding queue")); }
      req.spotify.getTrack(req.qclient.current.split(":")[2]).then(function(data) {
        res.render('client', {
          client: req.qclient,
          current: data.name + " by " + data.artists[0].name,
          queue: queue
        });
      });
    }, function(err) {
      console.log(err);
    });
  }
});

router.post('/:qclient/status', function(req, res) {
  var status = req.body.status;
  status = (status == "play") ? "pause" : "play"; // Toggle play/pause
  req.db.get('clients').update(
    { _id: req.qclient._id },
    { $set: {
       status: status,
       last_updated: new Date().getTime()
      }
    }, function() {
       console.log("Updated to " + status);
       res.json({status: status});
  });
});

router.get('/:qclient/stream', function(req, res) {
  req.db.get('queue').find(
    {client: req.qclient._id}, 
    {fields: {_id: 0, track: 1, added: 1, votes: 1}},
  function(err, queue) {
    if (err) { return next(new Error("Error finding queue")); }
    response = {
      status: req.qclient.status,
      current: req.qclient.current,
      last_updated: req.qclient.last_updated,
      queue: queue
    };
    res.json(response);

  });
});

router.post('/:qclient/add/:trackid', function(req, res) {
  if (req.params.trackid) {
    req.db.get('queue').insert(
      {
        client: req.qclient._id,
        track: "spotify:track:" + req.params.trackid,
        added: new Date().getTime()
      }, function() {
        req.db.get('clients').update({ _id: req.qclient._id,},
          {$set: {last_updated: new Date().getTime() }}, function() {

          console.log("Added track ", req.params.trackid);
          res.redirect('/client/' + req.qclient.key);
//        req.spotify.getTrack(req.params.trackid).then(function(data) {
//         res.json({current: data.name + " by " + data.artists[0].name});
//        });
        });
      }
    );
  } else {
    res.status(404).end();
  }
});

// Called when a track is ended and the top of the playlist is added to current
router.post('/:qclient/ended', function(req, res) {
  req.db.get('queue').findOne({client: req.qclient._id}, {single: true}, function(err, item) {
    if (err) {
      res.json({error: ["Error finding item",err]});
    } else if (item) {
      req.db.get('clients').update({
        _id: item.client
      }, {
        $set: {
          current: item.track, 
          last_updated: new Date().getTime()
        }
      }, function(err) {
        if (err) {
          res.json({error: ["Error updating item", err]});
        } else {
          req.db.get('queue').remove({_id: item._id}, function(err, count) {
            if (err) {
              res.json({error: ["Remove queueitem error",err]});
            } else if (count > 0){
              res.json({removed: count});
            } else {
              res.json({error: "No item removed"});
            }
          });
        }
      });
    } else {
      req.db.get('clients').update({
        _id: req.qclient._id
      },{
        $set: {
          current: null
        }
      }, function(err) {
        if (err) {
          res.json({error: ["Error making current null", err]});
        } else {
          res.json({error: "Queue empty"});
        }
      });
    }
  });
});

module.exports = router;

