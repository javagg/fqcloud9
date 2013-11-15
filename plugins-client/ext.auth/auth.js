/**
 * In App Authentication for Cloud9
 *
 * @copyright 2010, Ajax.org B.V.
 */
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var util   = require("core/util");
var skin = require("text!ext/auth/skin.xml");
var markup = require("text!ext/auth/auth.xml");
var skin = require("text!ext/auth/skin.xml");
var menus = require("ext/menus/menus");

require("ext/editors/editors");

var ServiceLut = {
    "github": {
        url: "/auth/github",
        width: 1000,
        height: 650
    },
    "facebook": {
        url: "/auth/facebook",
        width: 800,
        height: 460
    },
    "twitter": {
        url: "/auth/twitter",
        width: 800,
        height: 460
    },
    "google": {
        url: "/auth/google",
        width: 800,
        height: 460
    },
    "gae": {
        url: "/login/googleclientlogin",
        width: 600,
        height: 320
    },
    "bitbucket": {
        url: "/auth/bitbucket",
        width: 1050,
        height: 560
    }
},
def = "github",
winSignin, winListener, uid, username, context;

ide.infraEnv = true;

function winCloseCheck() {
    if (winSignin && !winSignin.closed)
        return;
    clearInterval(winListener);
}

module.exports = ext.register("ext/auth/auth", {
    dev         : "Ajax.org",
    name        : "Auth",
    alone       : true,
    type        : ext.GENERAL,
    skin        : skin,
    deps        : [],
    skin        : {
        id          : "authskin",
        data        : skin,
        "media-path": ide.staticPrefix + "/ext/auth/style/images/",
        "icon-path" : ide.staticPrefix + "/style/icons/"
    },
    markup      : markup,
    nodes : [],

    init: function(){
        vbMain.parentNode.appendChild(barAuth, vbMain);
        barAuth.show();
        
        if (ide.readonly) {
            auth.setAttribute("autostart", false);
            winLogin.hide();
            viewModeAction();
        }
        else {
            this.checkEmailSet();

            // 'auth' is a global AML element ID
            auth.addEventListener("authrequired", function(e){
                notLoggedIn();
            });
        }

        apf.setStyleClass(tabEditors.$ext, "infraeditor");
        
        stAuthReq.addEventListener("activate", function(e){
            notLoggedIn();
        });
            
        function notLoggedIn(){
            ide.loggedIn = false;
            if (ide.socket) {
                //ide.socket.disconnect();
                ide.dispatchEvent("logout");
            }
            viewModeAction();
        }
        
        function viewModeAction(){        
            if(!ide.loggedIn) {
                apf.addEventListener("mousedown", function(event){
                    var pNode   = event.amlNode;
                    while(pNode) {
                        if(pNode.id == "tabEditors") {
                            winSuggestSign.show();
                            return false;
                        }
                        pNode = pNode.parentNode;
                    }
                });
                setTimeout(function(){
                    apf.setStyleClass(vbMain.$ext, "not-loggedin");
                    self["view-mode-box-not-loggedin"].show();
                    vbMain.$ext.style.position = "absolute";
                    vbMain.$ext.style.top = "55px";
                    vbMain.$ext.style.left = "0";
                    vbMain.$ext.style.right = "0";
                    vbMain.$ext.style.bottom = "0";
                });
            }
            else {
                //we are logged in but in readonly mode
                ide.addEventListener("init.ext/collaborate/collaborate", function() {
                    ide.dispatchEvent("ext.auth/loggedinreadonly");
                });
            }
        }
        
        /**
         * Adds application links to the endmost toolbar.
         */
        function wrapElement(el) {
            var anchor = document.createElement("a");
            anchor.setAttribute("href", "javascript:void(0)");
            anchor.setAttribute("style", "color:transparent;text-decoration:none;border:0;display:block;");
            anchor.setAttribute("target", "_blank");
            el.parentNode.appendChild(anchor);
            anchor.appendChild(el);
        }

        this.nodes.push(
            menus.$insertByIndex(barExtras, new apf.button({
                id: "btnDashboard",
                width: "25",
                height: "25",
                skin: "c9-topbar-btn",
                "class": "dashboard",
                onclick: "window.open(apf.config.baseurl + '/dashboard.html');",
                tooltip: "Dashboard"
            }), 20),
            menus.$insertByIndex(barExtras, new apf.button({
                id: "btnHome",
                width: "25",
                height: "25",
                skin: "c9-topbar-btn",
                "class": "home",
                onclick: "window.open(apf.config.baseurl)",
                tooltip: "Homepage"
            }), 21)
        );
        
        //@todo fire this event;
        ide.addEventListener("login", function(e){
            ide.loggedIn = true;
            //ide.socket.socket.connect();
        });

        ide.addEventListener("socketMessage", function(e){
            if (e.message.type == "collabauth") {
                if (e.message.subtype == "accessgranted") {
                    var rw = e.message.acl == "rw" ? "read-write" : "read-only";
                    util.alert("Access Granted", "Access Granted",
                        "You have been granted " + rw + " access to this project. Click OK to reload the IDE.",
                        function() {
                            window.location.reload();
                        }
                    );
                }
                else if (e.message.subtype == "accessdenied") {
                    util.alert("Access Denied", "Access Denied",
                        "The owner of the project has declined you permission to access this project. " +
                        "Press OK to return to the dashboard.",
                        function() {
                            window.location.replace("//" + window.location.host + "/dashboard.html");
                        }
                    );
                }
            }
            else if (e.message.type == "error" && e.message.code == 401) {
                auth.authRequired();
            }
        });
    },

    checkEmailSet: function() {
        apf.ajax("/api/context/getemail", {
            method: "get",
            callback: function(data, state, extra) {
                if (!data)
                    winModalEmail.show();
            }
        });
    },

    setEmail: function(email) {
        btnEmailSet.setAttribute("disabled", true);
        apf.ajax("/api/context/setemail", {
            method: "post",
            data: "email=" + encodeURIComponent(email),
            contentType: "application/x-www-form-urlencoded",
            callback: function(data, state, extra) {
                btnEmailSet.setAttribute("disabled", false);

                if (state !== apf.SUCCESS) {
                    divEmailSetHeader.$ext.style.display = "none";
                    divEmailSetText.$ext.style.display = "none";
                    lblEmailSetError.setAttribute("caption", extra.data);
                    return;
                }
                winModalEmail.hide();
                window.cloud9config.setemail = false;
            }
        });
    },

    onDashboardLinkClick: function(e, button) {
        if (window.opener && !window.opener.closed && !apf.isGecko) {
            button.$ext.parentNode.removeAttribute("target");
            button.$ext.parentNode.setAttribute("href", "javascript:window.opener.focus()");
        }
        else {
            button.$ext.parentNode.setAttribute("target", "_blank");
            button.$ext.parentNode.setAttribute("href", apf.config.baseurl + "/dashboard.html");
        }
    },

    onHomeLinkClick: function(e, button) {
        button.$ext.parentNode.setAttribute("target", "_blank");
        button.$ext.parentNode.setAttribute("href", apf.config.baseurl);
    },

    register : function() {
        var data = "firstname=" + tbRgFirstName.getValue() +
                   "&lastname=" + tbRgLastName.getValue() +
                   "&email="    + tbRgEmail.getValue() +
                   "&username=" + tbRgUsername.getValue() +
                   "&password=" + tbRgPassword.getValue();
                   
        apf.ajax("/auth/create", {
            method: "post",
            data: data,
            contentType: "application/x-www-form-urlencoded",
            callback: function(data, state, extra) {
                btnRgSubmit.enable();
                
                if (state != apf.SUCCESS)
                    return util.alert("Registration failed", "", "Error:\n" + extra.data);

                pgPass.set("login");
            }
        });
    },

    googleClientLogin: function() {
        var service = ServiceLut["gae"];
        var screenHeight = screen.height;
        var left = Math.round((screen.width / 2) - (service.width / 2));
        var top = 0;
        if (screenHeight > service.height)
            top = Math.round((screenHeight / 2) - (service.height / 2))

        winSignin = window.open(service.url, "gaesignin",
            "left=" + left + ",top=" + top + ",width=" + service.width + ",height=" + service.height +
            ",personalbar=0,toolbar=0,scrollbars=1,resizable=1"
        );

        winListener = setInterval(winCloseCheck, 1000);
        if (winSignin)
            winSignin.focus();
    },

    signin : function(service, email) {
        var service = ServiceLut[service || def];
        var screenHeight = screen.height;
        var left = Math.round((screen.width / 2) - (service.width / 2));
        var top = 0;
        if (screenHeight > service.height)
            top = Math.round((screenHeight / 2) - (service.height / 2))

        winSignin = window.open(apf.host + service.url, "cloud9signin",
            "left=" + left + ",top=" + top + ",width=" + service.width + ",height=" + service.height +
            ",personalbar=0,toolbar=0,scrollbars=1,resizable=1"
        );

        winListener = setInterval(winCloseCheck, 1000);
        if (winSignin)
            winSignin.focus();
    },

    login : function(username, password, inIde) {
        apf.ajax("/auth/login", {
            method: "post",
            data: "username=" + username + "&password=" + password,
            contentType: "application/x-www-form-urlencoded",
            callback: function(data, state, extra) {
                if (state != apf.SUCCESS) {
                    auth.loggedIn = false;
                    return util.alert("Login failed", "", "Error:\n" + extra.data);
                }
                
                if(inIde) {
                    winLogin.hide();
                    window.location.reload();
                }
                else {
                    self["stSignedIn"].activate();
                    ide.dispatchEvent("login");
                }
            }
        });
    },

    signout : function() {
        apf.ajax("/auth/signout", {
            method: "post",
            data: null,
            callback: function(data, state, extra) {
                try {
                    data = JSON.parse(data);
                }
                catch(ex) {
                    data = {result: true};
                }
        
                uid = username = context = null;
            }
        });
    },

    signinCallback : function(service, success, projects, blob, activecontext, contexts, members, msg, origin) {
        clearInterval(winListener);
        if (origin && origin == "link") {
            if (!success)
                return util.alert("Login failed", "", "Error:\n" + msg);
            self["stSignedIn"].activate();
            ide.dispatchEvent("login");
        }
        else {
            if (success) {
                self["stSignedIn"].activate();
                ide.dispatchEvent("login");
            }
            else {
                //display error
                return util.alert("Login failed", "", "Error:\n" + msg);
            }
        }
    },

    signedIn : function() {
        winLogin.hide();
    },

    idle : function() { }
});

});
