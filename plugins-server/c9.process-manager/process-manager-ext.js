"use strict";

var ProcessManager = require("cloud9/plugins-server/cloud9.process-manager/process_manager");
ProcessManager.prototype.kill = function(pid, callback, signal) {
    if (typeof callback !== "function") {
        callback = function () {};
    }

    var child = this.processes[pid];
    if (!child)
        return callback("Process does not exist");

    child.killed = true;
    child.kill(signal || "SIGKILL");
    callback();
};

module.exports = function setup(options, imports, register) {
    var runners = {};

    var eventEmitter = imports.eventbus;
    var pm = new ProcessManager(runners, eventEmitter);

    register(null, {
        "onDestroy": function() {
            pm.destroy();
        },
        "process-manager": {
            ps: function(callback) {
                callback(null, pm.ps());
            },
            runnerTypes: function(callback) {
                callback(null, pm.runnerTypes());
            },
            debug: pm.debug.bind(pm),
            spawn: pm.spawn.bind(pm),
            exec: function(runnerId, options, callback) {
                pm.exec(runnerId, options, function(err, pid) {
                    if (err)
                        return callback(err);
                }, callback);
            },
            kill: pm.kill.bind(pm),
            addRunner: function(name, runner) {
                runners[name] = runner;
            },
            execCommands: pm.execCommands.bind(pm),
            destroy: pm.destroy.bind(pm),
            prepareShutdown: pm.prepareShutdown.bind(pm)
        }
    });
};