/**
 * LFTP Synchronizer for the Cloud9 IDE
 *
 * @copyright 2013, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var logger = require("ext/lftp/lftp");
var ide = require("core/ide");
var options;

module.exports = {
    
    init: function(myIde, myLogger) {
        ide = myIde;
        ide.addEventListener("socketMessage", onServerMessage, true);
        logger = myLogger;
    },
    
    configure: function(myOptions) {
        options = myOptions;
    },
    
    mirrorLocalToFTP : function(deleteOld, incremental) {
        logger.startLog();
        sendLFTPRequest(getMirrorCommand(deleteOld, incremental, true));
    },
    
    mirrorFTPToLocal : function(deleteOld) {
        logger.startLog();
        sendLFTPRequest(getMirrorCommand(deleteOld, false, false));
    },
    
    stop : function() {
        sendLFTPRequest(["killall lftp &>/dev/null"]);
    }
    
};

function getMirrorCommand(deleteOld, incremental, localToFTP) {
    // Start a new mirror job:
    // - kill running jobs
    // - create marker files to maintain time stamps
    // - mirror files newer than timestamp (supported for local to FTP only)
    var command = "c9ftp-mirror.sh"
        + (localToFTP ? " localToFTP" : " ftpToLocal")
        + (incremental ? " 1" : " 0")
        + (deleteOld ? " 1" : " 0")
        + " '" + options.username + "'"
        + " '" + options.password + "'"
        + " " + (parseInt(options.port, 10) || 21)
        + " '" + ide.workspaceDir + options.local + "'"
        + " '" + options.remote + "'"
        + " " + options.host;
    return command;
}

function sendLFTPRequest(command) {
    if (ide.readonly)
        return;

    ide.send({
        command: "bash",
        argv: ["-c", command],
        line: command,
        cwd: "/",
        requireshandling: true,
        extra: { lftp: true }
    });
}

function onServerMessage(event) {
    var message = event.message;
    if (!message.extra || !message.extra.lftp)
        return;
    switch (message.type) {
        case "npm-module-data": case "other-data":
            logger.log(event.message.data);
            parseServerMessage(getLastLine(event.message.data));
            break;
            
        case "npm-module-exit": case "other-exit":
            // event.message.code
            // TODO
            break;
    }
}

function parseServerMessage(line) {
    // TODO: use server message to do something useful?
}
    
function getLastLine(buffer) {
    var lastNL = buffer.lastIndexOf("\n");
    if (lastNL === -1)
        lastNL = buffer.length;
    return buffer.substr(lastNL);
}

});