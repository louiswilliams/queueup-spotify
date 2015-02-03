var express = require('express');
var util = require('../utils');
var router = express.Router();

router.get('/', function (req, res) {

  var playlists = req.db.get('playlists');
  playlists.find({}, {}, function (e, docs) {
    var user;
    if (req.user) {
      user = req.user;
    }
    res.render('index', {
      title: "Home",
      playlists: docs,
      user: user
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
    console.log(req.user);

    util.getUserPlaylists(req.user, function(err, playlists) {
        if (err) {
            console.log(err);
        } else {
            console.log(playlists);
            res.render('import', {
                user: req.user,
                playlists: playlists.items
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
    res.end();
  } else {
    var key = name.replace(/[^\w]/gi,'').toLowerCase();

    playlists.count({key: key}).success(function (count) {
        if (count == 0) {
            playlists.insert({
              admin: req.user._id,
              key: key,
              name: name,
              playing: false,
              volume: 50
            }).success(function (playlist) {
              res.redirect('/playlist/' + key);
            }).error(function (err) {
              res.json({error: err});
            });             
        } else {
          console.log("Duplicate key name");
          res.json({error: "Duplicate key names. Choose a different name"});
        }
   
        console.log(count);
    }).error(function (error) {
        res.end();
        console.log(error);
    });

  }

});

module.exports = router;
