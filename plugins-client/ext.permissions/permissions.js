define(function(require, exports, module) {
    
var ext = require("core/ext");
var ide = require("core/ide");
var util = require("core/util");

module.exports = ext.register("ext/permissions/permissions", {
    name   : "Permissions",
    dev    : "Ajax.org",
    type   : ext.GENERAL,
    alone  : true,

    hook : function(){
        ide.addEventListener("socketMessage", this.onMessage.bind(this));
    },

    onMessage: function(e) {
        var type = e.message.type;
        if (type == "permissions") {
            if (e.message.permissions == "rw") {
                util.alert(
                    "Permissions Changed",
                    "Read+Write Access Granted",
                    "You have been granted read+write access to this project.<br />Press OK to reload the IDE in read/write mode.",
                    function() {
                        window.location.replace("http://" + window.location.host + window.location.pathname + "?ts=" + new Date().getTime());
                    }
                );
            } else {
                util.alert(
                    "Permissions Changed", 
                    "Read+Write Access Revoked", 
                    "Your read/write access has been revoked. Press OK to reload the IDE.", 
                    function() {
                        window.location.replace("http://" + window.location.host + window.location.pathname + "?ts=" + new Date().getTime());
                    }
                );
            }
        }
    }

});

});