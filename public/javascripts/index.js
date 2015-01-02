var last;

function getStatus(callback) {
  $.ajax("/status").done(function(data) {
    callback(data);
  }).fail(function() {
    callback();
  });
}

function update() {
  getStatus(function(data) {
    console.log(data);

    // Check if the data is new
    if (!data) {
      return setTimeout(update, 1000);    
    } else if (data.updated || !last) {
      // Status set
      if (data.status) {
        if (data.status == "play") {
          $("#status").removeClass("glyphicon-pause");
          $("#status").addClass("glyphicon-play");
        } else {
          $("#status").removeClass("glyphicon-play");
          $("#status").addClass("glyphicon-pause");
        }
      }
      // Current track set
      if (data.current) {
        $("#track").html(data.current.name);
        if (data.current.artwork) {
          $("#albumart").attr("src","data:image/png;base64," + data.current.artwork);
          $("#background").css("background-image","url(data:image/png;base64," + data.current.artwork + ")");
        }
        if (data.current.artists.length > 0) {
          $("#artist").html(data.current.artists[0].name);
        }
      }
      // Queue data set
      if (data.queue && data.queue.length > 0) {
        var queueHtml = "";
        $.each(data.queue, function(i, track) {
          if (track) {
            queueHtml += "<div class='queueTrack info'>" + track.name + " by " + track.artist + "</div>";
          } else {
            queueHtml += "<div class='queueTrack info'>Loading...</div>";
          }
        });
        $("#queue").html(queueHtml);
      } else {
        $("#queue").html("");
      }
    }
    setTimeout(update, 1000);    
    last = data;
  });
}

$(document).ready(function() {
  update();
});

