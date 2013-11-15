define(function(require, exports, module) {

var collab = function() {
    return require("./collaborate");
};

var ide = require("core/ide");
var Util = require("core/util");

exports.onServerMessage = function(collab, msg) {
    console.log("ACCESS REQ MESSAGE", typeof msg, msg);
    switch (parseInt(msg.code, 10)) {
        case 403:
        case 426:
            trFiles.disable();
            trFiles.load("");
            collab.cancelHandshake(msg.from);
            // Accessing a private project while not logged in: login first please!
            if(!ide.loggedIn) {
                ide.addEventListener("login", function() {
                    location.reload();
                });
                return winLogin.show();
            }
            Util.confirm("Request Access", "Request Access",
                "You are not a member of this project. Do you want to request access?",
                function() {
                    // Confirmed, send off request
                    collab.send({
                        channel: "workspace/request_access"
                    });
                    Util.alert("Request Sent",
                        "Your request has been sent",
                        "Click Ok to return to the dashboard, or wait for a response from the moderator", function() {
                            exports.returnToDashboard();
                        }
                    );
                }, function() {
                    exports.returnToDashboard();
                }
            );
            break;
        case 420:
            collab.cancelHandshake(msg.from);
            winPendingRequest.setAttribute("pid", msg.pid);
            winPendingRequest.setAttribute("uid", msg.uid);
            winPendingRequest.show();
            break;
        default:
            console.log("case not handled by collab:",msg);
            break;
    }
};

exports.cancelPendingRequest = function() {
    collab().send({
        channel: "workspace/request_access_cancel"
    });
    return Util.alert("Request Cancelled",
        "Your project request has been cancelled",
        "Click Ok to return to the dashboard", function() {
            exports.returnToDashboard();
        }
    );
};

exports.returnToDashboard = function(showplans) {
    showplans = !showplans ? "" : "#plans";
    if (window.opener && !window.opener.closed && !apf.isGecko) {
        window.opener.focus();
        window.close();
    }
    else
        window.location.href = apf.config.baseurl + "/dashboard.html" + showplans;
};

exports.cancelProjectInvite = function(e, uid) {
    e.preventDefault();

    collab().send({
        channel: "workspace/invite_cancel"
    });
    collab().model.removeXml("group[@name='pending']/user[@uid='" + uid + "']");
};

exports.deny = function(e, uid) {
    e.preventDefault();

    collab().send({
        channel: "workspace/access_request_deny",
        uid: uid
    });
};

exports.acceptReadWrite = function(e, uid) {
    e.preventDefault();
    collab().send({
        channel: "workspace/access_request_accept",
        uid: uid,
        acl: collab().ACL_RW
    });
},

exports.acceptRead = function(e, uid) {
    e.preventDefault();
    collab().send({
        channel: "workspace/access_request_accept",
        uid: uid,
        acl: collab().ACL_R
    });
};

exports.promote = function() {
    var uid = treeCollaborators.selected.getAttribute("uid");
    collab().send({
        channel: "workspace/updatemember",
        uid: uid,
        state: {
            role: collab().ROLE_COLLABORATOR,
            acl: collab().ACL_RW
        }
    });

    mnuCtxPromoteCollab.hide();
};

exports.demote = function() {
    var uid = parseInt(treeCollaborators.selected.getAttribute("uid"), 10);
    var user = collab().users[uid];
    var isPrivate = collab().visibility == "private";
    if (isPrivate && user && user.acl == collab().ACL_R)
        return exports.remove();

    Util.confirm("Revoke Read+Write Access",
        "Confirm Revoke Read+Write Access",
        "Are you sure you want to revoke this collaborator&apos;s read+write access? " +
        "They will be in a read-only state as a visitor.",
        function() {
            collab().send({
                channel: "workspace/updatemember",
                uid: uid,
                state: {
                    role: isPrivate ? collab().ROLE_COLLABORATOR : collab().ROLE_VISITOR,
                    acl: collab().ACL_R
                }
            });
        }
    );

    mnuCtxDemoteCollab.hide();
};

exports.updatePermissions = function(user) {
    collab().send({
        channel: "workspace/updatemember",
        uid: user.getAttribute("uid"),
        state: {
            acl: user.getAttribute("permissions")
        }
    });
};

exports.remove = function() {
    Util.confirm("Remove Collaborator",
        "Confirm Remove Collaborator",
        "Are you sure you want to remove this collaborator? They will no longer " +
        "be able to access this project.",
        function() {
            var uid = treeCollaborators.selected.getAttribute("uid");

            collab().send({
                channel: "workspace/removemember",
                uid: uid,
                state: {
                    role: collab().visibility == "private" ? collab().ROLE_COLLABORATOR : collab().ROLE_VISITOR,
                    acl: collab().ACL_R
                }
            });
        }
    );
};

});
