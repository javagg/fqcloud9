/**
 * Cloud9 LogiQL support
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var ext = require("core/ext");
var editors = require("ext/editors/editors");
var language = require("ext/language/language");

// TODO: configurable server, workspace
const CONNECTBLOX_URL = "http://lennart.c9.io:8080/connectblox";
const WORKSPACE = "awesomedb";

module.exports = ext.register("ext/logiql/logiql", {
    name    : "LogiQL Language Support",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    deps    : [editors, language],
    alone   : true,

    init : function() {
        language.registerLanguageHandler('ext/logiql/logiql_handler', null, function() {
            language.worker.emit("configureLB", { data: {
                url: CONNECTBLOX_URL,
                workspace: WORKSPACE
            }});
        });
    }
});

});
