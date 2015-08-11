$(document).ready(function() {
    $alert = $("<div id='app_alert'>").addClass("alert").addClass("alert-warning").addClass("alert-dismissable");

    $alert_close = $("<a class='close' href='#' data-dismiss='alert' aria-label='close'>X</a>");

    var message = "Unfortunately, Spotify doesn't allow streaming " +
        "in web apps. Download our app on iOS or Android " + 
        "to host a playlist! ";

    $alert.html(message);
    $alert.append($alert_close);

 
    $(".get_app_question").click(function (e) {
        e.preventDefault();
        $('#playlist_listing').before($alert); 
        $alert.slideDown(200);
    })
});