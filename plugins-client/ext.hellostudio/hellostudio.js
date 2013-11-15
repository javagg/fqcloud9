/**
 * Your extension for Cloud9 IDE.
 * 
 * This extension demonstrates the ability to communicate with a server-side
 * extension.
 */
define(function(require, exports, module) {

var ext = require("core/ext");
var menus = require("ext/menus/menus");

module.exports = ext.register("ext/hellostudio/hellostudio", {
    name : "hellostudio",
    dev : "Freequant",
    alone : true,
    deps : [],
    type : ext.GENERAL,

    nodes : [],

    init : function() {
        this.nodes.push(
            menus.$insertByIndex(barExtras, new apf.button({
                skin : "c9-topbar-btn",
                "class" : "dashboard",
                tooltip : "Dashboard",
                disabled : false,
                onclick : function() {

                }
            }), 200),
            menus.$insertByIndex(barExtras, new apf.button({
                skin : "c9-topbar-btn",
                "class" : "home",
                tooltip : "Homepage",
                disabled : false,
                onclick : function() {
//                    _target = location.ref
                }
            }), 300),

            menus.setRootMenu("Share", 550),
            menus.addItemByPath("Share/Invite by email", new apf.item({
            }), 551),

            menus.addItemByPath("Share/~", new apf.divider(), 552),
            menus.addItemByPath("Share/Share on Facebook", new apf.item({

            }), 555),
            menus.addItemByPath("Share/Invite by Twitter", new apf.item({
            }), 560)
        );
   },

    hook : function() {
        ext.initExtension(this);
    },

    destroy : function() {
        this.nodes.each(function(item) {
            item.destroy(true, true);
        });
        this.nodes = [];
    }
});

});