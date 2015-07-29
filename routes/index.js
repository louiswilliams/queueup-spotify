var express = require('express');
var constant = require('../constant');
var util = require('../utils');
var router = express.Router();

router.post('/betaApply', function (req, res) {
  var email = req.body.email;
  var platform = req.body.platform;

  if (email && platform) {
    var betaList = req.db.get('betalist');
    betaList.insert({email: email, platform: platform});
    res.send('Thanks! You will receive an email with directions if you are accepted!');
  } else {
    res.status(400).send("No email given");
  }
});

router.get(constant.ROUTE_HOME, function (req, res) {

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
      title: "Live Right Now",
      playlists: docs,
      user: user,
      home: true,
      albumArt: art
    });
  });
});

router.get(constant.ROUTE_USER, function (req, res) {
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
    res.redirect(constant.ROUTE_AUTH_FB);
  }
});

router.get(constant.ROUTE_IMPORT, function (req, res) {
  if (req.user) {

    util.getUserPlaylists(req.user, function(err, playlists) {
      if (err) {
        console.log(err);
        res.redirect(constant.ROUTE_HOME);
      } else {
        console.log(playlists);
        res.render('import', {
          user: req.user,
          playlists: playlists
        });
      }
    });


  } else {
    res.redirect(constant.ROUTE_HOME);
  }
});

router.get(constant.ROUTE_LOGOUT, function (req, res) {
  if (req.user) {
    req.logout();
    res.redirect(constant.ROUTE_HOME);
  }
});

router.post(constant.ROUTE_NEW_PLAYLIST, function (req, res) {
  var playlists = req.db.get('playlists');
  var name = req.body.playlist_name;

  if (!req.user || !name) {
    res.redirect(constant.ROUTE_HOME);
  } else {
    var key = name.replace(/[^\w]/gi,'').toLowerCase();


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
      res.redirect([constant.ROUTE_PLAYLIST, playlist._id, key].join('/'));
    }).error(function (err) {
      res.json({error: err});
    });

  }

});

module.exports = router;
