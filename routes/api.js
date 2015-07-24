var express = require('express');
var router = express.Router();

/* Mount versioned APIs */
var apiv2 = require('./api/v2.js');
var spotify = require('./api/spotify');

router.use('/v2/spotify', spotify);
router.use('/v2', apiv2);


module.exports = router;
