/**
 * LogiQL language handler.
 */
define(function(require, exports, module) {

var baseLanguageHandler = require('ext/language/base_handler');
var completeUtil = require("ext/codecomplete/complete_util");
var handler = module.exports = Object.create(baseLanguageHandler);

var isFetchStarted = false;
var predicates = [];
var onAnalyzed;
var connectBloxUrl;
var workspace;

/**
 * Known derivation types
 */
const DERIVATION_TYPE = {
    NOT_DERIVED: {
        icon: "method",
        name: "stored"
    },
    DERIVED_AND_STORED: {
        icon: "property",
        name: "derived and stored"
    },
    DERIVED: {
        icon: "property",
        name: "derived"
    },
    UNKNOWN: {
        icon: "method"
    }
};

const ID_REGEX = /[a-zA-Z_0-9\$:]/;
const COMPLETION_REGEX = /[:\(]/;
const DEFAULT_PRIORITY = 5;

handler.init = function(callback) {
    this.sender.on("configureLB", function(e) {
        connectBloxUrl = e.data.url;
        workspace = e.data.workspace;
        try {
            if (callback)
                callback();
        }
        finally {
            callback = null;
        }
    });
};

handler.handlesLanguage = function(language) {
    return language === "logiql";
};

handler.getIdentifierRegex = function() {
    return ID_REGEX;
};

handler.getCompletionRegex = function() {
    return COMPLETION_REGEX;
};

handler.complete = function(doc, fullAst, pos, currentNode, callback) {
    var line = doc.getLine(pos.row);
    var identifier = completeUtil.retrievePrecedingIdentifier(line, pos.column, ID_REGEX);
    if (!predicates) {
        onAnalyzed = this.$completeUpdate.bind(null, pos);
    }
    var myPredicates = predicates.filter(function(p) {
        if (!p.replaceText || p.replaceText.indexOf(identifier) !== 0)
            return false;
        return true;
    }).map(function(p) {
        var colon = p.replaceText.indexOf(":", identifier.length);
        if (colon === -1 || colon === identifier.length)
            return p;
        
        return {
            id              : p.replaceText.substr(0, colon),
            name            : p.replaceText.substr(0, colon),
            replaceText     : p.replaceText.substr(0, colon),
            doc             : "Package",
            icon            : "package",
            priority        : p.priority,
            identifierRegex : p.identifierRegex
        };
    });
    try { // HACK: defensive programming; this feature is a bonus
        var args = this.completePredicateArguments(doc, fullAst, pos);
    } catch (e) {
        console.log(e);
        args = [];
    }
    callback(myPredicates.concat(args));
};

handler.completePredicateArguments = function(doc, fullAst, pos) {
    var line = doc.getLine(pos.row);
    var identifier = completeUtil.retrievePrecedingIdentifier(line, pos.column, ID_REGEX);
    var prevDot = findPrev(doc, pos, ".");
    var nextDot = findNext(doc, pos, ".");
    var lines = getLinesBetween(doc, prevDot, nextDot).join("\n");
    var args = [];
    lines.replace(
        new RegExp(
            "\\(\\s*([A-Za-z0-9]*[,:]\\s*)*([A-Za-z0-9]*)\\s*\\)" + "|" +
            "\\[\\s*([A-Za-z0-9]*[,:]\\s*)*([A-Za-z0-9]*)\\s*\\]", "g"),
        function(argsString) {
            argsString = argsString.substr(1, argsString.length - 2);
            argsString.split(/[:,]/).forEach(function(arg) {
                args.push(arg.trim());
            });
            return argsString;
        });
    var seenIdentifier = false;
    return args.filter(function(arg) {
        if (!arg || arg.indexOf(identifier) !== 0)
            return false;
        if (arg === identifier && !seenIdentifier) {
            seenIdentifier = true;
            return false;
        }
        return true;
    }).map(function(arg) {
        return {
            id              : arg,
            name            : arg + " ", // make unique
            replaceText     : arg,
            doc             : null,
            icon            : "property2",
            priority        : DEFAULT_PRIORITY,
            identifierRegex : ID_REGEX
        };
    });
};

function findPrev(doc, pos, text) {
    var firstLine = true;
    for (var row = pos.row; row >= 0; row--) {
        var line = doc.getLine(row);
        var column;
        if (firstLine) {
            firstLine = false;
            column = pos.column;
        }
        else {
            column = line.length;
        }
        var lastDot = line.lastIndexOf(text, column - 1);
        if (lastDot != -1)
            break;
    }
    return { row: row === -1 ? 0 : row, column: row === -1 ? 0 : column };
}

function findNext(doc, pos, text) {
    var firstLine = true;
    for (var row = pos.row; row < doc.getLength(); row++) {
        var line = doc.getLine(row);
        var column;
        if (firstLine) {
            firstLine = false;
            column = pos.column;
        }
        else {
            column = 0;
        }
        var lastDot = line.indexOf(text, column);
        if (lastDot != -1)
            break;
    }
    return { row: row === doc.getLength() ? row - 1 : row, column: column === -1 ? 0 : column };
}

function getLinesBetween(doc, pos1, pos2) {
    var lines = [];
    for (var i = pos1.row; i <= pos2.row; i++) {
        var line = doc.getLine(i);
        if (i === pos1.row && i == pos2.row)
            line = line.substring(pos1.column + 1, pos2.column + 1);
        else if (i === pos1.row)
            line = line.substr(pos1.column + 1);
        else if (i === pos2.row)
            line = line.substr(0, pos2.column + 1);
        lines.push(line);
    }
    return lines;
}

handler.analyze = function(value, ast, callback) {
    if (!isFetchStarted) {
        isFetchStarted = true;
        this.fetchPredicates();
    }
    callback();
};

// TODO: complete predicate arguments smartly

handler.fetchPredicates = function() {
    var _self = this;
    
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            var result;
            if (xhr.status !== 200) {
                console.error("Could not connect to server, using dummy data instead", xhr.status);
                result = completeUtil.fetchText("static", "ext/logiql/example.json");
            }
            else {
                result = xhr.responseText;
            }
            try {
                var json = JSON.parse(result);
                _self.parsePredicates(json);
            } catch (e) {
                console.error("Could not parse LogiQL predicates", e);
                throw e;
            }
        }
    };
    xhr.open('POST', connectBloxUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send('{"transaction": {"workspace": "' + workspace + '", "command": [{"pred_info_bulk": {}}]}}');
};

handler.parsePredicates = function(json) {
    var _self = this;
    json = json.transaction.command[0].pred_info_bulk.info;
    predicates = json.map(function(entry) {
        var derivationType = DERIVATION_TYPE[entry.derivation_type];
        return  {
            id              : entry.qualified_name,
            name            : entry.qualified_name,
            replaceText     : entry.qualified_name + "(^^)",
            doc             : entry.name + "(" + _self.parsePredicateArguments(entry) + ")" +
                              "<br /><br />" + (derivationType ? "Type: " + derivationType.name : ""),
            icon            : derivationType ? derivationType.icon : DERIVATION_TYPE.UNKNOWN.icon,
            priority        : DEFAULT_PRIORITY,
            identifierRegex : ID_REGEX
        };
    }).sort(function(a, b) {
        return a.name < b.name ? -1 : 1;
    });
    if (onAnalyzed)
        onAnalyzed();
};

handler.parsePredicateArguments = function(json) {
    var result = "";
    if (json.key_argument)
        result += json.key_argument.join(", ") + (json.value_argument ? ":" : "");
    if (json.value_argument)
        result += json.value_argument.join(", ");
    return result;
};

handler.getVariablePositions = function(doc, fullAst, cursorPos, currentNode, callback) {
    callback();
};

});
