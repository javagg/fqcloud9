/**
 * Code completion for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */


define(function(require, exports, module) {

var ext = require("core/ext");
var language = require("ext/language/language");
var editors = require("ext/editors/editors");
var codecomplete = require("ext/language/complete");
var ide = require("core/ide");

language.enableContinuousCompletion = true;

module.exports = ext.register("ext/jsinfer/jsinfer", {
    name    : "Javascript Inference",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    deps    : [editors, language],
    nodes   : [],
    alone   : true,

    init : function() {
        language.registerLanguageHandler('ext/jsinfer/infer_completer');
        language.registerLanguageHandler('ext/jsinfer/infer_jumptodef');
        ide.addEventListener("afteropenfile", function setup(event){
            if (!event.node || !editors.currentEditor || editors.currentEditor.path !== "ext/code/code")
                return;
            //ext.setupAce();
            ide.removeEventListener("afteropenfile", setup);
        });
    },
    
    setupAce: function() {
        var editor = editors.currentEditor.amlEditor.$editor;
        var oldCommandKey = editor.keyBinding.onCommandKey;
        editor.keyBinding.onCommandKey = function(a0, keys, code) {
            oldCommandKey.apply(editor.keyBinding, arguments);
            if(keys === 0 && code === 190) { // .
                setTimeout(function() {
                    codecomplete.invoke(true);
                }, 0);
            }
        };
    }

});

});
