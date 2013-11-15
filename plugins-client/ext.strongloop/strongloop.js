define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var settings = require("ext/settings/settings");
var runpanel = require("ext/runpanel/runpanel");

module.exports = ext.register("ext/strongloop/strongloop", {
    name             : "Strongloop",
    dev              : "Cloud9 IDE, Inc.",
    alone            : true,
    type             : ext.GENERAL,
    nodes            : [],
    offline          : true,

    init : function(){

        function addStrongLoopConf() {
            var model = settings.model;

            model.setQueryValue("preview/@running_app", "true");

            var runConfigs = model.queryNode("auto/configurations");

            if (runConfigs.getAttribute("strongloop") != "1") {
                runConfigs.setAttribute("strongloop", "1");
                var slcfg = apf.n("<config />")
                    .attr("path", "app.js")
                    .attr("name", "StrongLoop Demo Application")
                    .attr("value", "node 0.10")
                    .attr("last", "true");

                var lastConf = model.queryNode("//config[@last='true']");
                if (lastConf)
                    apf.xmldb.removeAttribute(lastConf, "last");

                runConfigs.insertBefore(slcfg.node(), runConfigs.firstChild);

                runpanel.model.load(runConfigs);

                if (typeof lstRunCfg !== "undefined") {
                    lstRunCfg.reload();
                    lstRunCfg.select(model.queryNode("//config[@last='true']"));
                }
            }
        }

        ide.addEventListener("settings.load", function(e){
            // Make sure other listeners are already loaded
            setTimeout(addStrongLoopConf, 0);
        });
    },

    destroy : function(){}
});

});