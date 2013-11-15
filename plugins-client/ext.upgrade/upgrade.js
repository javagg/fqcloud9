/**
 * Adds tooltips to elements
 *
 * @author Ruben Daniels
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function (require, exports, module) {

var ext = require("core/ext");
var ide = require("core/ide");
//var markup = require("text!ext/upgrade/upgrade.xml");

module.exports = ext.register("ext/upgrade/upgrade", {
    name: "Upgrade",
    dev: "Ajax.org",
    alone: true,
    //markup: markup,
    type: ext.GENERAL,

    nodes: [],

    hook : function(){},
    
    suggestUpgrade : function(title, body){
        ext.initExtension(this);
        
        //winUpgrade.show();
        window.open("/dashboard.html?upgrade");
    }
});
});
