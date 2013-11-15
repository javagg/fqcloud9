"use strict";
var path = require('path')
var fs = require('fs')

module.exports = function setup(options, imports, register) {
    imports.static.addStatics([{
        path: path.dirname(require.resolve("cloud9/plugins-client/ext.main/main.js")),
        mount: "/static",
        rjs: {
            'ext/main/main': "/main",
            'ext/main/style': "/style"
        }
    }]);

    imports.static.addStatics([{
        path: path.dirname(require.resolve("cloud9/plugins-client/ext.editors/editors.js")),
        mount: "/static",
        rjs: {
            'ext/editors/editors': "/editors"
        }
    }]);

    var cpluginsPath = path.resolve(path.dirname(require.resolve("cloud9/plugins-client/cloud9.core/cloud9-lib.js")),  "..")
    var dirs = fs.readdirSync(cpluginsPath)
    dirs.forEach(function(dir) {
        var pluginPath = path.join(cpluginsPath, dir)
        var name = dir.split(".")[1];
        imports.static.addStatics([{
            path: pluginPath,
            mount: "/static/ext/" + name
        }]);
    })

    var cpluginsPath2 =  path.resolve(__dirname, "../../plugins-client")
    var dirs2 = fs.readdirSync(cpluginsPath2)
    dirs2.forEach(function(dir) {
        var pluginPath = path.join(cpluginsPath2, dir)
        var name = dir.split(".")[1];
        imports.static.addStatics([{
            path: pluginPath,
            mount: "/static/ext/" + name
        }]);
    })

    var others = ['lib.ace', 'lib.apf']
    others.forEach(function(dir) {
        var pluginPath = path.resolve(cpluginsPath, dir)
        var name = dir.split(".")[1];
        imports.static.addStatics([{
            path: pluginPath + '/www',
            mount: "/static"
        }]);
    })

    imports.static.addStatics([{
        path: path.join(path.dirname(require.resolve("cloud9/node_modules/v8debug/package.json")), "lib"),
        mount: "/static",
        rjs: {
            debug: "/v8debug",
            v8debug: "/v8debug"
        }
    }]);

    var base = path.dirname(require.resolve("cloud9/node_modules/ace/package.json"))
    imports.static.addStatics([{
        path: base + "/lib",
        mount: "/static",
        rjs: {
            ace: "/ace"
        }
    }, {
        path: base + "/build/src",
        mount: "/static/ace/build"
    }]);


    var base = path.dirname(require.resolve("cloud9/node_modules/treehugger/package.json"));
    imports.static.addStatics([{
        path: base + "/lib",
        mount: "/static",
        rjs: {
            treehugger: "/treehugger"
        }
    }]);

    var base = path.dirname(require.resolve("cloud9/plugins-client/cloud9.core/cloud9-lib.js")) + "/www";
    imports.static.addStatics([{
        path: base,
        mount: "/static"
    }]);

    // Make apf_patch available
    imports.static.addStatics([{
        path: path.join(__dirname, 'static'),
        mount: "/",
        rjs: {
            'apf_patch': "/apf_patch"
        }
    }]);

    var base = path.dirname(require.resolve("cloud9/plugins-client/ext.revisions/revisions.js"))
    imports.static.addStatics([{
        path: base,
        mount: "/ext/revisions/static/ext/revisions"
    }]);


    register(null, {
        "proxy.static": {}
    });
};
