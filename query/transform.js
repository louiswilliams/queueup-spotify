/* Query layer for playlists */

/* State can be an object with other models and data */

exports.playlist = function (playlist, callback) {

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
  
  playlist.tracks = tracks;
  callback(playlist);
}

function compareDates(a, b) {
  if (!a.dateAdded && !b.dateAdded) return 0;
  if (!b.dateAdded) return 1;
  if (!a.dateAdded) return -1;
  return (a.dateAdded - b.dateAdded);
}
