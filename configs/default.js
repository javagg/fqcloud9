// Based from cloud9 server path
var path = require("path")
var fs = require("fs")
var argv = require('optimist').argv;
var mkdirp = require('mkdirp');

// FIXME: use openshift envvar
var port = argv.p || process.env.OPENSHIFT_NODEJS_IP  || process.env.PORT || 3131;
var host = argv.l || process.env.OPENSHIFT_NODEJS_PORT || process.env.IP || "localhost";

var projectDir = argv.w || process.env["HOME"] || process.cwd();
var runDir = argv.rundir || path.join(projectDir, ".run")
var sessionDir =  path.join(runDir, "c9sessions")
var revisionDir =  path.join(runDir, "c9revisions")
var settingsPath = path.join(runDir, "c9settings")
var projectName = argv.projectname

mkdirp.sync(runDir)
mkdirp.sync(sessionDir)
mkdirp.sync(revisionDir)

var excludedSPlugins = [
    "./connect.session.file",

    // runtimes
    "./cloud9.run.npm",
    "./cloud9.run.npmnode",
    "./cloud9.run.ruby",
    "./cloud9.run.python",
    "./cloud9.run.apache",
    "./cloud9.run.php",
    "./cloud9.ide.run-node",
    "./cloud9.ide.run-python",
    "./cloud9.ide.run-apache",
    "./cloud9.ide.run-ruby",
    "./cloud9.ide.run-php",
    "./cloud9.ide.npm",

//    "./cloud9.ide.run-npm-module"
]

var excludedCPlugins = [

]

var extensions = {};
var cpluginsPath = (path.resolve(__dirname, "../plugins-client"))
fs.readdirSync(cpluginsPath).forEach(function(dir) {
    var name = dir.split(".")[1];
    extensions[name] = path.join(cpluginsPath, dir);
})

clientPlugins = [
    // cloud9 team forgot this
    "ext/uploadfiles/uploadfiles",

//    "ext/hellostudio/hellostudio",
    "ext/metc/metc",
//            "ext/deploy/deploy",
//    "ext/tty/terminal",
    "ext/highstock/highstock",
//            "ext/rundebug/rundebug"
]

function merge(o, obj) { for (var z in obj) { o[z] = obj[z]; } return o; }

function getPackageIndex(plugins, packagePath) {
    var i
    for (i = 0; i < plugins.length; i++) {
        var plugin = plugins[i]
        if (((typeof plugin === 'string') && (plugin === packagePath)) ||
            ((typeof plugin !== 'string') && (plugins[i].packagePath === packagePath))) {
            return i
        }
    }
}
function replacePackage(plugins, oldPlugin, newPlugin) {
    var i = getPackageIndex(plugins, oldPlugin)
    var plugin = plugins[i]
    if (typeof plugin !== "string") {
        plugin.packagePath = newPlugin
    } else {
        plugin = newPlugin
    }

}

function removePackage(plugins, packagePath) {
    var i = getPackageIndex(plugins, packagePath)
    plugins.splice(i, 1)
}

plugins = require('cloud9/configs/default.js')

excludedSPlugins.forEach(function(item) {
    removePackage(plugins, item)
})

replacePackage(plugins, "./cloud9.process-manager", "../../../plugins-server/c9.process-manager")
replacePackage(plugins, "./cloud9.core", "../../../plugins-server/cloud9.core")

plugins.forEach(function(plugin) {
    if (plugin.packagePath) {
        if (plugin.packagePath && /\.\/cloud9.client-plugins$/.test(plugin.packagePath)) {
            plugin.plugins = merge(plugin.plugins, extensions)
        }
        if (plugin.packagePath && /\.\/connect.static$/.test(plugin.packagePath)) {
            plugin.prefix = "static"
            plugin.workerPrefix = 'static'
            plugin.bindPrefix = '/' + plugin.prefix
        }
        // original cloud9.core is replaced, so use the version of ours
        // original:  ./cloud9.core
        // ours: "../../../plugins-server/cloud9.core"
        if (plugin.packagePath && /\.\.\/\.\.\/\.\.\/plugins-server\/cloud9.core$/.test(plugin.packagePath)) {
            plugin.clientPlugins = plugin.clientPlugins.concat(clientPlugins)
            // Delete this value and smithIo can use correct port to connect even with proxy.
            delete plugin.smithIo['port']
            plugin.projectName = projectName
        }
        if (plugin.packagePath && /\.\/cloud9.ide.settings$/.test(plugin.packagePath)) {
            plugin.absoluteSettingsPath = settingsPath
        }
        if (plugin.packagePath && /\.\/connect.session.file$/.test(plugin.packagePath)) {
            plugin.absoluteSettingsPath = settingsPath
            plugin.sessionsPath = sessionDir
        }
        if (plugin.packagePath && /\.\/cloud9.sandbox$/.test(plugin.packagePath)) {
            plugin.projectDir = projectDir
        }
        // FIXME: need batter plan!!!
//        if (plugin.packagePath && /\.\/cloud9.connect.basic-auth/.test(plugin.packagePath)) {
//            plugin.username = function(user, pass) {
//                return 'tj' == user & 'wahoo' == pass;
//            }
//        }
    }
});

plugins = plugins.concat([
    "../../../plugins-server/connect.session.memory",
    "../../../plugins-server/cloud9.proxy.static",
    "../../../plugins-server/cloud9.ide.run-sa",
    "../../../plugins-server/cloud9.run.sa",
//    "../../../plugins-server/cloud9.ide.terminal",
    "../../../plugins-server/cloud9.ide.highstock"
])

module.exports = plugins
