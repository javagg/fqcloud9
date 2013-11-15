/*global define console setTimeout tabEditors barTools apf winCollabInstall
collabInstallTitle collabInstallMsg btnCollabInstall btnCollabDisable
mnuCtxEditor mnuCtxEditorFileHistory davProject self*/
"use strict";
define(function(require, exports, module) {

var ide = require("core/ide");
var util = require("core/util");
var ext = require("core/ext");
var commands = require("ext/commands/commands");
var menus = require("ext/menus/menus");
var settings = require("ext/settings/settings");

var dom = require("ace/lib/dom");
var Client = require("./client");
var timeslider = require("./timeslider");
var Chat = require("./chat");
var AuthorsLayer = require("./authors_layer");

var Editors = require("ext/editors/editors");
var Notification = require("ext/notifications/notifications");
var c9console = require("ext/console/console");
var fs = require("ext/filesystem/filesystem");

var markupSettings = require("text!./settings.xml");
var markup = require("text!./ot.xml");
var otCss = require("text!./style/style.css");
otCss = otCss.replace(/\[%otStatic%\]/g, window.cloud9config.staticUrl + "/ext/ot/style")
                .replace(/\[%staticPrefix%\]/g, window.cloud9config.staticUrl);

module.exports = ext.register("ext/ot/ot", {
    name   : "OT",
    dev    : "Ajax.org",
    type   : ext.GENERAL,
    alone  : true,
    nodes  : [],
    markup : markup,

    hook: function () {
        if (!window.cloud9config.collab)
            return;
        ext.initExtension(this);
    },

    init : function() {
        dom.importCssString(otCss);
        timeslider.init();

        var _self = this;
        var tabs = tabEditors;

        window.addEventListener("unload", function() {
            Client.leaveAll();
        }, false);

        function getDocId(path) {
            return path.slice(ide.davPrefix.length + 1).replace(/^[\/]+/, "");
        }

        function isReadOnly() {
            return !!(ide.readonly ||
                timeslider.isVisible());
        }
        
        timeslider.handleKeyboard = function(data, hashId, keystring) {
            if (keystring == "esc") {
                forceHideSlider();
                return {command: "null"};
            }
        };

        function toggleTimeslider() {
            var page = tabs.getPage();
            if (!page || !page.$doc)
                return;
            var doc = Client.getDoc(getDocId(page.name));
            var aceEditor = page.$editor.amlEditor.$editor;
            if (timeslider.isVisible()) {
                timeslider.hide();
                tabs.getPages().forEach(function (page) {
                    var doc = Client.getDoc(getDocId(page.name));
                    if (doc && doc.isInited) {
                        doc.ot.updateToRevNum();
                        page.$model.setQueryValue("@changed", doc.ot.isChanged() ? "1" : "0");
                    }
                });
                aceEditor.keyBinding.removeKeyboardHandler(timeslider);
                aceEditor.setReadOnly(!!ide.readonly);
            }
            else {
                if (!doc || !doc.ot.otDoc || !doc.ot.otDoc.revisions[0])
                    return;
                ide.dispatchEvent("track_action", {type: "timeslider"});
                timeslider.show();
                aceEditor.setReadOnly(true);
                Client.setActiveDoc(doc.ot);
                aceEditor.keyBinding.addKeyboardHandler(timeslider);
            }
            aceEditor.renderer.onResize(true);
        }

        function timesliderAvailable(editor){
            if (!editor || editor.path != "ext/code/code")
                return false;
            var aceEditor = editor.amlEditor.$editor;
            var collabDoc = aceEditor.session.collabDoc;
            return collabDoc && collabDoc.isInited && collabDoc.ot.otDoc.revisions[0];
        }

        commands.addCommand({
            name: "toggleTimeslider",
            exec: toggleTimeslider,
            isAvailable: timesliderAvailable
        });

        commands.addCommand({
            name: "forceToggleTimeslider",
            exec: function(){
                var isVisible = apf.isTrue(settings.model.queryValue("general/@timeslidervisible"));
                settings.model.setQueryValue("general/@timeslidervisible", (!isVisible) + "");
                toggleTimeslider();
            },
            isAvailable: timesliderAvailable
        });


        var playbackItem = menus.addItemByPath("File/File Revision History...", new apf.item({
            type: "check",
            checked: "[{require('ext/settings/settings').model}::general/@timeslidervisible]",
            command: "toggleTimeslider"
        }), 900);

        this.nodes.push(playbackItem);

        // right click context item in ace
        ide.addEventListener("init.ext/code/code", function() {
            _self.nodes.push(
                mnuCtxEditor.insertBefore(new apf.item({
                    id : "mnuCtxEditorFileHistory",
                    caption : "File History",
                    command: "forceToggleTimeslider"
                }), mnuCtxEditor.firstChild)
            );

            apf.addListener(mnuCtxEditor, "prop.visible", function(ev) {
                // only fire when visibility is set to true
                if (ev.value) {
                    var editor = tabs.getPage().$editor;
                    if (timesliderAvailable(editor))
                        mnuCtxEditorFileHistory.enable();
                    else
                        mnuCtxEditorFileHistory.disable();
                }
            });
        });

        function forceHideSlider() {
            var isVisible = apf.isTrue(settings.model.queryValue("general/@timeslidervisible"));
            if (isVisible)
                settings.model.setQueryValue("general/@timeslidervisible", "false");
            if (timeslider.isVisible())
                toggleTimeslider();
        }

        self["timeslider-close"].addEventListener("click", function() {
            forceHideSlider();
        });

        ide.addEventListener("closefile", this.$closeFileHook = function (e){
            if (tabs.getPages().length == 1)
                forceHideSlider();
        });

        var capturedReads = this.$capturedReads = {};
        var eventMap = {};

        function stateFactory (doc) {
            var editor = doc.$page.$editor;
            return {
                setState: editor.setState.bind(editor, doc),
                getState: editor.getState.bind(editor, doc)
            };
        }

        var movedDocs = {};
        // davProject.move = davProject.rename = function (sFrom, sTo, bOverwrite, bLock, callback) {}

        ide.addEventListener("afterupdatefile", this.$afterUpdateFile = function (e) {
            var oldDocId = getDocId(e.path);
            var newDocId = getDocId(e.newPath);
            if (Client.isConnected(oldDocId)) {
                movedDocs[newDocId] = {
                    oldId: oldDocId,
                    contents: Client.getDoc(oldDocId).session.getValue()
                };
                Client.leaveDoc(oldDocId);
            }

            var page = getPageWithDocId(newDocId);
            if (!page)
                return;

            // HACK: Force rename the tab - doesn't always happen
            page.$model.setQueryValue("@name", e.newPath.split("/").pop());
            page.$model.setQueryValue("@path", e.newPath);

            Client.joinDoc(newDocId, page.$doc, page.$doc.acesession, stateFactory(page.$doc));
        });

        ide.addEventListener("readfile", this.$readFileHook = function(e) {
            var path = e.node.getAttribute("path");

            // if the editor is NOT a code editor, then we leave the file up to another plugin
            var fileExtension = path.split(".").pop();
            var editorPlugin = Editors.fileExtensions[fileExtension] &&
              Editors.fileExtensions[fileExtension][0] ||
              Editors.fileExtensions["default"];
            if (!editorPlugin || editorPlugin.name.toLowerCase() != "code editor")
                return;

            e.preventDefault();

            var id = getDocId(path);

            e.doc.id = id;
            eventMap[id] = e;

            var page = e.doc.$page;
            if (!page)
                return;

            var editor = page.$editor;
            var aceEditor = editor.amlEditor.$editor;

            if (Client.isConnected(id)) {
                var doc = Client.getDoc(id);
                ide.dispatchEvent("afteropenfile", { doc: doc.original, node: doc.original.getNode() });
                return;
            }

            if (!e.doc.acesession)
                editor.setDocument(e.doc, page.$at, true);

            var collabDoc = Client.joinDoc(id, e.doc, e.doc.acesession, stateFactory(e.doc));
            var otDoc = collabDoc.ot;

            function normalizeTextLT(text) {
                var match = text.match(/^.*?(\r\n|\r|\n)/m);
                var nlCh = match ? match[1] : "\n";
                return text.split(/\r\n|\r|\n/).join(nlCh);
            }

            if (!Client.isConnected()) {
                capturedReads[id] = e;
                fs.readFile(path, function(data, state, extra) {
                    if (state != apf.SUCCESS) {
                        if (extra.status !== 404)
                            console.error("Opening file failed for", path, "server responded with", state, extra);

                        ide.dispatchEvent("filenotfound", {
                            node : e.node,
                            url  : extra.url,
                            path : path
                        });
                    }
                    else {
                        if (Client.isConnected(id))
                            return;
                        delete capturedReads[id];
                        var normContents = normalizeTextLT(data);
                        e.doc.setValue(normContents);
                        otDoc.fsContents = normContents;
                        setTimeout(function(){
                            if (!Client.isConnected(id))
                                ide.dispatchEvent("afteropenfile", {doc: e.doc, node: e.node});
                        }, 150);
                    }
                });
            }
        });

        Client.on("docloaded", function(e) {
            var docId = e.doc.id;
            var otDoc = e.doc.ot;

            delete capturedReads[docId];

            var movedDoc = movedDocs[docId];
            if (movedDoc) {
                console.log("[OT] Doc remamed from " + movedDoc.oldId +" to " + docId);
                delete movedDocs[docId];
                if (movedDoc.contents !== e.doc.session.getValue()) {
                    otDoc.patchToContents(movedDoc.contents);
                    e.doc.original.$page.$model.setQueryValue("@changed", "1");
                }
                return;
            }

            var ev = eventMap[docId];
            if (!ev)
                return;

            var doc  = ev.doc;
            var node = doc.getNode();
            var aceEditor = doc.editor.amlEditor.$editor;

            function checkActivePage() {
                if (tabs.getPage() === ev.doc.$page) {
                    var syntax = doc.editor.getSyntax(node);
                    var mode = doc.editor.amlEditor.getMode(syntax);
                    e.doc.session.setMode(mode);
                    Client.setActiveDoc(e.doc.ot);
                    e.doc.authorLayer.refresh();
                }
            }

            var path = node.getAttribute("path");
            if (e.err) {
                console.error("JOIN_DOC Error:", e.err);
                ide.dispatchEvent("filenotfound", {
                    node : node,
                    url  : "COLLAB_FETCH",
                    path : path
                });
                return;
            }

            var page = doc.$page;
            var editor = page.$editor;
            var otInnerDoc = otDoc.otDoc;

            if (otInnerDoc.fsHash !== otInnerDoc.docHash) {
                console.log("[OT] doc latest state fs diff", node.getAttribute("path"));
                page.$model.setQueryValue("@changed", "1");
            }

            checkActivePage();

            var newFile = apf.isTrue(node.getAttribute("newfile"));

            if (!newFile) {
                setTimeout(function () {
                    ide.dispatchEvent("afteropenfile", {doc: doc, node: node});
                    checkActivePage();
                }, 100);
            }
        });

        // monitor newly created documents:
        var newDocuments = {};

        ide.addEventListener("afteropenfile", this.$afterOpenFileHook = function(e){
            var doc  = e.doc;
            var node = doc.getNode();
            if (!apf.isTrue(node.getAttribute("newfile")))
                return;

            var path = node.getAttribute("path");
            newDocuments[path] = doc;
            var id = getDocId(path);
            eventMap[id] = e;
        });

        Client.on("event", function (e) {
            ide.dispatchEvent(e.name, e.data || {});
        });

        var oldSaveFile = fs._saveFile = fs.saveFile;
        var saveCallbacks = {};

        ide.addEventListener("beforefilesave", function(e) {
            if (timeslider.isVisible())
                e.preventDefault();
        });

        fs.saveFile = function (path, data, callback, silent) {
            var id = getDocId(path);
            var doc = Client.getDoc(id);
            if (!doc || !Client.isConnected(id))
                return oldSaveFile.apply(fs, arguments);
            saveCallbacks[id] = (saveCallbacks[id] || []).concat(callback);
            doc.ot.saveFile(silent);
        };

        function getPageWithDocId(docId) {
            return tabs.getPages().filter(function (p) {
                return getDocId(p.name) === docId;
            })[0];
        }

        Client.on("filesaved", function (e) {
            var callbacks = saveCallbacks[e.docId] || [];

            if (e.err)
                console.error("SAVE_FILE Error:", e.err);
            callbacks.forEach(function (cb) {
                if (e.err)
                    cb("", apf.ERROR, {message: e.err});
                else
                    cb("", apf.SUCCESS, {});
            });
            if (e.clean) {
                var page = getPageWithDocId(e.docId);
                if (!page)
                    return;
                var node = page.$doc.getNode();
                apf.xmldb.removeAttribute(node, "changed");
                var at = page.$at;
                at.undo_ptr = at.$undostack[at.$undostack.length-1];
                page.$at.dispatchEvent("afterchange");

                if (tabs.getPage() === page && timeslider.isVisible() && e.star)
                    timeslider.addSavedRevision(e.revision);
            }
        });

        ide.addEventListener("afterfilesave", this.$afterFileSaveHook = function(e) {
            var node = e.doc.getNode();
            var path = node.getAttribute("path");
            var id = getDocId(path);
            var doc = Client.getDoc(id);

            var oldpath = e.oldpath || path;
            if (!newDocuments[oldpath])
                return;

            // a newly created document was saved:
            if (path !== oldpath) {
                var oldId = getDocId(oldpath);
                Client.leaveDoc(oldId);
                delete eventMap[oldId];
            }
            delete newDocuments[oldpath];
            if (!doc.isInited) {
                eventMap[id] = e;
                Client.joinDoc(id, e.doc, e.doc.acesession, stateFactory(e.doc));
            }
        });

        tabs.addEventListener("DOMNodeRemoved", this.$tabRemoveListener = function(e) {
            var page = e.currentTarget;
            if (page.localName != "page" || e.relatedNode != tabs || page.nodeType != 1)
                return;

            Client.leaveDoc(getDocId(page.name));
        });

        ide.addEventListener("tab.afterswitch", this.$afterswitchListener = function(e) {
            var page = e.nextPage;
            var doc = Client.getDoc(getDocId(page.name));
            if (!doc || !doc.ot)
                return;

            if (doc.isInited) {
                Client.setActiveDoc(doc.ot);
                if (!doc.ot.otDoc.revisions[0])
                    forceHideSlider();
            }
        });

        ide.addEventListener("tab.beforeswitch", this.$beforeswitchListener = function(e) {
            var editor = Editors.currentEditor && Editors.currentEditor.amlEditor && Editors.currentEditor.amlEditor.$editor;
            if(!editor)
                return;
            clearTimeout(editor.cursorTooltipTimeout);
            delete editor.cursorTooltipTimeout;
            clearTimeout(editor.authorTooltipTimeout);
            delete editor.authorTooltipTimeout;
            var collabDoc = editor.session.collabDoc;
            if (collabDoc && collabDoc.isInited && collabDoc.cursors.tooltipIsOpen)
                collabDoc.cursors.hideAllTooltips();
        });

        function showCollabInstall(msg) {
            winCollabInstall.show();
            collabInstallTitle.$ext.innerHTML = msg.title;
            collabInstallMsg.$ext.innerHTML = msg.body;
        }

        ide.addEventListener("socketMessage", this.$socketMessageHook = function (ev) {
            var msg = ev.message;
            if (msg.command === "collab-plugin" && msg.type === "install") {
                ext.initExtension(c9console);
                c9console.showConsole();
                showCollabInstall(msg);

                btnCollabInstall.addEventListener("click", function installerClick() {
                    btnCollabInstall.removeEventListener("click", installerClick);
                    var consoleCmdInterv = setInterval(function () {
                        var term = c9console.terminal;
                        if (!term || !term.fd || term.reconnecting || term.restoringState || term.terminated)
                            return console.warn("[OT] Waiting terminal to connect -- cmd:", msg.console);
                        term.send(msg.console + " ; \n"); // execute the command
                        winCollabInstall.hide();
                        clearInterval(consoleCmdInterv);

                        var npmBinaryDelay = msg.console.indexOf("npm") !== -1;

                        setTimeout(function() {
                            util.alert("Collaboration Features", "Install finished?!", "Done installation? - Please reload to enjoy Collaboration features!");
                        }, npmBinaryDelay ? 90000 : 30000);
                    }, 300);
                });
            }
        });

        timeslider.onSlider(function (revNum) {
            var page = tabs.getPage();
            var doc = Client.getDoc(getDocId(page.name));
            if (!doc || !doc.ot || !timeslider.isVisible())
                return;

            doc.ot.updateToRevNum(revNum);
        });

        function throbNotification(user, msg) {
            if (!user) {
                return Notification.showNotification(msg);
            }
            var chatName = apf.escapeXML(user.fullname);
            var md5Email = user.email && apf.crypto.MD5.hex_md5(user.email.trim().toLowerCase());
            var defaultImgUrl = encodeURIComponent(ide.staticPrefix + "/ext/collaborate/images/room_collaborator_default-white.png");
            console.log("Collab:", user.fullname, msg);
            Notification.showNotification('<img class="gravatar-image" src="https://secure.gravatar.com/avatar/' +
                md5Email + '?s=26&d='  + defaultImgUrl + '" /><span>' +
                chatName + '<span class="notification_sub">' + msg + '</span></span>');
        }

        function openLinkedFile(path) {
            var docPath = ide.davPrefix + "/" + path;
            Editors.gotoDocument({
                path: docPath
            });
        }

        function chatNotification(user, msg, path) {
            var notif = {
                id: Date.now(),
                timestamp: Date.now(),
                userId: user.uid,
                text: msg,
                notification: {}
            };
            var increment = false;
            if (path) {
                notif.notification = {
                    linkText: path,
                    linkHandler: openLinkedFile.bind(null, path)
                };
                increment = true;
            }
            Chat.addMessage(notif, increment);
        }

        Client.on("disconnect", function (e) {
            var quoatedPending = e.pending.map(function (p) { return "'" + p + "'"; });
            throbNotification(null, "Collab disconnected");
            console.log("Collab disconnected - pending: " + quoatedPending.join(", "));
        });

        Client.on("notification", function (e) {
            var type = e.type;
            var data = e.data;
            var user = data && data.userId && _self.getUser(data.userId);
            switch(type) {
                case "CONNECT":
                    console.log("Collab connected");
                    throbNotification(null, e.err || "Collab connected");
                    break;
                case "CONNECTING":
                    console.log("Collab connecting");
                    // throbNotification(null, "Collab connecting ...");
                    break;
                case "USER_JOIN":
                    throbNotification(user, "came online");
                    chatNotification(user, "came online");
                    break;
                case "USER_LEAVE":
                    throbNotification(user, "went offline");
                    chatNotification(user, "went offline");
                    break;
                case "JOIN_DOC":
                    // throbNotification(user, "opened file: " + data.docId);
                    chatNotification(user, "opened file: ", data.docId);
                    break;
                case "LEAVE_DOC":
                    // throbNotification(user, "closed file: " + data.docId);
                    chatNotification(user, "closed file: ", data.docId);
                    break;
            }
        });

        ide.addEventListener("socketConnect", function () {
            Client.onConnect(ide.connection);
        });

        ide.addEventListener("socketMessage", Client.onMessage.bind(Client));
        ide.addEventListener("socketDisconnect", Client.onDisconnect.bind(Client));

        if (ide.connected)
            Client.onConnect(ide.connection);

        settings.addSettings("Collaboration", markupSettings);

        function updateSettings() {
            AuthorsLayer.setEnabled(apf.isTrue(settings.model.queryValue("collab/@show_author_info")));
            var page = tabs.getPage();
            if (!page)
                return;
            var doc = Client.getDoc(getDocId(page.name));
            if (!doc || !doc.isInited)
                return;
            if (doc.authorLayer)
                doc.authorLayer.refresh();
            var aceEditor = page.$editor.amlEditor.$editor;
            if (aceEditor.tooltip)
                aceEditor.tooltip.style.display = "none";
        }

        ide.addEventListener("settings.save", updateSettings);
        settings.model.addEventListener("update", updateSettings);

        ide.addEventListener("settings.load", function(e){
            settings.setDefaults("collab", [["show_author_info", "true"]]);
            settings.setDefaults("general", [["timeslidervisible", "false"]]);

            // Can't initially open the timeslider -- the Collab client is probably not yet connected
            settings.model.setQueryValue("general/@timeslidervisible", "false");

            updateSettings();
        });
    },

    getUser: function(uid) {
        return Client.getUser(uid);
    },

    getUserColor: function(uid) {
        return Client.getUserColor(uid);
    },

    disable: function () {
        this.$stopListening();
        this.$disable();
    },

    destroy: function () {
        this.$stopListening();
        this.$destroy();
    },

    $stopListening: function() {
        // Didn't clean the Client listeners
        fs.saveFile = fs._saveFile;
        var tabs = tabEditors;
        tabs.removeEventListener("DOMNodeRemoved", this.$tabRemoveListener);
        ide.removeEventListener("closefile", this.$closeFileHook);
        ide.removeEventListener("readfile", this.$readFileHook);
        ide.removeEventListener("afteropenfile", this.$afterOpenFileHook);
        ide.removeEventListener("afterfilesave", this.$afterFileSaveHook);
        ide.removeEventListener("tab.afterswitch", this.$afterswitchListener);
        ide.removeEventListener("tab.beforeswitch", this.$beforeswitchListener);
        ide.removeEventListener("socketMessage", this.$socketMessageHook);
        var capturedReads = this.$capturedReads;
        for (var id in capturedReads)
            ide.dispatchEvent("openfile", capturedReads[id]);
        this.$capturedReads = [];
    }
});

});
