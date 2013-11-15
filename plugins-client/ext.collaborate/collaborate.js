/**
 * Collaboration extension for the Cloud9 IDE
 *
 * @author Matt Pardee
 * @author Mike de Boer
 * @contributor Fabian Jakobs
 * @copyright 2012, Ajax.org B.V.
 */
 /*global define escape self apf vbMain collabMembers tlbCollabBottomBar
 treeCollaborators btnChatCollaborator mnuCtxShare btnShareProject
 mnuCtxPromoteCollab mnuCtxDemoteCollab */
"use strict";
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var util = require("core/util");
var skin = require("text!./skin.xml");
var markup = require("text!./collaborate.xml");

var Menus = require("ext/menus/menus");
var Commands = require("ext/commands/commands");
var Dock = require("ext/dockpanel/dockpanel");

var ServerMessages = require("./server_messages");

module.exports = ext.register("ext/collaborate/collaborate", {
    name            : "Collaboration",
    extName         : "ext/collaborate/collaborate",
    dev             : "Ajax.org",
    alone           : true,
    type            : ext.GENERAL,
    skin            : {
        id : "collaborate",
        data : skin,
        "media-path" : ide.staticPrefix + "/ext/collaborate/images/"
    },
    markup          : markup,
    commands        : {},

    //constants:
    ROLE_VISITOR : "v",
    ROLE_COLLABORATOR : "c",
    ROLE_ADMIN : "a",
    COLLABSTATE_PENDING_ADMIN : "pending-admin",
    COLLABSTATE_PENDING_USER : "pending-user",
    COLLABSTATE_PENDING_NONE : "pending-none",
    ACL_RW : "rw",
    ACL_R : "r",

    handshaked      : false,
    canceled        : false,
    myUserId        : String(ide.uid) || "",
    ownerUid        : undefined,
    iAmOwner        : false,
    iAmAdmin        : false,
    users           : {},

    nodes : [],

    hook : function(){
        var _self = this;

        Commands.addCommand({
            name: "share_email",
            hint: "share your project with friends and colleagues via email",
            exec: function(env, args, request) {
                ide.dispatchEvent("track_action", {type: "share"});
                window.open(_self.getShareUrl());
            }
        });

        Commands.addCommand({
            name: "share_twitter",
            hint: "share your project with friends and colleagues via Twitter",
            exec: function(env, args, request) {
                _self.share("twitter");
            }
        });

        Commands.addCommand({
            name: "share_facebook",
            hint: "share your project with friends and colleagues via Facebook",
            exec: function(env, args, request) {
                _self.share("facebook");
            }
        });

        // Google+ sharing requires JS and markup to be inserted into the page,
        // which is entirely unwanted. Until they fix this, G+ sharing is disabled.
        /*Commands.addCommand({
            name: "share_googleplus",
            hint: "share your project with friends and colleagues via Google+",
            exec: function(env, args, request) {
                _self.share("googleplus");
            }
        });*/

        this.nodes.push(
            Menus.setRootMenu("Share", 750),
            Menus.addItemByPath("Share/Invite by email", new apf.item({
                command : "share_email"
            }), 100),
            Menus.addItemByPath("Share/~", new apf.divider(), 200),
            Menus.addItemByPath("Share/Share on Twitter", new apf.item({
                command : "share_twitter"
            }), 300),
            Menus.addItemByPath("Share/Share on Facebook", new apf.item({
                command : "share_facebook"
            }), 400)/*,
            Menus.addItemByPath("Share/Share on Google+", new apf.item({
                command : "share_googleplus"
            }), 500)*/
        );

        var collab = this;

        ide.addEventListener("collab.usersUpdate", function () {
            _self.refresh();
        });

        ide.addEventListener("ext.auth/loggedinreadonly", function() {
            collab.model.addEventListener("update", function() {
                if (self["view-mode-box-readonly"].noshow)
                    return;

                apf.setStyleClass(vbMain.$ext, "readonly");
                document.getElementById("lblPrjUser").innerHTML = window.location.pathname.replace(/^\//, "").split('/')[0];

                setTimeout(function(){
                    self["view-mode-box-readonly"].show();
                    vbMain.$ext.style.position = "absolute";
                    vbMain.$ext.style.top = "35px";
                    vbMain.$ext.style.left = "0";
                    vbMain.$ext.style.right = "0";
                    vbMain.$ext.style.bottom = "0";
                });
            });
        });

        this.strLastUserSearch = "";

        Dock.addDockable({
            expanded : -1,
            width : 300,
            "min-width" : 300,
            barNum: 1,
            sections : [
                {
                    width : 260,
                    height: 350,
                    buttons : [
                        {
                            caption: "Members",
                            ext : [this.extName, "collabMembers"],
                            hidden : true
                        }
                    ]
                },
                {
                    width : 260,
                    height: 350,
                    minWidth : 270,
                    buttons  : []
                }
            ]
        });

        Dock.register(this.extName, "collabMembers", {
            menu : "Collaboration/Members",
            primary : {
                backgroundImage: ide.staticPrefix + "/ext/collaborate/images/collab_icons_subtle.png",
                defaultState: { x: -10, y: -10 },
                activeState: { x: -10, y: -122 }
            }
        }, function(type) {
            return collabMembers;
        });

        // HACKY SHITTY DOCKY state correction
        // Deprecate Group Chat in the dockpanel
        ide.addEventListener("dockpanel.load.settings", function (state) {
            var groupChatBtnExt = [_self.extName, window.cloud9config.workspaceId].join("-");
            var bars = (state.state.bars || []);
            bars.forEach(function (bar) {
                if (!bar)
                    return;
                var sections = bar.sections || [];
                for (var i = 0; i < sections.length; i++) {
                    var sec = sections[i];
                    var buttons = sec.buttons || [];
                    for (var j = 0; j < buttons.length; j++) {
                        if (buttons[j].ext.join("-") === groupChatBtnExt)
                            return sections.splice(i--, 1);
                    }
                }
            });
        });

        ext.initExtension(this);
    },

    init : function() {
        var _self = this;
        var hidePanelOnce = false;
        var isAnon = (this.myUserId.indexOf("anon_") === 0);

        this.model = new apf.model();
        this.model.load("<groups></groups>");
        this.model.addEventListener("update", function(e) {
            //if (e.action === "attribute" && e.undoObj && e.undoObj.name === "readwrite")
            //   AccessRequests.updatePermissions(e.xmlNode);

            if  (_self.iAmOwner)
                tlbCollabBottomBar.show();
            else
                tlbCollabBottomBar.hide();

            if ((e.currentTarget.queryNodes("//user").length <= 1 || !e.xmlNode.selectSingleNode("//user")) && !isAnon) {
                if (!_self.hideCollabPanels && !hidePanelOnce) {
                    hidePanelOnce = true;
                    Dock.hideSection(_self.extName, false);
                    _self.hideCollabPanels = true;
                }
            }
            else {
                if (_self.hideCollabPanels) {
                    Dock.showSection(_self.extName, false);
                    _self.hideCollabPanels = false;
                }

                if (!e.action || ((e.action == "add" || e.action == "remove") && e.xmlNode.getAttribute("status") == _self.COLLABSTATE_PENDING_ADMIN)) {
                    var btn = Dock.getButtons(_self.extName, "collabMembers");
                    var cnt = _self.model.queryNodes("group[@name='pending']/user[@status='pending-admin']").length;
                    if (btn && btn.length > 0 && btn[0].cache) {
                        Dock.updateNotificationElement(btn[0].cache, cnt, {"type": "chat", "name": "collabMembers"});
                    }
                }
            }
        });

        // the tree with collaborators is dependent on the IDE server
        // so to ensure the correct state, we'll enable/disable the tree
        // on socket (dis)connects from the IDE server and not the collab one
        function onIdeOnline() {
            // Re-negotiate with server to get latest collab data
            if (_self.canceled)
                return;

            // handshake
            _self.refresh();
        }

        ide.addEventListener("afteronline", onIdeOnline);
        if (ide.onLine)
            onIdeOnline();

        // same goes for disconnects
        ide.addEventListener("afteroffline", function(){
            treeCollaborators.disable();

            // Once this client reconnects we request collaborator data (see setOnline)
            _self.handshaked = false;
        });

        ide.addEventListener("showerrormessage", function(e) {
            // cancel certain error messages:
            if (!e.message || e.message.indexOf("not a member of workspace") > -1)
                return false;
        });

        function onIdeSocketMessage(e) {
            if (e.message.type === "collab" || e.message.command === "collab") {
                ext.initExtension(_self);
                ServerMessages.onServerMessage(_self, e.message);
            }
        }

        ide.addEventListener("socketMessage", onIdeSocketMessage);

        treeCollaborators.setModel(this.model);

        this.startIdleMonitor();
    },

    // add metadata to a message
    augmentMessage: function(message) {
        if (!message.uid)
            message.uid = ide.uid;
        if (!message.command)
            message.command = "collab";
        message.from = ide.uid;
        message.pid = ide.pid;
        message.workspaceId = ide.workspaceId;

        return message;
    },

    send: function(message) {
        ide.send(this.augmentMessage(message));
    },

    refresh: function () {
        this.send({
            channel: "user/handshake"
        });
    },

    showMembers: function () {
        var membersBtn = Dock.getButtons(this.extName, "collabMembers")[0];
        var _self = this;
        if (!membersBtn)
            return setTimeout(function() {
                _self.showMembers();
            }, 10);

        var uId = membersBtn.uniqueId;
        var layout = Dock.layout;
        layout.show(uId, true);
        if (layout.isExpanded(uId) < 0)
            layout.showMenu(uId);

        treeCollaborators.clearSelection(true);
    },

    selectMember: function (uid) {
        var userNode = this.model.queryNode("//user[@uid='" + uid + "']");
        treeCollaborators.select(userNode);
    },

    startIdleMonitor: function() {
        var idleCounter = 0;
        var idleStart = 0;
        var isIdle = false;
        var _self = this;
        this.idleInterval = setInterval(function() {
            if (idleCounter === 0)
                idleStart = new Date();

            idleCounter = idleCounter + 1;
            if (idleCounter > 10 && isIdle === false) {
                isIdle = true;
                // Dispatch that we're idle
                _self.send({
                    channel: "workspace/updatemember",
                    state: {
                        idle: idleStart
                    }
                });
            }
        }, /* 10 minutes */ 60000);

        var resetIdle = function() {
            idleCounter = 0;

            if (isIdle === true) {
                isIdle = false;
                _self.send({
                    channel: "workspace/updatemember",
                    state: {
                        idle: 0
                    }
                });
            }
        };

        document.addEventListener("mousemove", resetIdle, true);
        document.addEventListener("keydown", resetIdle, true);
    },

    getDockSection: function(members) {
        var bar;
        var state = Dock.layout.getState(true);
        for (var i = state.bars.length - 1; i >= 0; --i) {
            if (state.bars[i] && state.bars[i].barNum === 1) {
                bar = state.bars[i];
                break;
            }
        }
        if (!bar.cache && !this.hideCollabPanels)
            Dock.showBar(bar);
        return bar.sections[members ? 0 : 1];
    },

    cancelHandshake: function(uid) {
        if (uid)
            this.myUserId = uid;
        this.canceled = true;
    },

    showGroupChat: function () {
        var otCollab = require("core/ext").extLut["ext/ot/ot"];
        if (otCollab && otCollab.inited)
            require("ext/ot/" + "chat").show();
        else
            util.alert("Collab and Group chat isn't possible in this workspaces");
    },

    getUserColor : function(user) {
        var otCollab = require("core/ext").extLut["ext/ot/ot"];
        if (!otCollab)
            return "transparent";
        return otCollab.getUserColor(user.uid);
    },

    /**
     * Method called when an element is selected in the collaboration tree.
     * It enables or disables Add, Remove, and Update collaborator buttons
     * depending on which group the selectee is in
     *
     * @param {treeitem} selectedUser The selected element
     */
    setAdminButtonStates: function(selectedUser) {
        var button = btnChatCollaborator;
        if (!selectedUser.hasAttribute("idle")) {
            button.disable();
            return false;
        }

        var userId = selectedUser.getAttribute("uid");

        if (userId != this.myUserId) {
            if (apf.isTrue(selectedUser.getAttribute("online")))
                button.enable();
            else
                button.disable();
        }
        else {
            button.disable();
        }
    },
    getProjectUrl: function(encoded) {
        var u =  window.location.protocol + "//" + window.location.host + window.location.pathname;
        return encoded ? encodeURI(u) : u;
    },

    getShareUrl: function() {
        var userNode = this.model.queryNode('//user[@uid="' + window.cloud9config.uid + '"]');
        if(!userNode) {
            mnuCtxShare.hide();
            btnShareProject.hide();
            return;
        }
        var name     = userNode.getAttribute("fullname") || userNode.getAttribute("username");
        var subject  = escape("Nice! " + name + " wants to share this project with you: " + window.cloud9config.projectName);
        var body     = escape("Howdy, \n\n" + name + " would like you to join their Cloud9 IDE project online.\n\n" +
                       "Just click this link and you\'re all set: " + this.getProjectUrl() + "\n\n" +
                       "Don't have an account? Get one for free at signup.c9.io. It only takes a minute!\n\n" +
                       "See you there!\n\n" +
                       "c9.io | Code Smarter. Code Together.");
        return "mailto:?subject=" + subject + "&body=" + body;
    },

    setShareUrl: function(elId){
        var linkEl = typeof elId === "string" ? document.getElementById(elId) : elId;
        if (!linkEl)
            return;

        linkEl.href = this.getShareUrl();
        return false;
    },

    openWindow: function(service, url, width, height) {
        var windowOptions = "scrollbars=yes,resizable=yes,toolbar=no,location=yes";
        width = width || 550;
        height = height || 420;
        var winHeight = screen.height;
        var winWidth = screen.width;

        var left = Math.round((winWidth / 2) - (width / 2));
        var top = 0;

        if (winHeight > height)
            top = Math.round((winHeight / 2) - (height / 2));

        window.open(url, "share_" + service, windowOptions + ",width=" + width +
            ",height=" + height + ",left=" + left + ",top=" + top);
    },

    share: function(service) {
        var title = "Check out my project";
        var message = "Want to see what I'm coding? Check out my project at " +
            this.getProjectUrl() + " @cloud9ide";
        switch (service) {
            case "facebook":
                this.openWindow(service, "http://www.facebook.com/sharer/sharer.php?u=" +
                    this.getProjectUrl(true) + "&t=" + encodeURIComponent(title),
                    700, 410);
                break;
            case "googleplus":
                break;
            default:
            case "twitter":
                this.openWindow(service, "https://twitter.com/intent/tweet?text=" +
                    encodeURIComponent(message) + "&hashtags=happycoding&related=cloud9ide");
                break;
        }
        ide.dispatchEvent("track_action", {type: "share"});
    },

    /**
     *
     */
    popupPermissionMenu : function(e, uid) {
        if(!this.iAmAdmin || uid == this.myUserId)
            return;

        var _self = this;
        var target = e.currentTarget;
        var documentWidth = document.body.offsetWidth;
        var dropdownPos = apf.getAbsolutePosition(target);
        var dockPanelExpanded = Dock.layout.isExpanded(Dock.getButtons(this.extName, "collabMembers")[0].uniqueId) > -1;
        var menuOffsetTop = 1;
        var menuOffsetRight = !dockPanelExpanded ? 20 : -20;

        var menuPromote = mnuCtxPromoteCollab;
        var menuDemote  = mnuCtxDemoteCollab;
        if (treeCollaborators.selected.getAttribute("permissions") == "r") {
            if (!this.mnuCtxPromoteCollabWidth) {
                menuPromote.display(-1000, -1000);
                this.mnuCtxPromoteCollabWidth = menuPromote.getWidth();
                menuPromote.hide();

                setTimeout(function() {
                    menuPromote.display(documentWidth - menuOffsetRight - _self.mnuCtxPromoteCollabWidth -
                        target.offsetWidth, dropdownPos[1] + target.offsetHeight + menuOffsetTop);
                }, 100);
            }
            else {
                menuPromote.setWidth(this.mnuCtxPromoteCollabWidth);
                menuPromote.display(documentWidth - menuOffsetRight - this.mnuCtxPromoteCollabWidth -
                    target.offsetWidth, dropdownPos[1] + target.offsetHeight + menuOffsetTop, true);
            }
        }
        else {
            if (!this.mnuCtxDemoteCollabWidth) {
                menuDemote.display(-1000, -1000);
                this.mnuCtxDemoteCollabWidth = menuDemote.getWidth();
                menuDemote.hide();
                setTimeout(function() {
                    menuDemote.display(documentWidth - menuOffsetRight - _self.mnuCtxDemoteCollabWidth -
                        target.offsetWidth, dropdownPos[1] + target.offsetHeight + menuOffsetTop, true);
                }, 100);
            }
            else {
                menuDemote.setWidth(this.mnuCtxDemoteCollabWidth);
                menuDemote.display(documentWidth - menuOffsetRight - this.mnuCtxDemoteCollabWidth -
                    target.offsetWidth, dropdownPos[1] + target.offsetHeight + menuOffsetTop, true);
            }
        }
    },

    objectDiff: function(obj1, obj2, keepUnchanged) {
        var keys = Object.keys(obj1).concat(Object.keys(obj2));
        keys.makeUnique();

        var diff = {};
        var key, undef1, undef2;
        for (var i = 0, l = keys.length; i < l; ++i) {
            key = keys[i];
            undef1 = (typeof obj1[key] == "undefined");
            undef2 = (typeof obj2[key] == "undefined");
            if (
              // key added in obj2
              (undef1 && !undef2) ||
              // key changed in obj2
              (!undef1 && !undef2 && obj1[key] !== obj2[key]) ||
              // want to keep unchanged values
              (keepUnchanged && !undef1 && !undef2 && obj1[key] === obj2[key])
            ) {
                diff[key] = obj2[key];
            }
            //key removed or unchanged in obj2, we continue.
        }
        return diff;
    },

    destroy : function() {
        this.$disable();
        if (this.idleInterval)
            clearInterval(this.idleInterval);
    }
});

});
