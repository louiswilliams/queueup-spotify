
$(document).ready(function() {
  var $volume = $("#volume");
  var $background = $("#background");
  var $play_pause = $("#statusChange");
  var $queue = $("#queue");
  var $current = $("#current");
  var $current_name = $("#current_name");
  var $current_artist = $("#current_artist");
  var volInhibitKnobListiner = false;
  var volInhibitServerListener = false;

  /* Play/pause button pressed */
  $play_pause.click(function(e) {
    var id = $play_pause.data("id");
    var play_state = ($play_pause.data("play") == true);
    var next_state = !play_state;
    e.preventDefault();
    $.post(window.location.href + "/play", {play: next_state}, function(data) {
      console.log(data);
      updatePlaying(data.play);
    });
  });
  
  /* Track skip button pressed */
  $("#next").click(function(e) {
    var $link = $(this);
    var id = $link.data("id");
    e.preventDefault();
    $.post(window.location.href + "/skip", function(data) {
      console.log(data);
    });
  });

  /* Send volume update to server */
  var volAjax;
  function setVolume(val) {

    /* If a server messaged triggered the change, as set by
       volInhibitKnobListiner, do nothing */
    if (volInhibitKnobListiner) {
      console.log("Listener inhibited...");
      return;
    }
    console.log("Setting volume to ", val);

    if (volAjax) { 
      volAjax.abort();
    }

    volAjax = $.ajax(window.location.href + "/volume", {
      type: "POST",
      data: { volume: val}  
    }).done(function(data) {
      console.log("Set to ", data.volume);

    });      
  }

  function knobChange(val){
    console.log(val);
  }

  /* Create knob */
  $volume.knob({
    'release': setVolume,
    'width': 250,
    'height': 250,
    'angleArc': 270,
    'angleOffset': 225,
    'min': 0,
    'max': 100,
    'bgColor': "rgba(0,0,0,0.6)",
    'fgColor': "#fff",
  });

  /* Search box keyup */
  var searchAjax;
  var search_offset = 0;
  var search_query = "";

  function searchTracks(query) {
    $results = $("#searchresults");
    if (query.length > 0) {


      /* This cancels any slow and unfinished operations */
      if (searchAjax) { searchAjax.abort(); }

      searchAjax = $.ajax("/spotify/search/" + query + "/" + search_offset);
      searchAjax.done(function(data) {
        if (data.error) {
          console.log(data);
          return;
        }
        var resultsHtml = "";
        console.log(data);
        resultsHtml += "<a class='search_prev fa fa-angle-double-up' href='#'></a>"
        $.each(data, function(i, track) {
          resultsHtml += "<a class='track' data-id='" + i + "' "
            + "href='" + document.URL + "/add/" + track.id + "'>"
            + "<div class='albumart'><img src='" + track.album.images[2].url + "'/></div>"
            + "<div class='trackname'>" + track.name + "</div>"
            + "<div class='artistname'>" + track.artist + "</div>"
            + "</a>"
        });
        resultsHtml += "<a class='search_next fa fa-angle-double-down' href='#'></a>"
        $results.html(resultsHtml);
        $results.slideDown(100);
      });
      searchAjax.fail(function(data) {
        console.log("Fail: ", data);
      });
    } else {
      clearSearch();
    }
  }

  $("#searchresults").on("click", ".search_prev", function(e) {
    e.preventDefault();
    if (search_offset >= 5) {
      search_offset -= 5;    
    }
    searchTracks(search_query);
  });

  $("#searchresults").on("click", ".search_next", function(e) {
    e.preventDefault();
    if (search_offset <= 15) {
      search_offset += 5;      
    }
    searchTracks(search_query);
  });

  $("#searchbox > input").keyup(function(e) {
    search_query = this.value;
    search_offset = 0;
    searchTracks(search_query);
  });

  $("#search_clear").on("click", function(e) {
    e.preventDefault();
    clearSearch();
  });

  $("#searchresults").on("click", ".track", function(e) {
    console.log(this.href);
    e.preventDefault();
    $.post(this.href).done(function(data) {
      clearSearch();
      console.log(data);
   });
  });

  function clearSearch(callback) {
    $("#searchresults").slideUp(100, function() {
      $(this).html("");
      $("#searchbox > input").val("");
      if (callback) {
        callback();      
      }
    });
  }

  var widthLarge = true;
  checkWidth(window.innerWidth);

  function checkWidth(width) {
    if (width < 420 && widthLarge ) {
      $volume.trigger('configure', {width: 175, height: 175});
      widthLarge = false;
    }
    if (width >= 420 && !widthLarge) {
      $volume.trigger('configure', {width: 250, height: 250});
      widthLarge = true;
    }
  }

  window.onresize = function (event) {
    checkWidth(window.innerWidth);
  }

  var serverUrl = window.location.protocol + "//" + window.location.hostname;
  var clientId = window.location.pathname.split('/').pop();
  console.log("Client ID: " + clientId);
  
  var socket = io.connect(serverUrl, {
    "force new connection": true
  });
  /*
    Handle socket authentication with the server.
  */
  socket.on('auth_request', function(data){
    console.log("Received auth request...");

    /* Send auth key */
    socket.emit('auth_send', {key: clientId  });
  });

  /* Auth successful */
  socket.on('auth_success', function() {
    console.log("Authentication success");
    /* Listen for updates from the server */
    var auth_success = true;
  });

  /* Unsuccessful auth */
  socket.on('auth_fail', function(err) {
    console.log("Authentication failure: ", err);
  })

  /* Handle the server disconnecting */
  socket.on('disconnect', function() {
    console.log("Server disconnected...");
  });

  /* Handles a new play state sent to the client */
  socket.on('state_change', function (state) {
      console.log("Received new state from server: ", state);  
      if (typeof state.play != 'undefined') {
        updateVolume(state.volume);    
      }
      if (state.volume) {
        updatePlaying(state.play);
      }
      if (state.track) {
        updateCurrent(state.track);
      }
      if (state.queue) {
        updateQueue(state.queue);
      }
  });

  function updateVolume(volume) {
    volInhibitKnobListiner = true;
    $volume.val(volume).trigger('change');
    volInhibitKnobListiner = false;
  }

  function updatePlaying(playing) {
    $play_pause.removeClass("fa-" + ((playing) ? "play" : "pause"));
    $play_pause.addClass("fa-" + ((playing) ? "pause" : "play"));
    $play_pause.data("play", playing);
  }

  function updateCurrent(track) {

    $current.css('background-image', 'url(' + track.album.images[0].url + ')');
    $background.css('background-image', 'url(' + track.album.images[0].url + ')');
    $current_name.html(track.name);
    $current_artist.html(track.artists[0].name);
  }

  function updateQueue(queue) {
    var resultsHtml = "";
    $.each(queue, function(i, entry) {
      resultsHtml += "<li class='track'>"
        + "<div class='albumart'><img src='" + entry.track.album.images[2].url + "'/></div>"
        + "<div class='trackname'>" + entry.track.name + "</div>"
        + "<div class='artistname'>" + entry.track.artists[0].name + "</div>"
      + "</li>";
    });
    $queue.html(resultsHtml);
  }

});

