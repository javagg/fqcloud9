"use strict";

var Plugin = require("cloud9/plugins-server/cloud9.core/plugin");
var util = require("util");
var path = require("path")
var tty = require('./tty');

var path = require("path");
var name = "terminal";

var Session = tty.Session

module.exports = function setup(options, imports, register) {
    // We are registering only for boot-time information presence
    imports.static.addStatics([{
        path: path.dirname(require.resolve("term.js/index.js")),
        mount: "/static/term.js",
        rjs: {
            "termjs": "/term.js/src/term"
        }
    }]);

    imports.static.addStatics([{
        path: __dirname,
        mount: "/static/ide.terminal",
        rjs: {
            "tty": "/ide.terminal/static/tty"
        }
    }]);

    var ide = imports.ide
    ide.register(name, TerminalPlugin, register);
    imports["smith.io.ide"].addConnectionHook("/smith.io-ide", function(connection) {
        var transport = {
            send: function(message) {
                message = JSON.parse(message)
                connection.transport.send(message)
            },
            disconnect: function() {
                connection.transport.disconnect()
            }
        }

        connection.sessions = {}

        var conf = {
            termName: 'xterm-color',
            shell: 'bash',
            server: imports.http.getServer(),
            engine_io: null,
            sessionTimeout: 3600, // in seconds,
            cwd: ide.getServer().workspaceDir
        }

        var session = new Session(transport, conf);
        connection.on('away', function() {
            session.handleDisconnect();
            if (connection.sessions[session.id]) {
                delete connection.sessions[session.id];
            }
            return
        });

        connection.on('message', function(data) {
            if (data.cmd == 'data') {
                return session.handleData(data.id, data.payload);
            }
            if(data.cmd == 'create') {
                return session.handleCreate(data.cols, data.rows);
            }
            if (data.cmd == 'kill') {
                return session.handleKill(data.id);
            }
            if (data.cmd == 'move') {
                return session.handleMove(data.id, data.left, data.top);
            }
            if (data.cmd == 'resize') {
                return session.handleResize(data.id, data.cols, data.rows);
            }
            if (data.cmd == 'process') {
                return session.handleProcess(data.id);
            }
            if (data.cmd == 'request paste') {
                return session.handlePaste();
            }

            return console.log("Unknown message received: %s", JSON.stringify(data));
        });
    });
};

var TerminalPlugin = function(ide, workspace) {
    this.ide = ide;
    this.workspace = workspace;
    this.workspaceId = workspace.workspaceId;
    this.channel = this.workspaceId + "::terminal";
    this.hooks = ["command"];
    this.name = name;
    this.sessions = {}
};

util.inherits(TerminalPlugin, Plugin);

(function() {
    this.init = function() {
        var self = this;
    };


    this.command = function(user, message, client) {
        var res = true;
        var cmd = (message.cmd || "").toLowerCase();
        switch (cmd) {
            case "create":
                console.log("create")
                break
            case "process":
                console.log("process")
                break;
            default:
                res = false;
        }
        return res;
    };
}).call(TerminalPlugin.prototype);