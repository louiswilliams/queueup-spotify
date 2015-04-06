var express = require('express');
var passport = require('passport');
var fs = require('fs');
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var SpotifyStrategy = require('passport-spotify').Strategy;

var monk = require('monk');
var db = monk('localhost:27017/queueup');

var router = express.Router();

var facebookSecret = fs.readFileSync(__dirname + "/facebookSecret.key", {encoding: 'utf8'}).trim();
// var googleSecret = fs.readFileSync(__dirname + "/googleSecret.key", {encoding: 'utf8'}).trim();
var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/../spotify.key', {encoding: 'utf8'}));


passport.serializeUser(function(user, done) {
    // console.log("Serialize: ", user);
    done(null, user._id);
});

passport.deserializeUser(function(id, done) {
    // console.log("Deserialize: ", id);
    var users = db.get('users');
    users.findOne({_id: id}, function(err, user) {
        done(err, user);
    })
});

passport.use(new SpotifyStrategy({
    clientID: spotifyConfig.clientId,
    clientSecret: spotifyConfig.clientSecret,
    callbackURL: spotifyConfig.redirectUri
  }, function(accessToken, refreshToken, params, profile, done) {
    var users = db.get('users');

    var expirationDate = (params.expires_in * 1000) + new Date().getTime();
    users.findAndModify(
        { "spotify.id" : profile.id},
        { $set: {
            displayName: ((profile.displayName) ? profile.displayName : profile.id),
            spotify: {
              id: profile.id,
              displayName: ((profile.displayName) ? profile.displayName : profile.id),
              username: profile.username,
              profileUrl: profile.profileUrl,
              accessToken: accessToken,
              refreshToken: refreshToken,
              tokenExpiration: expirationDate
            }
          }
        },
        { "new": true, "upsert": true}
    ).success(function (user) {
      console.log(user);
      if (user) {
        done(null, user);
      } else {
        done(null, false, {message: "Incorrect login"});
      }
    }).error(function (err) {
      done(err)
    });

  }
));

/* Facebook */

passport.use(new FacebookStrategy({
    clientID: 737070926399780,
    clientSecret: facebookSecret,
    callbackURL: "http://queueup.louiswilliams.org/auth/facebook/callback"
  }, function(accessToken, refreshToken, profile, done) {

    var users = db.get('users');

    console.log(profile);

    users.findAndModify(
        { "facebook.id" : profile.id},
        { $set: {
            displayName: profile.displayName,
            facebook: {
              id: profile.id,
              name: profile.name,
              gender: profile.gender,
              profileUrl: profile.profileUrl,
              accessToken: accessToken,
              refreshToken: refreshToken
            }
          }
        },
        { "new": true, "upsert": true}
    ).success(function (user) {
      if (user) {
        done(null, user);
      } else {
        done(null, false, {message: "Incorrect login"});
      }
    }).error(function (err) {
      console.log("Error",err);
      done(err);
    });
  })
);

/* Router */

router.get('/facebook', passport.authenticate('facebook'));

router.get('/facebook/callback',  function (req, res, next) {
  passport.authenticate('facebook', function (err, user, info) {
    if (err) {return next(err); }
    if (!user) {
      return res.redirect('/');
    }
    req.logIn(user, function(err) {
      if (err) {return next(err);}
      var redirect = (req.session.redirect_after) ? req.session.redirect_after : '/';
      delete req.session.redirect_after;

      return res.redirect(redirect);
    });
  })(req, res, next);
}
);

router.get('/spotify', passport.authenticate('spotify'));

router.get('/spotify/callback', function (req, res, next) {
  passport.authenticate('spotify', function (err, user, info) {
    if (err) {return next(err); }
    if (!user) {
      return res.redirect('/');
    }
    req.logIn(user, function(err) {
      if (err) {return next(err);}
      var redirect = (req.session.redirect_after) ? req.session.redirect_after : '/';
      delete req.session.redirect_after;

      return res.redirect(redirect);
    });
  })(req, res, next);

});



/*passport.use(new GoogleStrategy({
    clientID: "1071064266819-5utbr9mgchr48aqbo5151c9r32up2ehs.apps.googleusercontent.com",
    clientSecret: googleSecret,
    callbackURL: "http://queueup.louiswilliams.org/auth/google/callback"
  }, function (token, tokenSecret, profile, done) {
  console.log(profile);
}));

router.get('/google', passport.authenticate('google', {
  scope: "profile"
}));


router.get('/google/callback',
  passport.authenticate('google', {
    successRedirect: '/',
    failureRedirect: '/failure'
  })
);*/

module.exports = router;
