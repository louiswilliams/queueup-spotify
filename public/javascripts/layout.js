$(document).ready(function() {
    $alert = $("<div id='app_alert'>").addClass("alert").addClass("alert-warning").addClass("alert-dismissable");

    $alert_close = $("<a class='close' href='#' data-dismiss='alert' aria-label='close'>X</a>");

    var message = "Download our app on iOS or Android " + 
        " to host a playlist using your Spotify account! ";

    $alert.html(message);
    $alert.append($alert_close);

 
    $(".get_app_question").click(function (e) {
        e.preventDefault();
        $('#alert').append($alert); 
        $alert.slideDown(200);
    })
});