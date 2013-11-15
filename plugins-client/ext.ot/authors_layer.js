/*global define console document $ */

define(function(require, exports, module) {
"use strict";

var dom = require("ace/lib/dom");
var event = require("ace/lib/event");
var Range = require("ace/range").Range;
var utils = require("./utils");

var AuthorAttributes = require("./author_attributes")();

var enabled = true;

function Authors(WS, session, doc) {

    var marker = { update: drawAuthInfos };
    session.addDynamicMarker(marker, false);
    refresh();

    function drawAuthInfos(html, markerLayer, session, config) {
        if (!enabled || !isRealCollab(WS))
            return;

        var editorDoc = session.doc;
        var colorPool = WS.colorPool;
        var reversedAuthorPool = utils.reverseObject(WS.authorPool);

        var firstRow = config.firstRow;
        var lastRow = config.lastRow;

        var range = new Range(firstRow, 0, lastRow, editorDoc.getLine(lastRow).length);

        var cache = createAuthorKeyCache(editorDoc, doc.authAttribs, range);
        var authKeyCache = cache.authorKeys;
        var rowScores = cache.rowScores;

        var fold = session.getNextFoldLine(firstRow);
        var foldStart = fold ? fold.start.row : Infinity;

        for (var i = firstRow; i < lastRow; i++) {
            if(i > foldStart) {
                i = fold.end.row + 1;
                fold = session.getNextFoldLine(i, fold);
                foldStart = fold ?fold.start.row :Infinity;
            }
            if(i > lastRow)
                break;

            if (!authKeyCache[i] || !rowScores[i])
                continue;

            var rowScore = rowScores[i];
            for (var authVal in rowScore) {
                if (authVal == authKeyCache[i])
                    continue;
                var edits = rowScore[authVal].edits;
                for (var j = 0; j < edits.length; j++) {
                    var edit = edits[j];
                    var uid = reversedAuthorPool[authVal];
                    var bgColor = colorPool[uid];
                    var extraStyle = "position:absolute;border-bottom:solid 2px " + utils.formatColor(bgColor) + ";z-index: 2000";
                    var startPos = session.documentToScreenPosition(edit.pos);
                    markerLayer.drawSingleLineMarker(html,
                        new Range(startPos.row, startPos.column, startPos.row, startPos.column + edit.length),
                        "", config, 0, extraStyle);
                }
            }
        }
    }

    function updateGutter(config) {
        var _self = this;
        var emptyAnno = {className: ""};
        var html = [];
        var i = config.firstRow;
        var lastRow = config.lastRow;
        var fold = _self.session.getNextFoldLine(i);
        var foldStart = fold ? fold.start.row : Infinity;
        var foldWidgets = _self.$showFoldWidgets && _self.session.foldWidgets;
        var breakpoints = _self.session.$breakpoints;
        var decorations = _self.session.$decorations;
        var firstLineNumber = _self.session.$firstLineNumber;
        var lastLineNumber = 0;

        var editorDoc = _self.session.doc;
        var range = new Range(i, 0, lastRow, editorDoc.getLine(lastRow).length);
        var authorKeysCache = createAuthorKeyCache(editorDoc, doc.authAttribs, range).authorKeys;

        var colorPool = WS.colorPool;
        var reversedAuthorPool = utils.reverseObject(WS.authorPool);

        while (true) {
            if(i > foldStart) {
                i = fold.end.row + 1;
                fold = _self.session.getNextFoldLine(i, fold);
                foldStart = fold ?fold.start.row :Infinity;
            }
            if(i > lastRow)
                break;

            var annotation = _self.$annotations[i] || emptyAnno;

            if (enabled && isRealCollab(WS)) {
                var authorKey = authorKeysCache[i];
                var authorColor = "transparent";
                var fullname = null;
                if (authorKey) {
                    var uid = reversedAuthorPool[authorKey];
                    authorColor = utils.formatColor(colorPool[uid]);
                    fullname = WS.users[uid].fullname;
                }
                html.push(
                    "<div class='ace_gutter-cell", fullname && " ace_author-cell",
                    breakpoints[i] || "", decorations[i] || "", annotation.className,
                    "' style='height:", _self.session.getRowLength(i) * config.lineHeight, "px;",
                    "border-left: solid 5px ", authorColor, ";'",
                    "fullname='" + fullname + "'", ">",
                    lastLineNumber = i + firstLineNumber
                );
            } else {
                html.push(
                    "<div class='ace_gutter-cell",
                    breakpoints[i] || "", decorations[i] || "", annotation.className,
                    "' style='height:", _self.session.getRowLength(i) * config.lineHeight, "px;'>",
                    lastLineNumber = i + firstLineNumber
                );
            }

            if (foldWidgets) {
                var c = foldWidgets[i];
                // check if cached value is invalidated and we need to recompute
                if (c == null)
                    c = foldWidgets[i] = _self.session.getFoldWidget(i);
                if (c)
                    html.push(
                        "<span class='ace_fold-widget ace_", c,
                        c == "start" && i == foldStart && i < fold.end.row ? " ace_closed" : " ace_open",
                        "' style='height:", config.lineHeight, "px",
                        "'></span>"
                    );
            }
            html.push("</div>");
            i++;
        }

        _self.element = dom.setInnerHtml(_self.element, html.join(""));
        _self.element.style.height = config.minHeight + "px";

        if (_self.session.$useWrapMode)
            lastLineNumber = _self.session.getLength();

        var gutterWidth = ("" + lastLineNumber).length * config.characterWidth;
        var padding = _self.$padding || _self.$computePadding();
        gutterWidth += padding.left + padding.right;
        if (gutterWidth !== _self.gutterWidth) {
            _self.gutterWidth = gutterWidth;
            _self.element.style.width = Math.ceil(_self.gutterWidth) + "px";
            _self._emit("changeGutterWidth", gutterWidth);
        }
    }

    function refresh() {
        if (!WS.editor || WS.editor.session !== session)
            return;
        var editor = WS.editor;
        session._emit("changeBackMarker");
        var gutter = editor.renderer.$gutterLayer;
        gutter.update = updateGutter;
        gutter.update(editor.renderer.layerConfig);
    }

    function dispose () {
        session.removeMarker(marker.id);
    }

    this.dispose = dispose;
    this.refresh = refresh;
}

var inited = false;

function initGutterEvents(WS) {
    if (inited)
        return refresh();
    inited = true;
    var editor = WS.editor;

    function refresh() {
        var collabDoc = editor && editor.session && editor.session.collabDoc;
        if (collabDoc && collabDoc.isInited)
            collabDoc.authorLayer.refresh();
    }

    var highlightedCell;

    var tooltip = editor.tooltip = dom.createElement("div");
    tooltip.className = "ace_gutter-tooltip";
    tooltip.style.display = "none";
    editor.container.appendChild(tooltip);

    editor.on("changeSession", refresh);

    function onGutterMouseout(e) {
        tooltip.style.display = "none";
        highlightedCell = null;
    }

    var gutterEl = editor.renderer.$gutter;
    // var gutterEl = editor.renderer.$gutterLayer.element;
    // event.addListener(gutterEl, "mousemove", onMousemove);
    event.addListener(gutterEl, "mouseout", onGutterMouseout);

    editor.on("guttermousemove", function onGutterMouseMove(e) {
        if (!enabled || !isRealCollab(WS))
            return;
        var target = e.domEvent.target;

        if (highlightedCell != target) {
            if (dom.hasCssClass(target, "ace_author-cell")) {
                tooltip.style.display = "block";
                highlightedCell = target;
                tooltip.textContent = target.getAttribute("fullname");
            }
        }
        if (highlightedCell) {
            tooltip.style.top = e.clientY - 15 + "px";
            tooltip.style.left = e.clientX + 5 + "px";
        } else {
            onGutterMouseout();
        }
    });

    var mousePos;
    editor.addEventListener("mousemove", function(e) {
        if (!enabled || !isRealCollab(WS))
            return;
        mousePos = {x: e.x, y: e.y};
        if (!editor.authorTooltipTimeout)
            editor.authorTooltipTimeout = setTimeout(updateTooltip, tooltip.style.display === "block" ? 100 : 300);
    });
    editor.renderer.container.addEventListener("mouseout", function(e) {
        tooltip.style.display = "none";
    });

    function updateTooltip() {
        delete editor.authorTooltipTimeout;
        var session = editor.session;
        var collabDoc = session.collabDoc;
        if (!collabDoc || !collabDoc.ot.otDoc)
            return;

        var editorDoc = session.doc;
        var otDoc = collabDoc.ot.otDoc;
        var authAttribs = otDoc.authAttribs;

        var screenPos = editor.renderer.pixelToScreenCoordinates(mousePos.x, mousePos.y);
        var docPos = session.screenToDocumentPosition(screenPos.row, screenPos.column);
        var line = editorDoc.getLine(docPos.row);

        var hoverIndex = editorDoc.positionToIndex({row: docPos.row, column: docPos.column});
        var authorKey = AuthorAttributes.valueAtIndex(authAttribs, hoverIndex);

        // ignore newline tooltip and out of text hovering
        if (!authorKey || line.length <= screenPos.column || editorDoc.$lines.length < screenPos.row)
            return tooltip.style.display = "none";
        var lineOwnerKey = getLineAuthorKey(session, otDoc, docPos.row);
        if (!lineOwnerKey || lineOwnerKey === authorKey)
            return tooltip.style.display = "none";

        var reversedAuthorPool = utils.reverseObject(WS.authorPool);
        var uid = reversedAuthorPool[authorKey];
        var fullname = WS.users[uid].fullname;

        tooltip.style.display = "block";
        tooltip.textContent = fullname;
        tooltip.style.top = mousePos.y + 10 + "px";
        tooltip.style.left = mousePos.x + 10 + "px";
    }

    editor.addEventListener("mousewheel", function documentScroll() {
        clearTimeout(editor.authorTooltipTimeout);
        delete editor.authorTooltipTimeout;
        tooltip.style.display = "none";
    });
}

function createAuthorKeyCache (editorDoc, authAttribs, range) {
    var startI = editorDoc.positionToIndex(range.start);
    var endI = editorDoc.positionToIndex(range.end);

    var authKeyCache = {};
    var rowScores = {};
    var lastPos = range.start;

    function processScore(index, length, value) {
        var line = editorDoc.getLine(lastPos.row);
        var rowScore = rowScores[lastPos.row] = rowScores[lastPos.row] || {};
        var score = Math.min(line.length - lastPos.column, length);
        var scoreObj = rowScore[value] = rowScore[value] || {edits: [], score: 0};
        scoreObj.edits.push({pos: lastPos, length: score});
        scoreObj.score += score;
         var pos = editorDoc.indexToPosition(index + length);
        if (lastPos.row !== pos.row) {
            if (value) {
                for (var i = lastPos.row + 1; i < pos.row; i++)
                    authKeyCache[i] = value;
            }
            line = editorDoc.getLine(pos.row);
            rowScore = rowScores[pos.row] = rowScores[pos.row] || {};
            score = pos.column;
            scoreObj = rowScore[value] = rowScore[value] || {edits: [], score: 0};
            scoreObj.edits.push({pos: pos, length: score});
            scoreObj.score += score;
        }
        lastPos = pos;
    }
    AuthorAttributes.traverse(authAttribs, startI, endI, processScore);

    for (var rowNum in rowScores) {
        var rowScore = rowScores[rowNum];
        delete rowScore[null];
        delete rowScore[undefined];
        delete rowScore[0];
        var authorKeys = Object.keys(rowScore);

        if (authorKeys.length === 0) {
            delete rowScores[rowNum];
            // authKeyCache[rowNum] = null;
        }
        else if (authorKeys.length === 1) {
            authKeyCache[rowNum] = parseInt(authorKeys[0], 10);
        }
        else {
            var biggestScore = 0;
            var authKey;
            for (var key in rowScore) {
                if (rowScore[key].score > biggestScore) {
                    biggestScore = rowScore[key].score;
                    authKey = key;
                }
            }
            authKeyCache[rowNum] = parseInt(authKey, 10);
        }
    }

    return {
        authorKeys: authKeyCache,
        rowScores: rowScores
    };
}

function getLineAuthorKey(session, otDoc, row) {
    var editorDoc = session.doc;
    var authAttribs = otDoc.authAttribs;

    var line = editorDoc.getLine(row);
    var lineStart = editorDoc.positionToIndex({row: row, column: 0}) - 1;
    var lineEnd = lineStart + line.length + 1;
    var scores = {};
    AuthorAttributes.traverse(authAttribs, lineStart, lineEnd, function (index, length, value) {
        if (value)
            scores[value] = (scores[value] || 0) + length;
    });

    var authorKeys = Object.keys(scores);

    if (authorKeys.length === 0)
        return null;

    if (authorKeys.length === 1)
        return parseInt(authorKeys[0], 10);

    var biggestScore = 0;
    var authorKey;
    for (var key in scores) {
        if (scores[key] > biggestScore) {
            biggestScore = scores[key];
            authorKey = key;
        }
    }

    return parseInt(authorKey, 10);
}

function isRealCollab(WS) {
    return Object.keys(WS.users).length > 1;
}

exports = module.exports = Authors;
exports.initGutterEvents = initGutterEvents;

exports.setEnabled = function(newEnabled) {
    enabled = newEnabled;
};


});
