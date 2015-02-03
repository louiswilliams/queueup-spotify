var express = require('express');
var passport = require('passport');
var fs = require('fs');
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var SpotifyStrategy = require('passport-spotify').Strategy;

var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/queueup');

var router = express.Router();

// var facebookSecret = fs.readFileSync(__dirname + "/facebookSecret.key", {encoding: 'utf8'}).trim();
// var googleSecret = fs.readFileSync(__dirname + "/googleSecret.key", {encoding: 'utf8'}).trim();
var spotifySecret = fs.readFileSync(__dirname + '/../spotify.key', {encoding: 'utf8'}).trim();


passport.serializeUser(function(user, done) {
    console.log("Serialize: ", user);
    done(null, user._id);
});

passport.deserializeUser(function(id, done) {
    console.log("Deserialize: ", id);
    var users = db.get('users');
    users.findOne({_id: id}, function(err, user) {
        done(err, user);    
    })
});

passport.use(new SpotifyStrategy({
    clientID: '00fcc73d47814711b7879b41692a2f5d',
    clientSecret: spotifySecret,
    callbackURL: 'http://queueup.louiswilliams.org/auth/spotify/callback'
  }, function(accessToken, refreshToken, profile, done) {

    var users = db.get('users');
    users.findAndModify(
        { "spotify.id" : profile.id},
        { spotify: {
            id: profile.id,
            displayName: ((profile.displayName) ? profile.displayName : profile.id),
            username: profile.username,
            profileUrl: profile.profileUrl,
            accessToken: accessToken,
            refreshToken: refreshToken
        }},
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

router.get('/spotify', passport.authenticate('spotify'));

router.get('/spotify/callback', passport.authenticate('spotify',
    {
        failureRedirect: '/',
        successRedirect: '/user'
    })
);

/*router.get('/spotify/callback', function(req, res) {
    if (req.query.code) {
        req.spotify.authorizationCodeGrant(req.query.code).then(function(data) {
            console.log(data);
            // req.spotify.setAccessToken(data.access_token);
            // req.spotify.setRefreshToken(data.refresh_token);
            var spotifyUser = {
                refreshToken: refresh_token,
                access_token: accessToken
            }
            res.redirect('/user');
        }, function(err) {
            console.log(err);
            res.redirect('/');
        });
    } else {
        res.end();
        res.redirect('/');
    }
});
*/
/*passport.use(new FacebookStrategy({
    clientID: 737070926399780,
    clientSecret: facebookSecret,
    callbackURL: "http://queueup.louiswilliams.org/auth/facebook/callback"
  }, function(accessToken, refreshToken, profile, done) {

    var users = db.get('users');

    users.findAndModify(
        {facebook_id:  profile.id},
        { facebook: {
            id: profile.id,
            displayName: profile.displayName,
            name: profile.name,
            gender: profile.gender,
            profileUrl: profile.profileUrl
        }},
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
  })
);

router.get('/facebook', passport.authenticate('facebook'));

router.get('/facebook/callback', 
  passport.authenticate('facebook', {
    successRedirect: '/clients',
    failureRedirect: '/failure'
  })
);
*/

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
