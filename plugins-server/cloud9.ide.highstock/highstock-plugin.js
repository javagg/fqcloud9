var path = require("path")

module.exports = function setup(options, imports, register) {
    imports.static.addStatics([
        {
            path: __dirname,
            mount: "/static",
            rjs: {
                "highstock": "/static/highstock",
                "jquery": "/static/jquery-1.8.3.min"
            }
        }
    ]);

    register(null, {
        "highstock": {}
    });
};