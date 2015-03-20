var express = require('express');
var async = require('async');
var utils = require('../utils');
var router = express.Router();
var ObjectID = require('mongodb').ObjectID;

// playlist param
router.param('playlist', function(req, res, next, id) {
  var playlists = req.db.get('playlists');

  playlists.findOne({_id: id},{}, function(err, playlist) {
    if (err){
      res.json({error: "Find playlist Error: " + err});
    }
    if (playlist) {
      req.playlist = playlist;
      return next();
    } else {
      res.json({error: "Cound't find playlist " + id});
    }

  }); 
});

router.get('/playlists', function (req, res) {
  var playlists = req.db.get('playlists');

  playlists.find({},{sort: {"last_updated": -1}}).success(function (documents) {
    res.json({playlists: documents});
  }).error(function (err) {
    res.json({error: err});
  });

});

router.get('/playlists/:playlist', function (req, res) {
  res.json({playlist: req.playlist});

});

module.exports = router;
