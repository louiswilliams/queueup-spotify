var express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
  var clients = req.db.get('clients');
  clients.find({},{}, function(e, docs) {
    res.render('index', {title: "Home", qclients: docs});
  });
});

module.exports = router;
