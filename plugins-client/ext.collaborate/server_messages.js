define(function(require, exports, module) {

var util = require("core/util");
var UserStates = require("./user_states");
var AccesRequests = require("./access_requests");

exports.onServerMessage = function(collab, msg) {
    //console.log("RECEIVE COLLAB MESSAGE: " + JSON.stringify(msg));

    switch (msg.channel) {
        case "user/handshake":
            if (collab.cancelled)
                break;

            this.onHandshakeSetup(collab, msg);
            collab.handshaked = true;
            break;
        case "workspace/addmember":
            UserStates.addUser(collab, msg.state, "workspace");
            break;
        case "workspace/removemember":
            UserStates.removeUser(collab, msg, "workspace");
            break;
        case "workspace/updatemember":
            if (!msg.state)
                msg.state = msg;
            if (!msg.state.name)
                msg.state.name = msg.name;
            if (!msg.state.fullname)
                msg.state.fullname = msg.fullname;
            UserStates.updateUserXml(collab, msg.state, msg.previousstate, msg);
            break;
        case "error":
            AccesRequests.onServerMessage(collab, msg);
            break;
    }
};

exports.onHandshakeSetup = function(collab, msg) {
    treeCollaborators.enable();
    collab.model.removeXml("group/*");

    collab.myUserId = msg.uid;
    collab.ownerUid = msg.ownerUid;
    collab.iAmOwner = (msg.uid == msg.ownerUid);
    collab.pid = msg.pid;
    collab.myWorkspace = msg.workspaceId;
    collab.projectType = msg.projectType || "user";
    collab.source = msg.source;
    collab.visibility = msg.visibility;
    collab.users = {};
    (msg.members || []).forEach(function(user) {
        collab.users[user.uid] = user;
    });

    UserStates.assembleMdlCollaborators(collab, msg.rooms);

    if (collab.handshaked)
        return;

    if (collab.visibility === "private") {
        mnuCtxPromoteCollab.appendChild(
            new apf.item({
                onclick : function() {
                    AccesRequests.remove();
                },
                caption : "Remove From Project"
            })
        );

        mnuCtxDemoteCollab.appendChild(
            new apf.item({
                onclick : function() {
                    AccesRequests.remove();
                },
                caption : "Remove From Project"
            })
        );
    }
};

});
