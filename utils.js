var SpotifyWebApi = require('spotify-web-api-node');
var fs = require('fs');
var spotifyConfig = JSON.parse(fs.readFileSync(__dirname + '/spotify.key', {encoding: 'utf8'}));

function normalizeName(name) {
  return name.replace(/[^\w]/gi,'').toLowerCase();
}

function getSpotifyWebApi(user, callback) {
  if (user) {

    var spotifyApi = new SpotifyWebApi(spotifyConfig);

    spotifyApi.setAccessToken(user.spotify.accessToken);
    spotifyApi.setRefreshToken(user.spotify.refreshToken);

    spotifyApi.refreshAccessToken().then(function (data) {
      spotifyApi.setAccessToken(data.access_token);
      user.spotify.accessToken = data.access_token;
      callback(null, spotifyApi);
    }, function (err) {
      callback(err);
    });

  } else {
    callback(new Error("Invalid user"));
  }
}

function getUserPlaylists (user, callback) {
  if (user) {
    getSpotifyWebApi(user, function (err, spotify) {
      if (err) {
        callback(err);
      } else {
        spotify.getUserPlaylists(user.spotify.id, {limit: 50}).then(function(data) {
          callback(null, data.items);
        }, function(err) {
          callback(err);
        });        
      }

    });     
  } else {
    callback(new Error("Invalid user"));    
  }

}

function skipTrack(db, io, playlist, callback) {
  
  // Find the first and remove it
  db.get('queue').findAndModify(
      { playlist: playlist._id }, {},
      {
        sort: { last_updated: 1 },
        remove: true
      }, function(err, item) {

    var new_track;

    /* New track will be null if nothing was removed */
    if (err) {
      callback({error: err, message: "Error finding item"});
    } else if (!item) {
      /* No tracks in queue */
      db.get('playlists').update(
        {
          _id: playlist._id
        },
        {
          $set: {
            current: null, 
            last_updated: new Date().getTime()
          }
        },{
          new: true
        }, function(err, playlist) {

          io.to(playlist.key).emit('state_change', {
              play: playlist.play,
              volume: playlist.volume,
              track: playlist.current,
              queue: [],
              trigger: "last_track"
          });

          callback({message: "No more tracks in queue"})
      });
    } else {
      new_track = item.track;

      console.log("Playlist: ", item);

      // Update the current track
      db.get('playlists').findAndModify(
      {
        _id: item.playlist
      },
      { $set: {
          current: new_track, 
          last_updated: new Date().getTime()
      }}, {
        new: true
      }, function(err, playlist) {
        
        // Error updating playlist
        if (err) {
          callback({error: err, message: "Error updating item"});
        } else if (playlist) {
          // Successfully updated playlist
          console.log("Update success: ", playlist);

          /* Retreive the queue */
          db.get('queue').find({
            playlist: playlist._id
          }, {
            fields: {_id: 0, track: 1, added: 1, votes: 1}
          }).success(function (queue) {
            
            /* Broadcast the change */
            io.to(playlist.key).emit('state_change', {
              play: playlist.play,
              volume: playlist.volume,
              track: playlist.current,
              queue: queue,
              trigger: "next_track"
            });
            callback({message: "Skipped to next track succesfully"});

          }).error(function (err) {
            callback({error: err});
          });

          // Send success message
        } else {
          callback({message: "No playlist updated"});
        }
      });
    }

  });
}

exports.skipTrack = skipTrack;
exports.normalizeName = normalizeName;
exports.getUserPlaylists = getUserPlaylists;
exports.getSpotifyWebApi = getSpotifyWebApi;