/**
 * Google Analytics for c9
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");

module.exports = ext.register("ext/ganalytics/ganalytics", {
    name   : "Google Analytics",
    dev    : "Ajax.org",
    type   : ext.GENERAL,
    alone  : true,

    hook : function(){

        //Include Google analytics
        var gaJsHost = (("https:" == document.location.protocol) ? "https://ssl." : "http://www.");
        apf.include(gaJsHost + "google-analytics.com/ga.js", false, null, null, function() {
            if (!self._gat) return;

            pageTracker = _gat._getTracker("UA-28921268-1");  //analytics code

            pageTracker._initData();
            ide.dispatchEvent("track_action", {type: "login"});
        });

        var pending = [];

        ide.addEventListener("socketConnect", function() {
            for (var i = 0; i < pending.length; i++)
                ide.send(pending[i]);
            pending = [];
        });

        ide.addEventListener("track_action", function(e) {
            // Google analytics action tracking
            // if (pageTracker)
            //     pageTracker._trackPageview("/" + e.type == "console" ? "cmd-" + e.cmd : e.type);

            //console.log(e.type == "console" ? "cmd-" + e.cmd : e.type);
            var stats = {
                "command": "stats",
                "type": "measure",
                "metric": e.activity || "activity",
                "title": e.type,
                "workspaceId": cloud9config.workspaceId,
                "projectName": cloud9config.projectName,
                "uid": cloud9config.uid,
                "version": cloud9config.version
            };
            // augment the [stats] object with key/values from the [e] object
            for (var i in e) {
                var type = typeof e[i];
                if (!e.hasOwnProperty(i) || stats[i] || type == "function" || i == "currentTarget" || i.indexOf("ubble") > -1)
                    continue;
                stats[i] = e[i];
            }
            if (ide.connected)
                ide.send(stats);
            else
                pending.push(stats);
        });
    }

});

});