#!/usr/bin/env node

var path = require('path');
var architect = require("architect");
var spawn = require("child_process").spawn;
var argv = require('optimist').argv;
var fs = require("fs");
var sh = require("execSync");

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
        array[index + 1] = 'xxxxxxxx';
    }
});
process.title = title_parts.join(' ');

var debug = argv.d || false;
var packed = argv.P !== undefined;
var packedName = (argv.P === true) ? "c9os.min.js" : argv.P;
var exists = fs.existsSync || path.existsSync;

console.log("Node location: " + sh.exec('which node 2>&1').stdout + "Please set PATH if you want to use other Node\n")

if (debug) {
    // apf debug doesn't exist, copy it
    var apf_debug = "node_modules/cloud9/plugins-client/lib.apf/www/apf-packaged/apf_debug.js"
    var apf_release = "node_modules/cloud9/plugins-client/lib.apf/www/apf-packaged/apf_release.js"
    if (!exists(apf_debug)) {
        fs.createReadStream(apf_release).pipe(fs.createWriteStream(apf_debug));
    }
    boot();
} else if (packed) {
    configName = "packed";
    if (!exists("node_modules/cloud9/plugins-client/lib.packed/www/" + packedName) && !exists("node_modules/cloud9/plugins-client/lib.packed/www/" + packedName + ".gz")) {
        console.log("Building packed file for first run...Please wait...");
        console.log("   |\\      _,,,---,,_\n" +
            "   /,`.-'`'    -.  ;-;;,_\n" +
            "   |,4-  ) )-,_..;\\ (  `'-'\n" +
            "   '---''(_/--'  `-'\\_)  Felix Lee");

//        var buildPackage = spawn("make", ["package"]);
        var buildPackage = spawn("make", ["packit"]);

        buildPackage.stderr.setEncoding("utf8");
        buildPackage.stderr.on('data', function (data) {
            console.error(data);
        });
        buildPackage.on('exit', function (code) {
            if (code !== 0) {
                console.error('build-package process exited with code ' + code);
                process.exit(code);
            }
            boot();
        });
    } else {
        boot()
    }
} else {
    boot();
}

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
