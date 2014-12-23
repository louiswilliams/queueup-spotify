var express = require('express');
var router = express.Router();

var SpotifyWebApi = require('spotify-web-api-node');

var spotify = new SpotifyWebApi({
  clientId: '00fcc73d47814711b7879b41692a2f5d',
  clientSecret: '19f581c6732544af973eb6d08d45ba2d',
  redirectUri: 'http:\/\/node.louiswilliams/org/callback'
});

router.get('/search/:query', function(req, res) {
  spotify.searchTracks(req.params.query, {limit: 5}).then(function(data) {
    var response = {};
    var tracks = data.tracks.items;
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
    res.status(404).end(err);
    console.log("Query error: ",err);
  });
});

module.exports = router;
