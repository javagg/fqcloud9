/**
 * Inference-based JavaScript jump to definition.
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var baseLanguageHandler = require('ext/language/base_handler');
var handler = module.exports = Object.create(baseLanguageHandler);
var infer = require("ext/jsinfer/infer");
var path = require("ext/jsinfer/path");

handler.handlesLanguage = function(language) {
    return language === 'javascript';
};

handler.jumpToDefinition = function(doc, fullAst, pos, currentNode, callback) {
    if (!fullAst)
        return callback();
    
    var results = [];
    var basePath = path.getBasePath(handler.path, handler.workspaceDir);
    var filePath = path.canonicalizePath(handler.path, basePath);
    
    infer.analyze(doc, fullAst, filePath, basePath, function() {
        currentNode.rewrite(
            'PropAccess(o, p)', function(b, node) {
                var values = infer.inferValues(b.o);
                values.forEach(function(v) {
                    jumpToProperty(v, b.p.value, results);
                });
            },
            'Var(v)', function(b, node) {
                jumpToVar(node, results);
            },
            'Call(Var("require"), [String(_)])', function(b, node) {
                jumpToRequire(node, results);
            },
            'Var("require")', function(b, node) {
                if (node.parent &&
                    node.parent.isMatch('Call(Var("require"), [_])'))
                jumpToRequire(node.parent, results);
            },
            'String(_)', function(b, node) {
                if (node.parent && node.parent.parent &&
                    node.parent.parent.isMatch('Call(Var("require"), [_])'))
                jumpToRequire(node.parent.parent, results);
            }
        );
    });
        
    callback(results);
};

var jumpToRequire = function(node, results) {
    var values = infer.inferValues(node);
    values.forEach(function(v) {
        if (v.path)
            results.push({ path: v.path, row: v.row });
    });
}

var jumpToProperty = module.exports.jumpToProperty = function(value, property, results) {
    var prop = value.properties && value.properties["_" + property];
    if (prop && prop[0])
        prop = prop[0];
    if (!prop || (!value.path && !prop.path && !prop.row))
        return;
    results.push({ row: prop.row, column: prop.column, path: prop.path || value.path });
};

var jumpToVar = function(node, results) {
    var values = infer.inferValues(node);
    values.forEach(function(v) {
        if (!v.path && !v.row)
            return;
        results.push({ row: v.row, path: v.path });
    });
};

});

