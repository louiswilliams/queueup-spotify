function skipTrack(db, io, qclient, callback) {
  db.get('queue').findAndModify({
      query: {client: qclient._id},
      sort: {added: 1},
      remove: true
    }, function(err, item) {

    var new_track;

    // New track will be null if nothing was removed
    if (err) {
      callback({error: err, message: "Error finding item"});
    } else if (item) {
      new_track = item.track;
    } else {
      callback({message: "No more tracks in queue"})
      return;
    }

    // Update the current track
    db.get('clients').findAndModify({
      query: {
        _id: item.client
      },
      update: {
        $set: {
          current: new_track, 
          last_updated: new Date().getTime()
        }
    // Error updating client
      }
    }, function(err, client) {
      if (err) {
        callback({error: err, message: "Error updating item"});
      } else if (client) {
      // Successfully updated client
        console.log("Update success: ", client);

        /* Retreive the queue */
        db.get('queue').find({
          client: client._id
        }, {
          fields: {_id: 0, track: 1, added: 1, votes: 1}
        }).success(function (queue) {
          
          /* Broadcast the change */
          io.to(client.key).emit('state_change', {
            play: client.play,
            volume: client.volume,
            track: new_track,
            queue: queue,
            trigger: "next_track"
          });
          callback({message: "Skipped to next track succesfully"});

        }).error(function (err) {
          callback({error: err});
        });

        // Send success message
      } else {
        callback({message: "No client updated"});
      }
    });
  });
}

exports.skipTrack = skipTrack;
