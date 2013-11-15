#!/usr/bin/env node

var path = require('path');
var architect = require("architect");
var spawn = require("child_process").spawn;
var fs = require("fs");

// TODO: Need better args parser.

var configName = process.argv[2] || "default";

// when command line arguments are passed into this, we ignore them
// when loading the config file.
if (configName.indexOf("-") === 0) {
    configName = "default";
}

// If a password is given as a command line parameter, we hide it
// in the title of the process instead of displaying it in plain
// text.
var title_parts = process.argv.slice();
title_parts.forEach(function(element, index, array) {
    if (element === '--password') {
        array[index+1] = 'xxxxxxxx';
    }
});
process.title = title_parts.join(' ');

var debug = false;
var packed = false;
var packedName = "";
var exists = fs.existsSync || path.existsSync;

for (var p = 2; p < process.argv.length; p++) {
    if (process.argv[p] === "-d") {
        debug = true;

        // apf debug doesn't exist, copy it
        var apf_debug = "node_modules/cloud9/plugins-client/lib.apf/www/apf-packaged/apf_debug.js"
        var apf_release = "node_modules/cloud9/plugins-client/lib.apf/www/apf-packaged/apf_release.js"
        if (!exists(apf_debug)) {
            fs.createReadStream(apf_release).pipe(fs.createWriteStream(apf_debug));
        }
        boot();
    }

    else if (process.argv[p] === "-P") {
        packed = true;
        if (process.argv[p + 1] && process.argv[p + 1].indexOf("-") < 0) // use this specific packed file
            packedName = process.argv[++p];
        else
            packedName = "c9os.min.js";

        configName = "packed";

        if (!exists("node_modules/cloud9/plugins-client/lib.packed/www/" + packedName) && !exists("node_modules/cloud9/plugins-client/lib.packed/www/" + packedName + ".gz")) {
            console.error('Packed file not found', 211);
        }
        else
            boot();
    }
}

if (debug == false && packed == false)
    boot();

function boot() {
    var configPath = path.resolve(__dirname, "./configs/", configName);
    var plugins = require(configPath);

    // server plugins
    plugins.forEach(function(plugin) {
        if (plugin.packagePath && /\.\.\/\.\.\/\.\.\/plugins-server\/cloud9.core$/.test(plugin.packagePath)) {
            plugin.debug = debug;
            plugin.packed = packed;
            plugin.packedName = packedName;
        }
    });

    architect.createApp(architect.resolveConfig(plugins, __dirname + "/node_modules/cloud9/plugins-server"), function (err, app) {
        if (err) {
            console.error("While starting the '%s':", configPath);
            throw err;
        }
        console.log("Started '%s'!", configPath);
//        console.log(plugins)
    });
}
