define(function(require, exports, module) {

var GroupTypes = {
    "pending" : '<group type="group" name="pending" ' +
                  'caption="Read+Write Requests" users_total="0">',
    "members" : '<group type="group" name="members" caption="Members"' +
                ' num_users="0" users_total="0">',
    "visitors" : '<group type="group" name="visitors" caption="Visitors"' +
                ' num_users="0" users_total="0">',
    "room" : '<group type="group" name="room" roomid="[%roomid%]" caption="Project ' +
                'Cloners" num_users="0" users_total="0">'
};

function isMember(collab, uid) {
    if (uid === collab.myUserId)
        return true;
    return !!collab.users[uid];
}

function isPending(collab, user) {
    return !!user.status && (user.status === collab.COLLABSTATE_PENDING_USER ||
        user.status === collab.COLLABSTATE_PENDING_ADMIN);
}

function isVisitor(collab, user) {
    return !!user.role && user.role === collab.ROLE_VISITOR;
}

function refreshIde(collab) {
    window.location.href = window.location.href;
}

exports.updateUserXml = function(collab, state, previous, message) {
    if (!state || !previous)
        return;

    var diff = collab.objectDiff(previous, state);
    var nodes = collab.model.queryNodes("//user[@uid='" + state.uid + "']");
    var search = message.workspaceId != collab.myWorkspace ? "room" : null;
    var name, node;
    if (nodes && nodes.length) {
        for (var i = 0, l = nodes.length; i < l; ++i) {
            name = nodes[i].parentNode.getAttribute("name");
            if (search) {
                if (name != search)
                    continue;
            }
            else if (name != "room" && name != "visitors" && name != "members" && name != "pending")
                continue;
            node = nodes[i];
            break;
        }
    }
    if (node) {
        if (typeof diff.online != "undefined")
            apf.xmldb.setAttribute(node, "online", state.online ? "1" : "0");
        if (typeof diff.idle != "undefined")
            apf.xmldb.setAttribute(node, "idle", state.idle);
        if (diff.acl)
            apf.xmldb.setAttribute(node, "permissions", state.acl);
        if (diff.role)
            apf.xmldb.setAttribute(node, "role", state.status);
        if (diff.status)
            apf.xmldb.setAttribute(node, "pending", state.status);

        var groupNode;
        if (name != "room") {
            if (isPending(collab, diff))
                groupNode = collab.model.queryNode("group[@name='pending']");
            else if (isVisitor(collab, diff))
                groupNode = collab.model.queryNode("group[@name='visitors']");
            else
                groupNode = collab.model.queryNode("group[@name='members']");
        }

        if (groupNode)
            apf.xmldb.appendChild(groupNode, node);

        // hack: redraw tree
        treeCollaborators.reload();
    }
    else {
        exports.addUser(collab, state, "workspace");
    }

    // if the permissions changed, the IDE needs to be reloaded to boot up with
    // the correct state.
    if (state.uid == collab.myUserId && (diff.acl || diff.role || diff.status))
        refreshIde(collab);
};

exports.addUser = function(collab, user, origin) {
    var section = "room";
    if (origin == "workspace") {
        if (isPending(collab, user))
            section = "pending";
        else if (isVisitor(collab, user))
            section = "visitors";
        else
            section = isPending(collab, user) ? "pending" : "members";
    }

    var node = collab.model.queryNode("group[@name='" + section + "']/user[@uid='" + user.uid + "']");
    if (node || !collab.model.data.getElementsByTagName("group").length)
        return;

    var xml = apf.getXml(this.createUserXml(collab, user, origin == "workspace" ? collab.myWorkspace : null));

    // if the group (parent node) doesn't exist, create it.
    var root = collab.model.data;
    var group = root.selectSingleNode("group[@name='" + section + "']");
    if (!group)
        group = apf.xmldb.appendChild(root, apf.getXml(GroupTypes[section] + "</group>"));
    apf.xmldb.appendChild(group, xml);
    if (section == "members")
        collab.users[user.uid] = user;
    // hack: redraw tree
    treeCollaborators.reload();
};

exports.removeUser = function(collab, user, type) {
    // if the permissions changed, the IDE needs to be reloaded to boot up with
    // the correct state.
    if (user.uid == collab.myUserId)
        return refreshIde(collab);

    var nodes = collab.model.queryNodes("//user[@uid='" + user.uid + "']");
    if (!nodes || !nodes.length || !collab.model.data.getElementsByTagName("group").length)
        return;

    for (var i = nodes.length - 1; i >= 0; --i) {
        if (type != "room" && nodes[i].parentNode.getAttribute("name") == "room")
            continue;
        apf.xmldb.removeNode(nodes[i]);
    }
};

exports.assembleMdlCollaborators = function(collab, rooms) {
    var isPrivateProject = (collab.visibility == "private");
    var strMdlCollaborators = "<groups>";
    var projectMembers = [];
    var pendingUsers = "";
    var projectVisitors = "";

    // Assemble pending users, project members, and project visitors
    var _self = this;
    var user;
    for (var uid in collab.users) {
        user = collab.users[uid];
        if (isPending(collab, user)) {
            pendingUsers += this.createUserXml(collab, user, collab.myWorkspace);
        }
        else {
            var userXml = this.createUserXml(collab, user, collab.myWorkspace);
            // If this is a visitor in a public project
            if (isVisitor(collab, user)) {
                projectVisitors += userXml;
            }
            else {
                if(collab.ownerUid == user.uid)
                    projectMembers.unshift(userXml);
                else
                    projectMembers.push(userXml);
            }
        }
    }

    if (isPrivateProject)
        strMdlCollaborators += GroupTypes.pending + pendingUsers + "</group>";

    strMdlCollaborators += GroupTypes.members + projectMembers.join("") + "</group>";

    // We put these visitor users here merely for group ordering
    if (!isPrivateProject)
        strMdlCollaborators += GroupTypes.visitors + projectVisitors + "</group>";

    rooms.forEach(function(room) {
        if (room.name == collab.source) {
            strMdlCollaborators += GroupTypes.room.replace("[%roomid%]", room.name);

            room.members.forEach(function(user) {
                if (user.uid === collab.myUserId)
                    return;

                strMdlCollaborators += _self.createUserXml(collab, user, collab.myWorkspace);
            });

            strMdlCollaborators += "</group>";
        }
    });

    strMdlCollaborators += "</groups>";
    collab.model.load(apf.getXml(strMdlCollaborators));
};

exports.createUserXml = function(collab, user, context_filter) {
    var user_num = 0;
    var permissions = "";
    var state = collab.COLLABSTATE_PENDING_NONE;

    if (context_filter == collab.myWorkspace) {
        // If this is us, get our permissions and enable features accordingly
        if (user.uid == collab.myUserId) {
            if (user.role == collab.ROLE_ADMIN)
                collab.iAmAdmin = true;
        }
        permissions = user.acl;
        state = user.status;
    }

    if (!user.role || user.acl != collab.ACL_RW)
        user.color = false;

    if (!user.fullname)
        user.fullname = user.name;

    // anonymous access support:
    if (String(user.uid).indexOf("anon_") > -1)
        user.name = user.fullname = user.uid.substr(0, 11);

    user.color = collab.getUserColor(user);

    var unique = "0";
    if (!user.alreadyUnique && user.online) {
        user.alreadyUnique = true;
        unique = "1";
    }

    return '<user online="' + (user.online ? "1" : "0") +
        '" type="user' +
        '" unique="' + apf.escapeXML(unique) +
        '" context="' + apf.escapeXML(context_filter) +
        '" status="' + apf.escapeXML(state) +
        '" idle="' + apf.escapeXML(user.idle) +
        '" uid="' + apf.escapeXML(user.uid) +
        '" user_num="' + apf.escapeXML(user_num) +
        '" color="' + apf.escapeXML(user.color || "transparent") +
        '" username="' + apf.escapeXML(user.name) +
        '" permissions="' + apf.escapeXML(permissions) +
        '" fullname="' + apf.escapeXML(user.fullname) +
        '" caption="' + apf.escapeXML(user.uid == collab.myUserId ? "Me" : user.fullname) +
        '" pending="' + apf.escapeXML(state) +
        '" owner="' + (collab.ownerUid == user.uid) +
        '" email="' + apf.escapeXML(user.email || "") +
        '" md5_email="' + apf.escapeXML(user.email ? apf.crypto.MD5.hex_md5(user.email.trim().toLowerCase()) : "") +
        '" />';
};

});
