// This file is almost the same as the original one except that INDEX_TMPL is update

var assert = require("assert");
var fs = require('fs')
var utils = require("connect").utils;
var error = require("http-error");
var IdeServer = require("cloud9/plugins-server/cloud9.core/ide");
var parseUrl = require("url").parse;
var middleware = require("cloud9/plugins-server/cloud9.core/middleware");
var c9util = require("cloud9/plugins-server/cloud9.core/util");
var template = require("simple-template");

var INDEX_TMPL = fs.readFileSync(__dirname + "/view/ide.tmpl.html", "utf8");

IdeServer.prototype.$serveIndex = function(req, res, next) {
    res.writeHead(200, {
        "cache-control": "no-transform",
        "Content-Type": "text/html"
    });

    var permissions = this.getPermissions(req);
    var plugins = c9util.arrayToMap(this.options.plugins);
    var bundledPlugins = c9util.arrayToMap(this.options.bundledPlugins);

    var client_exclude = c9util.arrayToMap(permissions.client_exclude.split("|"));
    for (var plugin in client_exclude)
        delete plugins[plugin];

    // TODO: Exclude applicable bundledPlugins

    var client_include = c9util.arrayToMap((permissions.client_include || "").split("|"));
    for (var plugin in client_include) {
        if (plugin)
            plugins[plugin] = 1;
    }

    var staticUrl = this.options.staticUrl;
    var workerUrl = this.options.workerUrl;
    var aceScripts = '<script type="text/javascript" data-ace-worker-path="static/js/worker" src="'
        + staticUrl + '/ace/build/ace'
        + (this.options.debug ? "-uncompressed" : "") + '.js"></script>\n';

    var loadedDetectionScript = "";
    if (this.options.local) {
        loadedDetectionScript = '<script type="text/javascript" src="c9local/ui/connected.js?workspaceId=' +
            this.options.workspaceId + '"></script>';
    }

    var replacements = {
        davPrefix: this.options.davPrefix,
        workspaceDir: this.options.workspaceDir,
        debug: this.options.debug,
        workerUrl: workerUrl,
        staticUrl: staticUrl,
        smithIo: JSON.stringify(this.options.smithIo),
        sessionId: req.sessionID, // set by connect
        uid: req.session.uid || req.session.anonid || 0,
        pid: this.options.pid || process.pid || 0,
        workspaceId: this.options.workspaceId,
        plugins: Object.keys(plugins),
        bundledPlugins: Object.keys(bundledPlugins),
        readonly: (permissions.fs !== "rw"),
        requirejsConfig: this.options.requirejsConfig,
        settingsXml: "",
        runners: this.options.runners,
        scripts: (this.options.debug || this.options.packed) ? "" : aceScripts,
        projectName: this.options.projectName,
        version: this.options.version,
        hosted: this.options.hosted.toString(),
        env: this.options.env || "local",
        packed: this.options.packed,
        packedName: this.options.packedName,
        local: this.options.local,
        loadedDetectionScript: loadedDetectionScript,
        _csrf: req.session && req.session._csrf || ""
    };

    var settingsPlugin = this.workspace.getExt("settings");
    var user = this.getUser(req);

    if (!settingsPlugin || !user) {
        var index = template.fill(INDEX_TMPL, replacements);
        res.end(index);
    }
    else {
        settingsPlugin.loadSettings(user, function(err, settings) {
            replacements.settingsXml = err || !settings ? "defaults" : settings.replace(/]]>/g, '&#093;&#093;&gt;');
            var index = template.fill(INDEX_TMPL, replacements);
            res.end(index);
        });
    }
}

