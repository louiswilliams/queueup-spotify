$(document).ready(function() {
  $("#statusChange").click(function(e) {
    var $link = $(this);
    var id = $link.data("id");
    var status = $link.data("status");
    e.preventDefault();
    $.post("/client/" + id + "/status", {status: status}, function(data) {
      console.log(data);
      $link.html(data.status);
      $link.data("status", data.status);
    });
  });
  
  $("#next").click(function(e) {
    var $link = $(this);
    var id = $link.data("id");
    e.preventDefault();
    $.post("/client/" + id + "/ended", function(data) {
      console.log(data);
    });
  });

  var ajax;

  $("#searchbox").keyup(function(e) {
    var search = this;
    if (search.value.length > 0) {
      if (ajax) { ajax.abort(); } // This cancels any slow and unfinished operations

      ajax = $.ajax("/spotify/search/" + search.value);
      ajax.done(function(data) {
        var resultsHtml = "";
        console.log(data);
        $.each(data, function(i, track) {
          resultsHtml += "<a class='searchresult' data-id='" + i + "' "
            + "href='" + document.URL + "/add/" + track.id + "'>"
            + "<div class='albumart'><img src='" + track.album.images[2].url + "'/></div>"
            + "<div class='trackname'>" + track.name + "</div>"
            + "<div class='artistname'>" + track.artist + "</div>"
            + "</a>";
        });

        $("#searchresults").html(resultsHtml);
      });
      ajax.fail(function(data) {
        console.log("Fail: ", data);
      });
    }
  });


  $("#searchresults").on("click", ".searchresult", function(e) {
    console.log(this.href);
    e.preventDefault();
    $.post(this.href).done(function(data) {
      $("#current").html(data.current);
   });
  });


});

