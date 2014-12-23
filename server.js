var app = require('./app.js');

var server = app.listen(3002, function() {
  console.log("Server started on port %d", server.address().port);
});