module.exports = function setup(options, imports, register) {

    assert(options.fsUrl, "option 'fsUrl' is required");
    assert.equal(typeof options.hosted, "boolean", "option 'hosted' is required");

    var log = imports.log;
    var hub = imports.hub;
    var pm = imports["process-manager"];
    var connect = imports.connect;
    var permissions = imports["workspace-permissions"];

    var sandbox = imports.sandbox;
    var baseUrl = options.baseUrl || "";
    var staticPrefix = imports.static.getStaticPrefix();
    var workerPrefix = imports.static.getWorkerPrefix() || "/static";

    var ide;
    var serverPlugins = {};

    sandbox.getProjectDir(function(err, projectDir) {
        if (err) return register(err);
        sandbox.getWorkspaceId(function(err, workspaceId) {
            if (err) return register(err);
            pm.runnerTypes(function(err, runnerTypes) {
                if (err) return register(err);
                init(projectDir, workspaceId, runnerTypes);
            });
        });
    });

    function initUserAndProceed(uid, workspaceId, callback) {
        permissions.getPermissions(uid, workspaceId, "cloud9.core.ide-plugin", function(err, perm) {
            if (err) {
                callback(err);
                return;
            }
            ide.addUser(uid, perm);
            callback(null, ide.$users[uid]);
        });
    }

    function init(projectDir, workspaceId, runnerTypes) {
        ide = new IdeServer({
            workspaceDir: projectDir,
            settingsPath: "",
            davPrefix: baseUrl + "/workspace",
            projectName: options.projectName || "",
            smithIo: options.smithIo,
            baseUrl: baseUrl,
            debug: (options.debug === true) ? true : false,
            workerUrl: workerPrefix,
            staticUrl: staticPrefix,
            workspaceId: workspaceId,
            runners: runnerTypes,
            name: options.name || workspaceId,
            version: options.version || null,
            requirejsConfig: {
                // http://requirejs.org/docs/api.html#config-waitSeconds
                waitSeconds: 60, // long timeout for slow connections
                baseUrl: staticPrefix,
                paths: imports.static.getRequireJsPaths(),
                packages: imports.static.getRequireJsPackages()
            },
            plugins: options.clientPlugins || [],
            bundledPlugins: options.bundledPlugins || [],
            hosted: options.hosted,
            env: options.env,
            packed: options.packed,
            packedName: options.packedName,
            local: options.local
        });

        var connectModule = connect.getModule();
        var server = connectModule();
        connect.useAuth(baseUrl, server);
        connect.useStart(connectModule.query());
        connect.useSession(connectModule.csrf());

        server.use(function(req, res, next) {
            req.parsedUrl = parseUrl(req.url);

            if (!(req.session.uid || req.session.anonid))
                return next(new error.Unauthorized());
            // NOTE: This gets called multiple times!

            var pause = utils.pause(req);

            initUserAndProceed(req.session.uid || req.session.anonid, ide.options.workspaceId, function(err) {
                if (err) {
                    next(err);
                    pause.resume();
                    return;
                }

                // Guard against `Can't set headers after they are sent. Error: Can't set headers after they are sent.`.
                try {
                    next();
                    pause.resume();
                } catch(err) {
                    console.error(err.stack);
                }
            });
        });

        hub.on("ready", function() {
            ide.init(serverPlugins);
            server.use(ide.handle.bind(ide));
            server.use(middleware.errorHandler());
            log.info("IDE server initialized. Listening on " + connect.getHost() + ":" + connect.getPort());
        });

        register(null, {
            ide: {
                register: function(name, plugin, callback) {
                    log.info("IDE SERVER PLUGIN: ", name);
                    serverPlugins[name] = plugin;
                    callback();
                },
                getServer: function() {
                    return ide;
                },
                getBaseUrl: function() {
                    return baseUrl;
                },
                getWorkspaceId: function() {
                    return ide.options.workspaceId.toString();
                },
                use: function(route, handle) {
                    var last = server.stack.pop();
                    server.use(route, handle);
                    server.stack.push(last);
                },
                canShutdown: ide.canShutdown.bind(ide),
                initUserAndProceed: initUserAndProceed,
                on: ide.on.bind(ide),
                destroy: ide.dispose.bind(ide)
            }
        });
    }
};