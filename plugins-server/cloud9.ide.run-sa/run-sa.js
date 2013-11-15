"use strict";

var Plugin = require("cloud9/plugins-server/cloud9.core/plugin");
var util = require("util");
var ProcessManager;
var EventBus;
var name = "sa-runtime";

module.exports = function setup(options, imports, register) {
    ProcessManager = imports["process-manager"];
    EventBus = imports.eventbus;
    imports.ide.register(name, SaRuntimePlugin, register);
};

var SaRuntimePlugin = function(ide, workspace) {
    this.ide = ide;
    this.workspace = workspace;
    this.pm = ProcessManager;
    this.eventbus = EventBus;
    this.workspaceId = workspace.workspaceId;
    this.name = name;
    this.hooks = ["command"];
    this.channel = this.workspaceId + "::sa-runtime";
    this.processCount = 0;
};

util.inherits(SaRuntimePlugin, Plugin);

(function() {
    this.debugInitialized = {};

    this.init = function() {
        var self = this;
        this.eventbus.on(this.channel, function(msg) {
            msg.type = msg.type.replace(/^sa-debug-(start|data|exit)$/, "sa-$1");
            var type = msg.type;
           if (type == "sa-start" || type == "sa-exit") {
                self.workspace.getExt("state").publishState();
            }

            if (msg.type == "sa-start") {
                self.processCount += 1;
            }

            if (msg.type == "sa-exit") {
                self.processCount -= 1;
            }

            if (msg.type == "sa-debug-ready") {
                self.debugInitialized[msg.pid] = true;
            }
            self.ide.broadcast(JSON.stringify(msg), self.name);
        });
    };

    this.command = function(user, message, client) {
        if (!(/sa/.test(message.runner) || (message.command == "kill"))) return false;

        var res = true;
        var cmd = (message.command || "").toLowerCase();
        switch (cmd) {
            case "run":
            case "rundebug":
            case "rundebugbrk":
                this.$run(message.file, message.args || [], message.env || {}, message.version, message, client);
                break;
            /*            case "rundebug":
             this.$debug(message.file, message.args || [], message.env || {}, false, message.version, message, client);
             break;
             case "rundebugbrk":
             this.$debug(message.file, message.args || [], message.env || {}, true, message.version, message, client);
             break;*/
            case "kill":
                this.$kill(message.pid, message, client);
                break;
//
//            case "killsa":
//                this.$killsa(message.pid, message, client);
//                break;
            default:
                res = false;
        }
        return res;
    };

    this.$run = function(file, args, env, version, message, client) {
        var self = this;
        this.workspace.getExt("state").getState(function(err, state) {
            if (err) {
                return self.error(err, 1, message, client);
            }

            if (state.processRunning) {
                return self.error("Child process already running!", 1, message);
            }
            self.pm.spawn("sa", {
                file: file,
                args: args,
                env: env,
                extra: message.extra,
                encoding: "ascii"
            }, self.channel, function(err, pid, child) {
                if (err) {
                    self.error(err, 1, message, client);
                }
            });
        });
    };

    this.$debug = function(file, args, env, breakOnStart, version, message, client) {
        var self = this;
//        this.workspace.getExt("state").getState(function(err, state) {
//            if (err)
//                return self.error(err, 1, message, client);
//
//            if (state.processRunning)
//                return self.error("Child process already running!", 1, message);
//
//            self.pm.spawn("sa-debug", {
//                file: file,
//                args: args,
//                env: env,
//                breakOnStart: breakOnStart,
//                nodeVersion: version,
//                extra: message.extra,
//                encoding: "ascii"
//            }, self.channel, function(err, pid) {
//                if (err)
//                    self.error(err, 1, message, client);
//            });
//        });
    };

    this.$kill = function(pid, message, client) {
        var self = this;
        this.pm.kill(pid, function(err) {
            if (err) {
                return self.error(err, 1, message, client);
            }
        }, "SIGTERM");
    };

    this.canShutdown = function() {
        return this.processCount === 0;
    };

}).call(SaRuntimePlugin.prototype);