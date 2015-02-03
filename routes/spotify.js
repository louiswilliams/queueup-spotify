var express = require('express');
var router = express.Router();

router.get('/search/:query/:offset?', function(req, res) {
  var offset = (req.params.offset) ? req.params.offset : 0;
  req.spotify.searchTracks(req.params.query, {limit: 5, offset: offset}).then(function(data) {
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
    console.log("Query error: ",err);
    res.json({error: err});
  });
});

module.exports = router;
