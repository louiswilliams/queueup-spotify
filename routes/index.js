var express = require('express');
var util = require('../utils');
var router = express.Router();

router.get('/', function (req, res) {

  var playlists = req.db.get('playlists');
  playlists.find({}, {
    sort: {"last_updated": -1}
  }, function (e, docs) {
    var art;
    if (docs.length > 0 && docs[0].current) {
      art = docs[0].current.album.images[0].url;
    }
    var user;
    if (req.user) {
      user = req.user;
    }
    res.render('index', {
      title: "Home",
      playlists: docs,
      user: user,
      home: true,
      albumArt: art
    });
  });
});

router.get('/user', function (req, res) {
  console.log(req.user);
  if (req.user) {
    var playlists = req.db.get('playlists');
    playlists.find({admin: req.user._id}, {}).success(function (docs) {
      res.render('user', {
        playlists: docs,
        user: req.user
      });
    }).error(function (err) {
      console.log(err);
      res.end(err);
    });
  } else {
    res.redirect('/auth/spotify')
  }
});

router.get('/user/import', function (req, res) {
  if (req.user) {

    util.getUserPlaylists(req.user, function(err, playlists) {
      if (err) {
        console.log(err);
        res.redirect('/');
      } else {
        console.log(playlists);
        res.render('import', {
          user: req.user,
          playlists: playlists
        });
      }
    });


  } else {
    res.redirect('/');
  }
});

router.get('/logout', function (req, res) {
  if (req.user) {
    req.logout();
    res.redirect('/');
  }
});

router.post('/new', function (req, res) {
  var playlists = req.db.get('playlists');
  var name = req.body.playlist_name;

  if (!req.user || !name) {
    res.redirect('/');
  } else {
    var key = name.replace(/[^\w]/gi,'').toLowerCase();

    var displayName = (req.user.facebook)
    playlists.insert({
      admin: req.user._id,
      admin_name: req.user.name,
      key: key,
      name: name,
      playing: false,
      volume: 50,
      date_created: new Date().getTime(),
      last_updated: new Date().getTime()
    }).success(function (playlist) {
      res.redirect('/playlist/' + playlist._id + "/" + key);
    }).error(function (err) {
      res.json({error: err});
    });

  }

});

module.exports = router;
