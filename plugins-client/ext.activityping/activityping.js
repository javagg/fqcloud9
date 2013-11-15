/**
 * Activity ping plug-in (pings the server every x minutes, so we can tell
 * a workspace is open)
 *
 * @copyright 2012, Cloud9 IDE B.V.
 * @author Zef Hemel (zef at c9.io)
 */
define(function(require, exports, module) {

var ext = require("core/ext");
var ide = require("core/ide");

module.exports = ext.register("ext/activityping", {
    name   : "Activity pinging",
    dev    : "Cloud9 IDE",
    type   : ext.GENERAL,
    alone  : true,
    
    init : function() {
        function ping() {
            ide.dispatchEvent("track_action", {
                type: "workspace ping"
            });
        }
        this.timer = setInterval(ping, 5 * 60 * 1000);
        ping();
    },

    disable : function(){
        clearInterval(this.timer);
    },

    destroy : function(){
        clearInterval(this.timer);
    }
});

});