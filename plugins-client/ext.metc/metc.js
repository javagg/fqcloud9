define(function (require, exports, module) {
    var ide = require("core/ide");
    var ext = require("core/ext");
    var util = require("core/util");
    var menus = require("ext/menus/menus");
    var commands = require("ext/commands/commands");
    var nodeRunner = require("ext/noderunner/noderunner");
    nodeRunner._detectRunner = nodeRunner.detectRunner

    // Add a runner
    nodeRunner.detectRunner = function(path) {
        return path.match(/\.(sa)$/) ? "sa" : this._detectRunner(path)
    }

    module.exports = ext.register("ext/metc/metc", {
        name: "metc",
        dev: "freequant.org",
        alone: true,
        deps: [],
        type: ext.GENERAL,

        nodes: [],

        hook: function () {
            if (ide.readonly) return;
            var _self = this;

            ext.initExtension(this);

//            commands.addCommand({
//                name: "startors",
//                exec: function() {
//                    _self.startOrs();
//                }
//            });
//
//            commands.addCommand({
//                name: "stopors",
//                exec: function() {
//                    _self.stopOrs();
//                }
//            });
//
//            commands.addCommand({
//                name: "restartors",
//                exec: function() {
//                    _self.restartOrs();
//                }
//            });
//
//            commands.addCommand({
//                name: "runsa",
//                exec: function () {
//                    _self.runSa();
//                }
//            });
//
//            commands.addCommand({
//                name: "runstopsa",
//                bindKey: {mac: "F9", win: "F9"},
//                exec: function () {
//                    if (stProcessRunning.active)
//                        _self.stopSa();
//                    else
//                        _self.runSa();
//                }
//            });
//
//            commands.addCommand({
//                name: "stopsa",
//                exec: function() {
//                    _self.stopSa();
//                }
//            });

//            this.nodes.push(
//                menus.setRootMenu("Metc", 1000),
//                menus.addItemByPath("Metc/Start ORS", new apf.item({
//                    command : "startors"
//                }), 1010),
//                menus.addItemByPath("Metc/Stop ORS", new apf.item({
//                    command : "stopors"
//                }), 1030),
//                menus.addItemByPath("Metc/Restart ORS", new apf.item({
//                    command : "restartors"
//                }), 1040),
//
//                menus.addItemByPath("Metc/~", new apf.divider(), 1050),
//
//                menus.addItemByPath("Metc/Start SA", new apf.item({
//                    command : "runsa"
//                }), 1060),
//                menus.addItemByPath("Metc/Stop SA", new apf.item({
//                    command : "stopsa"
//                }), 1070)
//            );

//            ide.addEventListener("socketMessage", this.onMessage.bind(this));
        },

        destroy: function () {
//            menus.remove("Metc");
//            commands.removeCommandsByName(["startors", "stopors", "restartors", "runsa", "stopsa"]);
            this.$destroy();
        },

        init: function() {
            var _self = this;

//            ide.addEventListener("socketDisconnect", function() {
//                ide.dispatchEvent("dbg.exit");
//                stProcessRunning.deactivate();
//            });
//
//            ide.addEventListener("socketConnect", function() {
//                _self.queryServerState();
//            });
//
//            ide.addEventListener("socketMessage", this.onMessage.bind(this));
//
//            this.nodePid = null;
        },

//        runSa: function() {
//            var path = "command";
//            var args = []
//
//            if (stProcessRunning.active || typeof path != "string") return false;
//
//            // TODO there should be a way to set state to waiting
//            stProcessRunning.activate();
//            var page = ide.getActivePageModel();
//            var command = {
//                "command" : "run",
//                "subcommand": "strategyagent",
//                "file" : "./command",
//                "runner" : "sa",
//                "args" : ["-c", "../sa_config"],
//                "cwd" : "/home/alex/c9_prj",
//                "env" : {
//                    "C9_SELECTED_FILE": page ? page.getAttribute("path").slice(ide.davPrefix.length) : ""
//                }
//            };
//            console.log("ide send:"+JSON.stringify(command))
//            ide.send(command);
//        },
//
//        stopSa: function() {
//            if (!stProcessRunning.active) return;
//            ide.send({ "command": "kill", "runner" : "sa", "pid" : this.nodePid });
//        },
//
//        startOrs: function() {
//            var data = { command: "metc", subcommand: "ors", action: "start" };
//
//            if (ext.execCommand("metc", data) !== false) {
//                if (ide.dispatchEvent("consolecommand." + "metc", {
//                    data: data
//                }) !== false) {
//                    if (!ide.onLine) {
//                        util.alert("Currently Offline", "Currently Offline",
//                            "This operation could not be completed because you are offline."
//                        );
//                    } else {
//                        ide.send(data);
//                    }
//                }
//            }
//        },

//        stopOrs: function() {
//            var data = { command: "metc", subcommand : "ors", action : "stop" };
//
//            ide.dispatchEvent("track_action", { type: "metc" });
//            if (ext.execCommand('metc', data) !== false) {
//                if (ide.dispatchEvent("consolecommand." + this.command, {
//                    data: data
//                }) !== false) {
//                    if (!ide.onLine) {
//                        util.alert(
//                            "Currently Offline",
//                            "Currently Offline",
//                            "This operation could not be completed because you are offline."
//                        );
//                    } else {
//                        ide.send(data);
//                    }
//                }
//            }
//        },

//        restartOrs: function() {
//            util.alert("haha")
//        },
//
//        onMessage : function(e) {
//            var message = e.message;
//            //if (message.type != "shell-data")
//            // console.log("MSG", message)
//            var runners = window.cloud9config.runners;
//            var lang;
//            if ((lang = /^(\w+)-debug-ready$/.exec(message.type)) && runners.indexOf(lang[1]) >= 0) {
////                ide.dispatchEvent("dbg.ready", message);
////                return;
//            } else if ((lang = /^(\w+)-exit$/.exec(message.type)) && runners.indexOf(lang[1]) >= 0) {
////                ide.dispatchEvent("dbg.exit", message);
//                if (message.pid == this.nodePid) {
//                    stProcessRunning.deactivate();
//                    this.nodePid = 0;
//                }
//                return;
//            }
//
//            switch(message.type) {
//                case "state":
//                    this.nodePid = message.processRunning || 0;
//                    stProcessRunning.setProperty("active", !!message.processRunning);
//
////                    ide.dispatchEvent("dbg.state", message);
//                    break;
//
//                case "error":
//                    // child process already running
//                    if (message.code == 1) {
//                        stProcessRunning.setProperty("active", true);
//                    }
//                    // debug process already running
//                    else if (message.code == 5) {
//                        stProcessRunning.setProperty("active", true);
//                    }
//                    /*
//                     6:
//                     401: Authorization Required
//                     */
//                    // Command error
//                    else if (message.code === 9) {
//                        c9console.log("<div class='item console_log' style='font-weight:bold;color:yellow'>"
//                            + apf.escapeXML(message.message) + "</div>");
//                    }
//                    else if (message.code !== 6 && message.code != 401 && message.code != 455 && message.code != 456) {
//                        c9console.log("<div class='item console_log' style='font-weight:bold;color:#ff0000'>[C9 Server Exception "
//                            + apf.escapeXML(message.code || "") + "] " + apf.escapeXML(message.message) + "</div>");
//
//                        apf.ajax("/api/debug", {
//                            method      : "POST",
//                            contentType : "application/json",
//                            data        : JSON.stringify({
//                                agent   : navigator.userAgent,
//                                type    : "C9 SERVER EXCEPTION",
//                                code    : e.code,
//                                message : e.message
//                            })
//                        });
//                    }
//
//                    break;
//            }
//        }
    });
});