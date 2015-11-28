var express = require('express');
var fs = require('fs');
var router = express.Router();

var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/../spotify.key', {encoding: 'utf8'}));


router.get('/search/:query/:offset?', function(req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;

  /* Query spotify with an optional offset for pages of results */
  req.spotify.searchTracks(req.params.query, {limit: 5, offset: offset}).then(function(data) {
    var response = {};
    var tracks = data.body.tracks.items;
    console.log("Tracks found for search \"" + req.params.query + "\": " +  tracks.length);

    /* Construct a smaller response object  */
    for (var i in tracks) {
      var track = {
        name: tracks[i].name,
        id: tracks[i].id,
        artist: tracks[i].artists[0].name,
        duration_ms: tracks[i].duration_ms,
        album: {
          id: tracks[i].album.id,
          name: tracks[i].album.name,
          images: tracks[i].album.images
        }
      };
      response[i] = track;
    }
    res.json(response);
  }, function(err) {
    console.log("Query error: ",err);
    res.json({error: err});
  });
});

router.get('/search/:user/playlists/:offset?', function(req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;
  var user = req.params.user;
  var accessToken = req.body.access_token;

  var spotify = new SpotifyWebApi(spotifyConfig);

  spotify.setAccessToken(accessToken);

  /* Query spotify with an optional offset for pages of results */
  spotify.getUserPlaylists(user, {limit: 5, offset: offset}).then(function(data) {
    var response = {};
    var playlists = data.body.items;
    console.log("Playlists found for user \"" + user + "\": " +  playlists.length);

    res.json({playlists: playlists});
  }, function(err) {
    console.log("Query error: ",err);
    res.json({error: err});
  });
});

module.exports = router;
