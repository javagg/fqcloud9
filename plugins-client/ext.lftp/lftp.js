/**
 * LFTP-based FTP Plugin for the Cloud9 IDE
 *
 * @copyright 2013, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var markup = require("text!ext/lftp/lftp.xml");
var settings = require("ext/settings/settings");
var menus = require("ext/menus/menus");
var commands = require("ext/commands/commands");
var ideConsole = require("ext/console/console");
var css = require("text!ext/lftp/lftp.css");

/*global mnuCtxTree winDeployFTP trFiles btnConfirmStop btnConfirmOk
         tbFTPUser tbFTPPass tbFTPHost tbFTPPort tabConsole
         tbFTPLocal tbFTPRemote cbFTPLog cbFTPSync ftpConn
         lftpConsoleHbox txtLFTPConsole*/

var options = {};
var isFTPMirroredToLocal = false;
var mirror = require("ext/lftp/lftp-mirror");
var allowIncremental = true;

module.exports = ext.register("ext/lftp/lftp", {
    name     : "lftp",
    dev      : "Ajax.org",
    alone    : true,
    type     : ext.GENERAL,
    markup   : markup,
    nodes    : [],
    pageID   : "pgLFTPConsole",

    hook: function() {
        var _self = this;
        
        commands.addCommand({
            name: "deployftp",
            hint: "",
            bindKey: { mac: "Ctrl-Alt-D", win: "Ctrl-Alt-D" },
            exec: function() {
                _self.show(true);
            }
        });

        commands.addCommand({
            name: "deployftpforfolder",
            hint: "",
            exec: function() {
                setTimeout(function() {
                    ext.initExtension(_self);
                    useTreeFolder();
                    _self.show(true);
                });
            }
        });

        commands.addCommand({
            name: "mountftp",
            hint: "",
            exec: function() {
                setTimeout(function() {
                    ext.initExtension(_self);
                    _self.show(false);
                });
            }
        });
        
        commands.addCommand({
            name: "mountftpforfolder",
            hint: "",
            bindKey: { mac: "Ctrl-Alt-D", win: "Ctrl-Alt-D" },
            exec: function() {
                setTimeout(function() {
                    ext.initExtension(_self);
                    useTreeFolder();
                    _self.show(true);
                });
            }
        });
        
        function useTreeFolder() {
            if (trFiles.selected && trFiles.selected.getAttribute("path") && trFiles.selected.getAttribute("type") === "folder")
                tbFTPLocal.setValue(trFiles.selected.getAttribute("path").replace(/^\/((?!workspace)[^\/]+\/[^\/]+\/)?workspace/, ""));
        }
        
        ide.addEventListener("init.ext/tree/tree", function() {
            mnuCtxTree.addEventListener("afterrender", function() {
                var divider = mnuCtxTree.selectNodes("a:divider")[1];
                mnuCtxTree.insertBefore(new apf.divider(), divider);
                mnuCtxTree.insertBefore(new apf.item({
                    match:"[folder]",
                    command: "deployftpforfolder",
                    caption: "Deploy to (S)FTP Server"
                }), divider);
                
                menus.addItemByPath("File/Deploy to (S)FTP...", new apf.item({
                    command : "deployftp"
                }), 360);
            });
        });
        
        /*
        menus.addItemByPath("File/Mount (S)FTP directory...", new apf.item({
            command : "mountftp"
        }), 361);
        */
        
        // Load lazily
        if (settings.model.queryValue("ftpsync/@host"))
            ext.initExtension(this);
    },
    
    init : function(){
        var _self = this;
        
        apf.importCssString(css);

        mirror.init(ide, this);
        ide.addEventListener("afterfilesave", _self.onFileSave.bind(_self));
        
        this.loadSettings();
        // settings.model.addEventListener("update", this.loadSettings.bind(this));
        
        btnConfirmStop.addEventListener("click", function() {
             _self.mirrorStop();
            winDeployFTP.hide();
            _self.resetUI();
        });
        
        btnConfirmOk.addEventListener("click", function() {
            if (!ftpConn.validate())
                return;
            
            // TODO: validate input, disallow commas & single quotes in username/password/etc
            btnConfirmOk.disable();
            
            winDeployFTP.hide();
            
            if (_self.saveSettings()) { // Settings changed, refresh
                _self.loadSettings();
                allowIncremental = false;
                isFTPMirroredToLocal = false;
            }
            
            // _self.mirrorFTPToLocal();
            mirror.mirrorLocalToFTP(allowIncremental, false);
            allowIncremental = true;
            
            ide.dispatchEvent("track_action", {
                type: "lftp",
                action: "localToFTP",
                protocol: (options.host.match("^([^:]*)://") && options.host.match("^([^:]*)://")[1]) || "ftp"
            });
        });
        
        _self.resetUI();
        
        ide.addEventListener("init.ext/console/console", function() {
            var panel = tabConsole.add("FTP Log", _self.pageID);
            panel.setAttribute("closebtn", false);
            panel.appendChild(lftpConsoleHbox);
        });
    },
    
    resetUI : function() {
        btnConfirmOk.enable();
        // progressFTPInfo.hide();
        // formFTPInfo.show();
        btnConfirmStop.hide();
    },
    
    show : function(sync) {
        ext.initExtension(this);
        this.resetUI();
        cbFTPSync.setValue(sync);
        winDeployFTP.show();
        setTimeout(function() {
            winDeployFTP.focus();
            tbFTPHost.focus();
            tbFTPHost.select();
        }, 0);
    },
    
    loadSettings : function() {
        tbFTPUser.setValue(options.username = settings.model.queryValue("ftpsync/@username"));
        tbFTPPass.setValue(options.password = settings.model.queryValue("ftpsync/@password"));
        tbFTPHost.setValue(options.host = settings.model.queryValue("ftpsync/@host"));
        tbFTPPort.setValue(options.port = settings.model.queryValue("ftpsync/@port") || 21);
        tbFTPLocal.setValue(options.local = settings.model.queryValue("ftpsync/@local"));
        tbFTPRemote.setValue(options.remote = settings.model.queryValue("ftpsync/@remote"));
        // cbFTPLog.setValue(options.log = settings.model.queryValue("ftpsync/@log") == "true");
        cbFTPSync.setValue(options.sync = settings.model.queryValue("ftpsync/@sync") == "true");
        mirror.configure(options);
    },
    
    saveSettings : function() {
        return this.changeSetting("ftpsync/@username", tbFTPUser.value) |
            this.changeSetting("ftpsync/@password", tbFTPPass.value) |
            this.changeSetting("ftpsync/@host", tbFTPHost.value) |
            this.changeSetting("ftpsync/@port", tbFTPPort.value) |
            this.changeSetting("ftpsync/@local", tbFTPLocal.value) |
            this.changeSetting("ftpsync/@remote", tbFTPRemote.value) |
            // this.changeSetting("ftpsync/@log", cbFTPLog.value) |
            this.changeSetting("ftpsync/@sync",cbFTPSync.value);
    },
    
    changeSetting : function(setting, value) {
        var oldValue = settings.model.queryValue(setting);
        if (oldValue == value || (!oldValue && !value))
            return false;
        settings.model.setQueryValue(setting, value);
        return true;
    },
    
    startLog : function() {
        ext.initExtension(ideConsole);
        settings.model.setQueryValue("auto/console/@expanded", true);
        ideConsole.show();
        lftpConsoleHbox.show();
        tabConsole.set(this.pageID);
        txtLFTPConsole.setValue("");
        this.log("FTP Synchronization started\n");
    },

    log: function(msg) {
        if (typeof tabConsole !== "undefined" && tabConsole.visible)
            ideConsole.enable();

        msg = apf.escapeXML("" + msg);
        msg = msg.replace(/\n/gm, "<br>").replace(/\s/gm, "&nbsp;");

        txtLFTPConsole.addValue("<div class='item console_response'>" + msg + "</div>");
    },

    onFileSave: function(event) {
        // TODO
    }

});

});