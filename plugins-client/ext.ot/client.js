/*global define console setTimeout $ global window*/
"use strict";
define(function(require, exports, module) {

var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
var lang = require("ace/lib/lang");
var Range = require("ace/range").Range;

var Chat = require("./chat");
var xform = require("./xform");
var operations = require("./operations");
var timeslider = require("./timeslider");
var Cursors = require("./cursors");
var AuthorLayer = require("./authors_layer");
var apply = require("./apply");
var utils = require("./utils");

var IndexCache = require("./index_cache");

var applyContents = apply.applyContents;
var applyAce = apply.applyAce;

var applyAuthorAttributes = require("./author_attributes")().apply;

function noop(){}

var CLI = function() {};
CLI.prototype = EventEmitter;
exports = module.exports = new CLI();

// 0 - production
// 1 - development
// 2 - tracing
var DEBUG = 0;
if (typeof global !== "undefined" && typeof global.DEBUG !== "undefined") // node
    DEBUG = global.DEBUG;
else if (typeof window !== "undefined") // browser
    DEBUG = Number((/debug=(\d)/.exec(window.location.search) || [null, DEBUG])[1]);

var CONNECT_TIMEOUT = 30000;

var Socket;
var Docs = {};
var connected = false;
var connecting = false;
var connectTimeout;

var WS = {authorPool: {}, colorPool: {}, users: {}};

function cloneObject(obj) {
    if (obj === null || typeof obj !== "object")
        return obj;
    var copy, k;
    copy = obj instanceof Array ? [] : {};
    for (k in obj)
        if (obj.hasOwnProperty(k))
            copy[k] = cloneObject(obj[k]);
    return copy;
}

function sendJSON(type, data) {
    var msg = {
        command: "vfs-collab",
        type: type,
        data: data
    };
    if (!Socket.connected)
        return console.log("[OT] Socket not connected - SKIPPING ", cloneObject(msg));
    if (DEBUG)
        console.log("[OT] SENDING TO SERVER", cloneObject(msg));
    (Socket.json || Socket).send(msg);
}

exports.sendJSON = sendJSON;

function onDisconnect() {
    if (!connected)
        return console.error("[OT] Already disconnected !!");
    var pendingDocIds = [];
    Object.keys(Docs).forEach(function(docId) {
        var doc = Docs[docId];
        doc.isInited = false;
        pendingDocIds.push(doc.id);
    });
    connected = connecting = false;
    clearTimeout(connectTimeout);
    exports._emit("disconnect", { pending: pendingDocIds });
}

exports.onDisconnect = onDisconnect;

function onConnected(msg) {
    if (connected)
        return console.error("[OT] Already connected !!");

    connected = true;
    connecting = false;
    clearTimeout(connectTimeout);
    if (WS.myClientId !== msg.data.myClientId)
        WS.myOldClientId = WS.myClientId;
    else
        WS.myOldClientId = null;
    syncWS(msg.data);

    for (var docId in Docs)
        sendJSON("JOIN_DOC", { docId: docId });

    Chat.init(WS, Socket);

    exports._emit("notification", msg);
    exports._emit("event", {name: "collab.usersUpdate"});
}

function syncWS(data) {
    var wsIgnore = {clientId: true, userId: true};
    for (var key in data)
        if (!wsIgnore[key])
            WS[key] = data[key];
}

exports.onMessage = function(msg) {
    msg = msg.message;

    if (msg.command != "vfs-collab")
        return;

    if (DEBUG)
        console.log("[OT] RECEIVED FROM SERVER", msg);

    var data = msg.data || {};
    var type = msg.type;
    var docId = data.docId;
    var doc = Docs[docId];

    if (!connected && type.indexOf("CONNECT") === -1)
        return console.warn("[OT] Not connected - ignoring:", msg);

    if (data.clientId && data.clientId === WS.myOldClientId)
        return console.warn("[OT] Skipping my own 'away' disconnection notifications");

    switch (type){
        case "CONNECT":
            onConnected(msg);
            break;
        case "DISCONNECT":
            onDisconnect();
            break;
        case "RECONNECT":
            sendJSON("CONNECT", {});
            break;
        case "CHAT_MESSAGE":
            Chat.addMessage(data, true);
            break;
        case "USER_JOIN":
            syncWS(data);
            exports._emit("event", {name: "collab.usersUpdate"});
            exports._emit("notification", msg);
            break;
        case "USER_LEAVE":
            exports._emit("notification", msg);
            break;
        case "LEAVE_DOC":
            doc && doc.ot.leaveDoc(data.clientId);
            exports._emit("notification", msg);
            break;
        case "JOIN_DOC":
            if (WS.myClientId !== data.clientId)
                return exports._emit("notification", msg);

            if (data.err)
                return exports._emit("docloaded", { doc: doc, err: data.err });

            if (doc && !doc.isInited)
                doc.ot.init(data) && loadDoc(doc);
            break;
        default:
            if (!doc)
                return console.error("[OT] Received msg for unknown docId", docId, msg);
            if (doc.isInited)
                doc.ot.handleDocMsg(msg);
            else
                console.warn("[OT] Doc ", docId, " not yet inited - MSG:", msg);
    }
};

function loadDoc(doc) {
    var c9doc = doc.session.c9doc;
    if (c9doc && c9doc.addEventListener) {
        c9doc.addEventListener("close", function onClose() {
            exports.leaveDoc(doc.id);
            delete Docs[doc.id];
            c9doc.removeEventListener("close", onClose);
        });
    }

    doc.cursors = doc.ot.cursors;
    doc.authorLayer = doc.ot.authorLayer;
    doc.isInited = true;

    exports._emit("docloaded", {
        doc: doc
    });
}

exports.getUser = function (uid) {
    return uid && WS && WS.users[uid];
};

exports.getUserColor = function (uid) {
    return (uid && WS && utils.formatColor(WS.colorPool[uid])) || "transparent";
};

exports.onConnect = function(client) {
    Socket = client;
    if (connecting)
        return;
    if (connected)
        onDisconnect();
    connecting = true;

    connectTimeout = setTimeout(function(){
        connecting = false;
        if (!connected) {
            console.warn("[OT] Collab connect timed out ! - retrying ...");
            sendJSON("CONNECT", {});
        }
    }, CONNECT_TIMEOUT);

    exports._emit("notification", {type: "CONNECTING"});
    sendJSON("CONNECT", {});
};

exports.joinDoc = function(docId, doc, session, state) {
    if (Docs[docId] && Docs[docId].isInited) {
        console.warn("[OT] Doc already inited...");
        return loadDoc(Docs[docId]);
    }

    var aceEditor = doc.editor.amlEditor.$editor;
    WS.editor = aceEditor;

    Cursors.initTooltipEvents(WS);
    AuthorLayer.initGutterEvents(WS);

    var ui = {
        canEdit: function() {
            return !aceEditor.getReadOnly();
        }
    };

    var otDoc = new OTDocument(session, ui);
    otDoc.setState = state.setState;
    otDoc.getState = state.getState;
    var o = Docs[docId] || (Docs[docId] = {
        id: docId,
        original: doc,
        session: session,
        ot: otDoc,
        state: state,
        isInited: false
    });

    session.collabDoc = o;

    // test late join - document syncing - best effort
    if (connected)
        sendJSON("JOIN_DOC", { docId: docId });

    return o;
};

exports.leaveDoc = function(docId) {
    if (!docId || !Docs[docId] || !exports.isConnected())
        return;

    console.log("[OT] Leave", docId);

    sendJSON("LEAVE_DOC", { docId: docId });

    var otDoc = Docs[docId].ot;
    otDoc.dispose();

    if (activeOT === otDoc)
        activeOT = null;

    delete Docs[docId];
};

exports.leaveAll = function() {
    Object.keys(Docs).forEach(function(docId) {
        exports.leaveDoc(docId);
    });
};

exports.isConnected = function(docId) {
    if (!docId)
        return connected;
    // so the documents should be cleared out on a disconnect anyway,
    // but this is a case of 'better safe than sorry'...
    return !! (connected && (Docs[docId] && Docs[docId].isInited));
};

exports.getDoc = function(docId) {
    return Docs[docId] || null;
};

exports.getAllDocs = function() {
    return Docs;
};

/*
exports.getDocsWithinPath = function(path) {
    var docIds = Object.keys(Docs);
    var docs = [];
    var i, l, doc;
    for (i = 0, l = docIds.length; i < l; ++i) {
        doc = Docs[docIds[i]];
        if (doc.id.indexOf(path) === 0)
            docs.push(doc);
    }
    return docs;
};
*/


function xformEach(outgoing, inMsg) {
    var ops = inMsg.op;
    var msg;

    function k(aPrime, bPrime) {
        msg.op = aPrime;
        ops = bPrime;
    }

    for (var i = 0, len = outgoing.length; i < len; i++) {
        msg = outgoing[i];
        var oldOps = ops;
        var oldMsgOp = msg.op;
        xform(msg.op, ops, k);
        // if (DEBUG > 1) {
        //     xform_old(oldMsgOp, oldOps, function (aPrime, bPrime) {
        //          if (msg.op.join("_") !== aPrime.join("_") ||
        //             ops.join("_") !== bPrime.join("_")) {
        //             console.error("[OT] xform inconsistency !!");
        //             debugger;
        //         }
        //     });
        // }
    }
    inMsg.op = ops;
}

// Might need to start sending client id's back and forth. Don't really want
// to have to do a deep equality test on every check here.
function isOurOutgoing(msg, top) {
    return !msg.op &&
        // msg.clientId === WS.myClientId && ---> break tests
        msg.docId === top.docId &&
        msg.revNum === top.revNum;
}

var activeOT;

exports.setActiveDoc = function(otDoc) {
    activeOT = otDoc;
    if (timeslider.isVisible())
        otDoc.loadTimeslider();
};

function OTDocument(session, ui) {
    var _self = this;

    // Set if the file was loaded using an http request
    this.fsContents = null;
    this.getState = noop;
    this.setState = noop;

    var docStream;
    var doc;
    var docId;
    var cursors;
    var authorLayer;

    var rev0Cache;
    var revCache;

    var latestRevNum;
    var lastSel;
    var sendTimer;
    var cursorTimer;

    var outgoing = [];
    var incoming = [];
    var inited = false;
    var ignoreChanges = false;
    var packedCs = [];

    IndexCache(session.doc);

    session.doc.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            var delta = deltas[i];
            this.fromDelta = delta;
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
        this.fromDelta = null;
    };

    session.doc.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            var delta = deltas[i];
            this.fromDelta = delta;
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this._insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
        this.fromDelta = null;
    };
    
    session.on("change", handleUserChanges);
    session.selection.addEventListener("changeCursor", onCursorChange);
    session.selection.addEventListener("changeSelection", onCursorChange);
    session.selection.addEventListener("addRange", onCursorChange);
    // needed to provide immediate feedback for remote selection changes caused by local edits
    session.on("change", function(e) { session._emit("changeBackMarker"); });

    var state = "IDLE";

    function handleUserChanges (e) {
        if (!inited || ignoreChanges || !ui.canEdit())
            return;
        try {
            var aceDoc = session.doc;
            packedCs = handleUserChanges2(aceDoc, packedCs, e.data);
            scheduleSend();
        } catch(e) {
            console.error("[OT] handleUserChanges", e);
        }
    }

    function handleUserChanges2 (aceDoc, packedCs, data) {
        packedCs = packedCs.slice();
        var nlCh = aceDoc.getNewLineCharacter();
        var startOff = aceDoc.positionToIndex(data.range.start);

        var offset = startOff, opOff = 0;
        var op = packedCs[opOff];
        while (op) {
            if (operations.type(op) === "delete")
                ; // process next op
            else if (offset < operations.length(op))
                break;
            else
                offset -= operations.length(op);
            op = packedCs[++opOff];
        }

        if (offset !== 0) {
            var splitted = operations.split(op, offset);
            packedCs.splice(opOff, 1, splitted[0], splitted[1]);
            opOff++;
        }

        var authorI;

        if (data.action === "insertText" || data.action === "insertLines") {
            var newText = data.text || (data.lines.join(nlCh) + nlCh);

            /*if (aceDoc.fromDelta && aceDoc.fromDelta.authAttribs) {
                var undoAuthAttribs = aceDoc.fromDelta.authAttribs;
                var reversedAuthorPool = utils.reverseObject(WS.authorPool);

                var i = 0;
                while (i < undoAuthAttribs.length) {
                    var startI = i;
                    authorI = undoAuthAttribs[i++];
                    while (authorI === undoAuthAttribs[i])
                        i++;
                    outgoing.push({
                        docId: docId,
                        op: ["r" + (startOff + startI), "i" + newText.substring(startI, i)],
                        author: reversedAuthorPool[authorI] || -2
                    });
                }
                doc.authAttribs.splice.apply(doc.authAttribs, [startOff, 0].concat(undoAuthAttribs));
            } else {*/
                // Manage coloring my own edits
                authorI = WS.authorPool[WS.myUserId];
                packedCs.splice(opOff, 0, "i" + newText);
                applyAuthorAttributes(doc.authAttribs, ["r" + startOff, "i" + newText], authorI);
            //}
        }

        else if (data.action === "removeText" || data.action === "removeLines") {
            var removedText = data.text || (data.lines.join(nlCh) + nlCh);
            var remainingText = removedText;
            var opIdx = opOff;
            var nextOp = packedCs[opIdx];
            while (remainingText.length) {
                var opLen = operations.length(nextOp);
                var toRem = Math.min(remainingText.length, opLen);
                switch(operations.type(nextOp)) {
                case "retain":
                    packedCs[opIdx] = "d" + remainingText.substring(0, toRem);
                    if (opLen > remainingText.length)
                        packedCs.splice(opIdx + 1, 0, "r" + (opLen - remainingText.length));
                    remainingText = remainingText.substring(toRem);
                    opIdx++;
                    break;
                case "insert":
                    packedCs.splice(opIdx, 1);
                    if (opLen > remainingText.length)
                        packedCs.splice(opIdx, 0, operations.split(nextOp, toRem)[1]);
                    remainingText = remainingText.substring(toRem);
                    break;
                case "delete":
                    opIdx++;
                    break;
                }
                nextOp = packedCs[opIdx];
            }

            // data.authAttribs = doc.authAttribs.slice(startOff, startOff + removedText.length);
            applyAuthorAttributes(doc.authAttribs, ["r" + startOff, "d" + removedText], authorI);
        }
        return operations.pack(packedCs);
    }

    function changedSelection() {
        var sel = session.selection;
        var msg = {
            docId: docId,
            selection: Cursors.selectionToData(sel)
        };
        lastSel = msg.selection;
        _self.sendJSON("CURSOR_UPDATE", msg);
        cursorTimer = null;
        if (cursors && cursors.tooltipIsOpen)
            cursors.hideAllTooltips();
    }

    function onCursorChange() {
        if (!inited || ignoreChanges)
            return;
        var sel = session.selection;
        if (cursorTimer ||
            (lastSel && lastSel.join('') === Cursors.selectionToData(sel).join('')))
            return;
        // Don't send too many cursor change messages
        cursorTimer = setTimeout(changedSelection, 500);
    }

    function scheduleSend() {
        if (sendTimer)
            return;
        sendTimer = setTimeout(function () {
            send();
            sendTimer = null;
        }, 5);
    }

    function addOutgoingEdit() {
        var uiDoc = session.getValue();
        var msg = {
            docId: docId,
            op: operations.pack(packedCs)
        };
        clearCs(uiDoc.length);
        outgoing.push(msg);
    }

    function send() {
        if (state !== "IDLE")
            return;

        var st = new Date();
        if (ui.canEdit() && !outgoing.length && !isPreparedUnity())
            addOutgoingEdit();

        if (outgoing.length) {
            state = "COMMITTING";
            var top = outgoing[0];
            top.revNum = latestRevNum + 1;
            _self.sendJSON("EDIT_UPDATE", top);
        }
        if (DEBUG)
            console.log("[OT] send took", new Date() - st, "ms");
    }

    function setValue(contents) {
        var state = _self.getState();
        // must use c9doc setValue at first to trigger eventlisteners
        if (!session.c9doc  || session.c9doc.isInited)
            session.setValue(contents);
        else
            session.c9doc.setValue(contents);
        _self.setState(state);
        clearCs(contents.length);
    }

    function init(data) {
        var st = new Date();

        inited = false;

        if (data.chunkNum === 1)
            docStream = "";

        docStream += data.chunk;

        if (data.chunkNum !== data.chunksLength)
            return false;

        var dataDoc = JSON.parse(docStream);
        docStream = null;

        // re-joining the document
        if (typeof latestRevNum === "number") {
            syncOfflineEdits(dataDoc);
            authorLayer.dispose();
        }
        else {
            docId = data.docId;
            doc = dataDoc;
            revCache = {
                revNum: doc.revNum,
                contents: doc.contents,
                authAttribs: cloneObject(doc.authAttribs)
            };
            syncFileSystemState();
            cursors = _self.cursors = new Cursors(WS, session);
            cursorTimer = setTimeout(changedSelection, 500);
            _self.otDoc = doc;
        }

        state = "IDLE";

        latestRevNum = dataDoc.revNum;

        delete dataDoc.selections[WS.myOldClientId]; // in case of away

        cursors.updateSelections(dataDoc.selections);
        authorLayer = _self.authorLayer = new AuthorLayer(WS, session, doc);

        inited = true;

        if (DEBUG)
            console.log("[OT] init took", new Date() - st, "ms");

        return true;
    }

    function syncOfflineEdits(dataDoc) {
        var fromRevNum = latestRevNum + 1;
        var revisions = dataDoc.revisions;
        for (var i = fromRevNum; i < revisions.length; i++) {
            var rev = revisions[i];
            if (WS.myUserId == rev.author)
                delete rev.operation;
            handleIncomingEdit({
                op: rev.operation,
                revNum: rev.revNum,
                userId: rev.author,
                updated_at: rev.updated_at
            });
        }
        // already synced
        delete dataDoc.authAttribs;
        delete dataDoc.contents;
        delete dataDoc.revisions;

        for (var key in dataDoc)
            doc[key] = dataDoc[key];
        scheduleSend();
    }

    function syncFileSystemState () {
        var finalContents;

        var currentVal = session.getValue();
        if (typeof _self.fsContents === "string" &&
            typeof currentVal === "string" &&
            currentVal !== _self.fsContents) {
            // an edit was done while the document isn't yet connected
            var offlineOps = operations.operation(_self.fsContents, currentVal);
            // if _self.fsContents === doc.contents
            // collab doc state is synced with the latest filesystem state

            // Somebody was editing the document when I joined (or I reloaded without saving)
            // try to apply my edits
            if (_self.fsContents !== doc.contents) {
                var collabOps = operations.operation(_self.fsContents, doc.contents);
                xform(collabOps, offlineOps, function (aPrime, bPrime) {
                    collabOps = aPrime;
                    offlineOps = bPrime;
                });
                // console.log("[OT] offlineOps:", offlineOps, "collabOps:", collabOps);
                finalContents = applyContents(offlineOps, doc.contents);
                setValue(finalContents);
            } else {
                finalContents = currentVal;
            }

            if (DEBUG)
                console.log("[OT] Syncing offline document edits", offlineOps);

            packedCs = offlineOps;
            var authorI = WS.authorPool[WS.myUserId];
            applyAuthorAttributes(doc.authAttribs, offlineOps, authorI);

            scheduleSend();
        }
        else {
            finalContents = doc.contents;
            setValue(finalContents);
        }

        delete _self.fsContents;

        // They should equal (big files issue - apf_release.js)
        if (finalContents != session.getValue())
            throw new Error("doc.contents != ace.getValue() - !!!");
    }

    function isPreparedUnity() {
        // Empty doc - or all retain - no user edits
        return !packedCs.length || (packedCs.length === 1 && packedCs[0][0] === "r");
    }

    var lastVal = "";
    function clearCs(len) {
        // if (DEBUG > 1)
        //     lastVal = session.getValue();
        if (!len)
            packedCs = [];
        else
            packedCs = ["r"+len];
    }

    function handleIncomingEdit(msg) {
        if (msg.revNum !== latestRevNum + 1) {
            console.error("[OT] Incoming edit revNum mismatch !",
                msg.revNum, latestRevNum + 1);
            // if (DEBUG > 1)
            //     debugger;
            return;
        }
        var st = new Date();
        if (outgoing.length && isOurOutgoing(msg, outgoing[0])) {
            // 'op' not sent to save network bandwidth
            msg.op = outgoing[0].op;
            outgoing.shift();
            addRevision(msg);
            state = "IDLE";
            if (pendingSave) {
                pendingSave.outLen--;
                if (pendingSave.outLen === 0)
                    doSaveFile(pendingSave.silent);
            }
            scheduleSend();
        } else {
            addRevision(msg);

            // if (DEBUG > 1) {
            //     msg.oldOp = msg.op;
            //     var oldOutgoing = outgoing.map(function(out){ return out.op; });
            //     var oldPackedCs = packedCs;
            // }

            outgoing.push({op: packedCs});
            xformEach(outgoing, msg);

            // if (DEBUG > 1 && !timeslider.isVisible()) {
            //     // console.log(JSON.stringify({oldOutgoing: oldOutgoing, lastVal:lastVal, oldPackedCs: oldPackedCs, msg:msg},null,4))
            //     var startVal = lastVal;
            //     oldOutgoing.slice().reverse().forEach(function(out){
            //         var inverseOutgoing = operations.inverse(out);
            //         startVal = applyContents(inverseOutgoing, lastVal);
            //     });

            //     if (lastVal !== oldOutgoing.reduce(function(val, op){ return applyContents(op, val); }, startVal))
            //         debugger;

            //     var p0 = applyContents(oldPackedCs, lastVal);
            //     var p0_1 = applyContents(msg.op, p0);

            //     var p1 = applyContents(msg.oldOp, startVal);
            //     var p1_0 = outgoing.reduce(function(p1, msg){
            //         return applyContents(msg.op, p1);
            //     }, p1);

            //     if (p0_1 !== p1_0)
            //         debugger;
            // }

            packedCs = outgoing.pop().op;
            var sel = session.selection;
            cursors.setInsertRight(msg.clientId, false);
            sel.anchor.$insertRight = sel.lead.$insertRight = true;
            applyEdit(msg, session.doc);
            sel.anchor.$insertRight = sel.lead.$insertRight = false;
            cursors.setInsertRight(msg.clientId, true);
        }
        latestRevNum = msg.revNum;
        if (DEBUG)
            console.log("[OT] handleIncomingEdit took", new Date() - st, "ms", latestRevNum);
    }

    function applyEdit(msg, editorDoc) {
        if (timeslider.isVisible())
            return;
        ignoreChanges = true;
        applyAce(msg.op, editorDoc);
        applyAuthorAttributes(doc.authAttribs, msg.op, WS.authorPool[msg.userId]);
        authorLayer.refresh();
        doc.revNum = msg.revNum;
        // if (DEBUG > 1) {
        //     var val = editorDoc.getValue();
        //     var inverseCs = operations.inverse(packedCs);
        //     lastVal = applyContents(inverseCs, val);
            
        //     if (val !== applyContents(packedCs, lastVal))
        //         debugger;
        // }
        ignoreChanges = false;
    }

    function addRevision(msg) {
        if (!msg.op.length)
            console.error("[OT] Empty rev operation should never happen !");
        doc.revisions[msg.revNum] = {
            operation: msg.op,
            revNum: msg.revNum,
            author: msg.userId,
            updated_at: msg.updated_at || Date.now()
        };

        // will throw some error if it's a bad revision
        // if (DEBUG > 1)
        //     getRevWithContent(msg.revNum);
 
        if (activeOT === _self && timeslider.isVisible())
            timeslider.setSliderLength(msg.revNum);
    }

    function getRevWithContent(revNum) {
        var revs = doc.revisions;
        var i;
        // authAttribs can only be edited in the forward way because
        // The user who deleed some text isn't necessarily the one who inserted it
        if (!rev0Cache) {
            var rev0Contents = revCache.contents;
            for (i = revCache.revNum; i > 0; i--) {
                var op = operations.inverse(revs[i].operation);
                rev0Contents = applyContents(op, rev0Contents);
            }
            rev0Cache = {
                revNum: 0,
                contents: rev0Contents,
                authAttribs: [rev0Contents.length, null]
            };
            revCache = null;
        }
        if (!revCache || revCache.revNum > revNum)
            revCache = cloneObject(rev0Cache);

        var contents = revCache.contents;
        var authAttribs = cloneObject(revCache.authAttribs);

        for (i = revCache.revNum+1; i <= revNum; i++) {
            contents = applyContents(revs[i].operation, contents);
            applyAuthorAttributes(authAttribs, revs[i].operation, WS.authorPool[revs[i].author]);
        }
        var rev = cloneObject(revs[revNum]);
        rev.contents = contents;
        rev.authAttribs = authAttribs;

        // Update revCache
        revCache.contents = contents;
        revCache.authAttribs = cloneObject(authAttribs);
        revCache.revNum = revNum;
        return rev;
    }

    function historicalSearch(query) {
        var searchString = lang.escapeRegExp(query);
        var revNums = doc.revisions.length;
        var result = {
            revNums: revNums
        };
        for (var revNo = 0; revNo < revNums; revNo++) {
            var rev = getRevWithContent(revNo);
            var count = 0;
            if(rev.contents.match(new RegExp(searchString, 'i'))) {
                count = rev.contents.match(new RegExp(searchString, 'gi')).length;
                result[revNo] = count;
            }
        }
        return result;
    }

    function updateToRevNum(revNum) {
        var revisions = doc && doc.revisions;
        if (!revisions || !revisions[0])
            return console.error("[OT] doc null - document may haven't yet been inited !");
        if (ui.canEdit())
            return console.error("[OT] Can't updateToRevNum while editing !!");
        if (typeof revNum === "undefined")
            revNum = revisions.length - 1;
        if (DEBUG)
            console.log("[OT] REV:", revNum);
        if (doc.revNum === revNum)
            return;
        var rev = getRevWithContent(revNum);
        timeslider.updateTimer(rev.updated_at);
        ignoreChanges = true;
        setValue(rev.contents);
        // FIXME not a good practice to have mutable data
        // affecting the behaviour of the app
        doc.authAttribs = rev.authAttribs;
        session._emit("changeBackMarker");
        authorLayer.refresh();
        doc.revNum = revNum;
        ignoreChanges = false;
    }

    function receiveHandler(event) {
        var data = event.data;
        switch (event.type) {
        case "EDIT_UPDATE":
            handleIncomingEdit(data);
            break;
        case "SYNC_COMMIT":
            state = "IDLE";
            // updating it here means the commited operation could sometimes not be
            // transformed against the previous operation
            // if (DEBUG > 1) {
            //     if (latestRevNum != data.revNum)
            //         debugger;
            // }
            if (data.reason.indexOf("OT Error") !== -1) {
                // if (DEBUG > 1)
                //     debugger;
                console.error("[OT] SYNC_COMMIT server OT error");
            }
            scheduleSend();
            break;
        case "CURSOR_UPDATE":
            cursors && cursors.updateSelection(data);
            break;
        case "FILE_SAVED":
            if (data.err) {
                exports._emit("filesaved", {
                    err: data.err,
                    docId: docId
                });
                break;
            }

            if (data.star)
                doc.starRevNums.push(data.revNum);
            exports._emit("filesaved", {
                star: data.star,
                docId: docId,
                revision: doc.revisions[data.revNum],
                clean: !outgoing.length && latestRevNum === data.revNum
            });
            break;
        }
    }

    function loadTimeslider() {
        var revisions = doc && doc.revisions;
        if (!revisions || !revisions[0])
            return console.error("[OT] doc null - document may haven't yet been inited !");
        var numRevs = revisions.length - 1;
        timeslider.setSliderLength(numRevs);
        var starRevisions = doc.starRevNums.map(function (revNum) {
            return revisions[revNum];
        });
        timeslider.setSavedRevisions(starRevisions);
        timeslider.setSliderPosition(numRevs);
        var lastRev = revisions[numRevs];
        timeslider.updateTimer(lastRev.updated_at);
        // Call again to re-render all slider elements
        timeslider.setSliderLength(numRevs);

        cursors.hideAllTooltips();
        session._emit("changeBackMarker");
    }

    var pendingSave;

    function saveFile(silent) {
        var isUnity = isPreparedUnity();
        if (state === "IDLE" && isUnity)
            return doSaveFile(silent);
        if (!isUnity)
            addOutgoingEdit();
        pendingSave = {silent: silent, outLen: outgoing.length};
    }

    function doSaveFile(silent) {
        _self.sendJSON("SAVE_FILE", {
            docId: docId,
            silent: !!silent
        });
        pendingSave = null;
    }

    function dispose() {
        state = "IDLE";
        session.removeListener("change", handleUserChanges);
        session.selection.removeEventListener("changeCursor", onCursorChange);
        session.selection.removeEventListener("changeSelection", onCursorChange);
        session.selection.removeEventListener("addRange", onCursorChange);
        clearTimeout(sendTimer);
        clearTimeout(cursorTimer);
        if (inited) {
            cursors.dispose();
            authorLayer.dispose();
        }
    }

    function leaveDoc(clientId) {
        cursors && cursors.clearSelection(clientId);
    }

    function isChanged () {
        var revisions = doc.revisions;
        var lastRev = revisions[revisions.length - 1];
        return !isPreparedUnity() ||
            (revisions.length > 1 && doc.starRevNums.indexOf(lastRev.revNum) === -1);
    }

    function patchToContents(contents) {
        applyAce(operations.operation(session.getValue(), contents), session.doc);
    }

    this.leaveDoc = leaveDoc;
    this.isChanged = isChanged;
    this.loadTimeslider = loadTimeslider;
    this.handleDocMsg = receiveHandler;
    this.updateToRevNum =  updateToRevNum;
    this.saveFile = saveFile;
    this.historicalSearch = historicalSearch;
    this.init = init;
    this.patchToContents = patchToContents;
    this.dispose = dispose;
    // to simplify testing
    this.sendJSON = exports.sendJSON;
}
exports.OTDocument = OTDocument;
});
