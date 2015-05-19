var https = require('https');

var HOST = "graph.facebook.com";

function Graph (accessToken, version) {
    this.accessToken = accessToken;
    this.version = (version) ? version : "2.3";

    this.get = function (uri, callback) {
        https.get(this.url(uri), function (res) {
            var data = "";
            res.on('data', function (chunk) {
                data += chunk.toString();
            });

            res.on('end', function() {
                callback(JSON.parse(data));
            })
        })
    }

    // this.getAll = function (uri, callbackDone, callbackEach) {
    //     this.get(uri, function (res) {

    //         callbackEach(res)
    //     })

    // }

    this.url = function (uri) {
        return "https://" + HOST + '/v' + this.version + '/' + uri + "?access_token=" + this.accessToken;
    }
}

module.exports = Graph;
