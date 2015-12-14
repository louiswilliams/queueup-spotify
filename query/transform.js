/* Query layer for playlists */
var async = require('async');
var monk = require('monk');
var db = monk('localhost:27017/queueup');

/* State can be an object with other models and data */

exports.playlists = function (req, playlists, callback) {
  
  playlists.sort(function (a, b) {
    return b.last_updated > b.last_updated;
  });
  callback(playlists)
}

exports.playlist = function (req, playlist, callback) {

  var Users = req.Users;
  if (!playlist) {
    return callback(playlist);
  }

  /* Specify whether or not the current user is a voter */  
  var tracks = (playlist.tracks) ? playlist.tracks : [];

  if (tracks.length > 0) {

    /* Put them in the right order */
    tracks.sort(function (a, b) {
      if (a.votes == undefined) {
        if (b.votes > 0) return 1;
      } else if (b.votes == undefined) {
        if (a.votes > 0) return -1;
      }
      if (a.votes > b.votes) return -1;
      if (b.votes > a.votes) return 1;
      return compareDates(a,b);
    });
  }

  var finalTracks = [];

  async.eachSeries(tracks, function (track, c) {
    if (!track.played) {
      if (track.addedBy != null) {
        Users.findOne({
          _id: track.addedBy._id
        }).success(function (user) {
          track.addedBy.name = user.name;
          finalTracks.push(track);
          c();
        }).error(function (err) {
          c(err);
        });
      } else {
        finalTracks.push(track);
        c();
      }
    } else {
      c();
    }
  }, function (err) {
    if (err) {
      sendBadRequest(res, err);
    } else {
      playlist.tracks = finalTracks;
      callback(playlist);
    }
  });
  

}

function compareDates(a, b) {
  if (!a.dateAdded && !b.dateAdded) return 0;
  if (!b.dateAdded) return 1;
  if (!a.dateAdded) return -1;
  return (a.dateAdded - b.dateAdded);
}
