var SpotifyWebApi = require('spotify-web-api-node');
var fs = require('fs');
var monk = require('monk');
var db = monk('localhost:27017/queueup');
var ObjectID = require('mongodb').ObjectID;

var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/spotify.key', {encoding: 'utf8'}));

exports.normalizeName = function (name) {
  return name.replace(/[^\w]/gi,'').toLowerCase();
}

exports.getSpotifyApiForUser = function (user, callback) {
  if (user) {
    var spotifyApi = new SpotifyWebApi(spotifyConfig);

    spotifyApi.setAccessToken(user.spotify.accessToken);
    spotifyApi.setRefreshToken(user.spotify.refreshToken);

    // If accessToken has expired
    if (user.spotify.tokenExpiration < new Date().getTime()) {
      spotifyApi.refreshAccessToken().then(function (data) {
        user.spotify.accessToken = data.access_token;
        user.spotify.tokenExpiration = (data.expires_in * 1000) + new Date().getTime();

        spotifyApi.setAccessToken(data.access_token);
        callback(null, spotifyApi, user);
      }, function (err) {
        callback(err);
      });      
    } else {
      callback(null, spotifyApi);
    }


  } else {
    callback(new Error("Invalid user"));
  }
}

exports.getUserPlaylistTracks = function (user, playlist, callback) {
  if (user && playlist) {
    getSpotifyApiForUser(user, playlist);
  } else {
    callback(new Error("User or playlist is undefined"));
  }
}

exports.skipTrack = function (playlist, callback) {
  
  /* If there's anything in the queue */
  if (playlist.tracks && playlist.tracks.length > 0) {

    /* Store the first track */
    var first = playlist.tracks[0];
    console.log("Removing: ", first.track.id);

    /* Remove the first track from the DB, set the current as the stored track */
    db.get('playlists').findAndModify({
      _id: playlist._id
    }, {
      $set: {current: first.track},
      $pop: {tracks: -1}
    }, {
      "new": true
    }).success(function (playlist) {

      callback(playlist);

    }).error(function (err) {
      callback(null, {error: err});
    });

  } else {
    db.get('playlists').findAndModify({
      _id: playlist._id
    }, {
      $set: {current: null}
    }, {
      "new": true
    }).success(function (playlist) {

      callback(playlist);

    }).error(function (err) {
      callback(null, err);
    });

  }

}

exports.userIsPlaylistAdmin = function (user, playlist) {
  if (!user || !playlist) {
    return false;
  }
  return (user._id.equals(playlist.admin));
}

exports.updateUser = function (user, update, callback) {
  db.get('user').update({
    _id: user._id
  }, { $set: update }).error(function (err) {
    if (callback) {
      callback(err);    
    }
  }).success(function(record) {
    if (callback) {
      callback(record);
    }
  });
}

exports.addTrackToPlaylist = function (req, trackId, playlist, callback) {
  /* First get the track information from Spotify */

  req.spotify.getTrack(trackId).then(function(track) {

    /* This keeps on the fields we want */
    track = exports.objCopy(track, {"name": true,"duration_ms": true, "id": true, "uri": true, "artists": true, "album.id": true, "album.images": true, "album.name": true, "album.uri": true});

    /* track should be defined if Spotify found a valid track */
    if (track) {

      /* If there isn't a current track, don't put this in the queue */
      if (!playlist.current) {

        /* Set the current track to the one just added */
        req.db.get('playlists').findAndModify(
          {_id: playlist._id},
          {
            $set: { current: track }
          }, { "new": true }
        ).success(function(playlist) {

          /* playlist found in DB */
          exports.emitStateChange(req.io, playlist, "add_track");

          callback(null, playlist);

        }).error(function (err) {
          req.json({error: err});
        });

      /* Add the track to the end of the queue */
      } else {


        /* Append the track */
        req.db.get('playlists').findAndModify(
          {_id: playlist._id},
          {
            $push: {
              tracks: {
                _id: new ObjectID(),
                track: track
              }
            }
          }, {"new": true}
        ).success(function (playlist) {
        
          /* Added successfully */
          console.log("Added track: ", track.id);

          exports.emitStateChange(req.io, playlist, "add_track_queue");
          
          callback(null, playlist);
        }).error(function (err) {
          console.log(err);
        });
      }
    } else {
      /* If the response from Spotify was undefined */
      callback({
        error: "Track not found",
        message: "TrackID: " + req.params.trackid
      });
    }
    
  });
}

exports.emitStateChange = function (io, playlist, trigger) {
  io.to(playlist._id).emit('state_change', {
    play: playlist.play,
    track: playlist.current,
    queue: playlist.tracks,
    trigger: trigger
  });
}

exports.sendStateChange = function (socket, playlist, trigger) {
  socket.emit('state_change', {
    play: playlist.play,
    track: playlist.current,
    queue: playlist.tracks,
    trigger: trigger
  });
}

exports.trackSimplify = function (track) {
  return {
  }
}

/** 
  This returns a copy of the object, but with the set of 'keep' fields retained.
  Inner objects can be retained using "." between fields.
*/
exports.objCopy = function (object, keep) {
  function copyObjField(object, fields, input) {
    var o = (input) ? input : undefined;

    if (fields.length >= 1) {
      if (!o) { o = {} };
      var top = fields.splice(0,1)[0];
      var value = object[top];
      if (value) {
        o[top] = (fields.length == 0) ? value : copyObjField(value, fields, o[top]);
      }
    }
    return o;
  }

  var result = {};
  if (keep) {
    for (key in keep) {
      copyObjField(object, key.split('.'), result)
    }
  }
  return result;
}