var express = require('express');
var router = express.Router();

/* Mount versioned APIs */
var apiv1 = require('./api/v1.js');
var apiv2 = require('./api/v2.js');

router.use('/v1', apiv1);
router.use('/v2', apiv2);

module.exports = router;
