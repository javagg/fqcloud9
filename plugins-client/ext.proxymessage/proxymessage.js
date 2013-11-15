define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");

module.exports = ext.register("ext/proxymessage/proxymessage", {
    name   : "Proxy message",
    dev    : "Ajax.org",
    type   : ext.GENERAL,
    alone  : true,

    hook : function(){
        ide.addEventListener("socketMessage", this.onMessage.bind(this));
    },

    onMessage: function(e) {
        var type = e.message.type;
        if (type != "result" && e.message.subtype == "projectinfo") {
            mdlPrjInfo.load(JSON.stringify(e.message.body));
        }
    }
});

});
