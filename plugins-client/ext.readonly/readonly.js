/**
 * Displays the words "Read Only Mode" in the top IDE bar
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var menus = require("ext/menus/menus");

module.exports = ext.register("ext/readonly/readonly", {
    dev    : "Ajax.org",
    alone  : true,
    type   : ext.GENERAL,

    init : function(amlNode){
        // packager will always bundle this; but only turn it on if
        // we're actually need to be read-only
        if (ide.readonly === true) {
            menus.$insertByIndex(barTools, new apf.label({
                id       : "lblReadOnlyMode",
                caption  : "Read Only Mode",
                style    : "color: #fff49a",
                margin   : "0 0 0 50"
            }), 1000);

            ide.addEventListener("dockpanel.load.settings", function(e) {
                //console.log("dockpanel",e);
            });

            function disableDragDrop(tree) {
                tree.setAttribute("drag", false);
                tree.setAttribute("drop", false);
            }

            if (typeof trFiles != "undefined") {
                disableDragDrop(trFiles)
            }
            else {
                ide.addEventListener("init.ext/tree/tree", function() {
                    disableDragDrop(trFiles);
                });
            }

            // go through elements that need to be disabled:
            ide.addEventListener("init.ext/settings/settings", function(e) {
                // disable settings globally to be read-only...
                setTimeout(function() {
                    var heading = e.ext.getHeading("Code Editor");
                    heading && heading.disable();
                }, 500);
            });

            var capture = "undo|redo|cut|paste|quick watch";

            ide.addEventListener("init.ext/code/code", function(e) {
                var menu = mnuCtxEditor;
                menu.addEventListener("prop.visible", function() {
                    menu.removeEventListener("prop.visible", arguments.callee);
                    setTimeout(function() {
                        var items = menu.selectNodes("a:item");
                        for (var i = 0, l = items.length; i < l; ++i) {
                            if (capture.indexOf(items[i].caption.toLowerCase()) === -1)
                                continue;
                            items[i].disable();
                        }
                    });
                });
                setTimeout(function() {
                    e.ext.amlEditor.setAttribute("readonly", "true");
                }, 0);
            });

            function disableClipboard(clipboard) {
                for (var i = 0, l = clipboard.nodes.length; i < l; ++i) {
                    if (!clipboard.nodes[i].caption || capture.indexOf(clipboard.nodes[i].caption.toLowerCase()) === -1)
                        continue;
                    clipboard.nodes[i].disable();
                }
            }

            try {
                disableClipboard(require("ext/clipboard/clipboard"));
            }
            catch (ex) {
                ide.addEventListener("init.ext/clipboard/clipboard", function(e) {
                    disableClipboard(e.ext);
                });
            }

            function disableSave(save) {
                for (var i = 0, l = save.nodes.length; i < l; ++i) {
                    if (!save.nodes[i].caption || save.nodes[i].caption.indexOf("Save") === -1)
                        continue;
                    save.nodes[i].removeAttribute("disabled");
                    save.nodes[i].disable();
                }
            }

            try {
                disableSave(require("ext/save/save"));
            }
            catch (ex) {
                ide.addEventListener("init.ext/save/save", function(e) {
                    disableSave(e.ext);
                });
            }
        }
    }
});

});
