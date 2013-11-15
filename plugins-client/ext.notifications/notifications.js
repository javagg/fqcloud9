/**
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 *
 */

define(function(require, exports, module) {

var ide     = require("core/ide");
var ext     = require("core/ext");
var markup  = require("text!ext/notifications/notifications.xml");
var skin    = require("text!ext/notifications/skin.xml");
var menus   = require("ext/menus/menus");

module.exports = ext.register("ext/notifications/notifications", {
    name       : "Notification bubbles",
    dev        : "Ajax.org",
    alone      : true,
    type       : ext.GENERAL,
    markup     : markup,
    skin       : {
        id : "notificationsskin",
        data : skin,
        "media-path": ide.staticPrefix + "/ext/notifications/style/images/"
    },

    init: function() {
    },

    showNotification: function(message) {
        if(menus.minimized)
            ntNotifications.setAttribute("start-padding", 25);
        else
            ntNotifications.setAttribute("start-padding", 45);

        ntNotifications.popup(message);
    },

    destroy: function() {
        ntNotifications.destroy(true, true);
    }
});

});
