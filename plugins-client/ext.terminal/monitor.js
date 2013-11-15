/**
 * Terminal Module for the Cloud9 IDE
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
"use strict";

// ======= WARNING ======
// make sure to not add regexps with catastrophic backtracking (http://www.regular-expressions.info/catastrophic.html)
// things like /.*stuff.*/ or /foo(.|\s)*bar/ or /(x+x+)y/
// can crash chrome


function Monitor (terminal) {
    this.$terminal = terminal;
    this.workspaceId = window.cloud9config.workspaceId || "";
    var prompt = this.workspaceId.split("/").slice(1).join("@");
    this.$promptRegex = new RegExp(prompt + ".*\\$\\s?");
}

var portHostMsg = "Error: you may be using the wrong PORT & HOST for your server app\r\n";

Monitor.errors = [
    {
        // Sudo not supported
        pattern: /bash: \/usr\/bin\/sudo: Permission denied/,
        message: "Sorry, you don't have sudo access on this machine"
    },
    {
        // Rails or Sinatra
        pattern: /WARN {1,2}TCPServer Error: (?:Address already in use|Permission denied) - bind\(2\)/,
        message: portHostMsg + "For rails, use: 'rails s -p $PORT -b $IP'\r\n" +
            "For Sinatra, use: ruby app.rb -p $PORT -o $IP'"
    },
    {
        // Node app
        pattern: /Error: listen (?:EADDRINUSE|EACCES|EADDRNOTAVAIL)/,
        message: portHostMsg + "Node: use 'process.env.PORT' as the port and 'process.env.IP' as the host in your scripts. See also https://c9.io/site/blog/2013/05/can-i-use-cloud9-to-do-x/"
    },
    {
        // Django app
        pattern: /Error: You don't have permission to access that port./,
        message: portHostMsg + "use './manage.py runserver $IP:$PORT' to run your Django application"
    },
    {
        // Tunneling to some database provider
        pattern: /Errno: EACCES Permission Denied - bind\(2\)/,
        message: portHostMsg + "Only binding to the internal IP configured in $IP is supported. See also https://c9.io/site/blog/2013/05/can-i-use-cloud9-to-do-x/"
    },
    {
        // MongoDB
        pattern: /\[initandlisten\] ERROR: listen\(\): bind\(\) failed errno:13 Permission denied for socket: 0\.0\.0\.0:/,
        message: portHostMsg + "Please bind to the internal IP using --bind_ip=$IP"
    },
    {
        // Meteor/generic
        pattern: /Can't listen on port /,
        message: portHostMsg + "Please bind to IP $IP and port $PORT. See also https://c9.io/site/blog/2013/05/can-i-use-cloud9-to-do-x/"
    },
    {
        // FALLBACK/GENERIC
        pattern: /Permission denied for socket: 0\.0\.0\.0:/,
        message:  portHostMsg + "Only binding to the internal IP configured in $IP is supported. See also https://c9.io/site/blog/2013/05/can-i-use-cloud9-to-do-x/"
    }
];

Monitor.servers = [
    /Express server listening on port/,
    /INFO\ \ WEBrick::HTTPServer#start: pid=\d+ port=\d+/,
    /server(?: is | )(?:listening|running) (?:at|on)\b/i
];

Monitor.extensions = [
    {
        pattern: /\[\[ c9: (?:open|edit) (.*) \]\]/,
        hook: function (match) {
            var editors = require("ext/editors/editors");
            var workspaceDir = window.cloud9config.workspaceDir;
            var absPath = match[1].trim();
            if (absPath.indexOf(workspaceDir) !== 0)
                return console.warn("Can't open files out of project directory");
            var filePath = absPath.replace(workspaceDir, window.cloud9config.davPrefix);
            editors.gotoDocument({path: filePath});
        }
    }
];

function cutMatch(str, match) {
    return str.substr(0, match.index) + str.substr(match.index + match[0].length);
}

(function () {

    this.onData = function(data) {
        // todo use $terminal.lines instead?
        // remove more characters
        this.acc += data.replace(/\u001B/g, "");
        this.check();
    };

    this.check = function() {
        this.checkExtensions();
        this.checkErrors();
        this.checkRunningApp();

        if (this.acc.length > 2000)
            this.acc = this.acc.substr(1000);
    };

    this.checkExtensions = function () {
        var str = this.acc;
        for (var i = 0, n = Monitor.extensions.length; i < n; i++) {
            var ext = Monitor.extensions[i];
            var m = ext.pattern.exec(str);
            if (m) {
                ext.hook.call(null, m);
                this.acc = cutMatch(str, m);
                return;
            }
        }
    };

    this.checkErrors = function() {
        var str = this.acc;
        if (!this.$promptRegex.test(str))
            return;
        for (var i = 0, n = Monitor.errors.length; i < n; i++) {
            var err = Monitor.errors[i];
            var m = err.pattern.exec(str);
            if (m) {
                this.formatMsg(err.message);
                this.acc = cutMatch(str, m);
                return;
            }
        }
    };

    this.checkRunningApp = function() {
        var str = this.acc;
        var _self = this;
        for (var i = 0, n = Monitor.servers.length; i < n; i++) {
            var server = Monitor.servers[i];
            var m = server.exec(str);
            if (m) {
                var workspace = this.workspaceId.split("/");
                var appUrl = "https://" + workspace[2] + "-c9-" + workspace[1] + ".c9.io";
                setTimeout(function() {
                    _self.formatMsg("Your application is running at \u001B[04;36m" + appUrl);
                }, 0);
                this.acc = cutMatch(str, m);
                return;
            }
        }
    };

    this.formatMsg = function (msg) {
        var lines = msg.split("\r\n");
        var cloudyMsg = [" \u001B[30;47m\u001B[01;38;7;32m      \u001B[00m  ",
        "\u001B[00m\u001B[30;47m\u001B[01;38;7;32m Cloud9 \u001B[00m ",
        "\u001B[00m \u001B[30;47m\u001B[01;38;7;32m      \u001B[00m  "];
        this.$terminal.writeln("");
        var startLine = lines.length < cloudyMsg.length ? 1 : 0;
        for (var i = 0, n = Math.max(cloudyMsg.length, lines.length); i < n; i++) {
            this.$terminal.writeln((cloudyMsg[i] || new Array(7).join(" ")) +
                "\u001B[36m" + (lines[i-startLine] || ""));
        }
        this.$terminal.write("\u001B[00m");
    };

}).call(Monitor.prototype);

module.exports = Monitor;

});