/**
 * Openshift module for the Cloud9 IDE
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
/*global require module console apf btnAddDeployOpenshift hboxOpenshift 
openshiftSigninSubmit errServiceSignin mdlOpenshiftApps
lstOpenshiftApps mdlOpenshiftUserState mdlOpenshiftAccount mdlOpenshiftCartridges
mwDeployTarget tbDeployNameOpenshift
*/

"no use strict";

define(function(require, exports, module) {

var ide    = require("core/ide");
var ext    = require("core/ext");
var util   = require("core/util");
var deploy = require("ext/deploy/deploy");
var css    = require("text!ext/openshift/style/style.css");
var markup = require("text!ext/openshift/openshift.xml");

module.exports = ext.register("ext/openshift/openshift", {
    name    : "Openshift",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    deps    : [deploy],
    alone   : true,
    offline : false,
    css     : css,

    nodes : [],

    /**
     * augments ext/deploy/deploy.js with these methods
     */
    augment: ["parseDeployOpenshift"],

    init: function(amlNode) {
        apf.importCssString(this.css || "");

        var that = this;
        this.augment.forEach(function(methodName) {
            deploy[methodName] = that[methodName];
        });

        var deployLoaded = function() {
            that.loadMarkup(function() {});
        };

        if (typeof hboxOpenshift !== "undefined") {
            deployLoaded();
        }
        else {
            ide.addEventListener("ext:ready", function(ext) {
                if (ext === deploy) {
                    deployLoaded();
                }
            });
        }
        
        ide.addEventListener("socketMessage", function (ev) {
            that.onMessage(ev.message);
        });
    },
    
    onMessage: function(msg) {
        if (msg.command !== "provision" || msg.type !== "call-method")
            return;

        if (msg.target !== "openshift")
            return;
            
        var callback = this._callbacks[msg.extra];
        if (!callback)
            return console.error("Could not find callback for message", msg);
                    
        if (!msg.success) {
            console.log("Call method on " + msg.target + " yielded an error: ", msg.err, msg);
            return callback(msg.err, msg);
        }
        
        callback(null, msg.response);
    },
    
    _callbacks: {},
    _callbackId: 1,
    rpc: function(name, args, callback) {
        if (!callback)
            return this.rpc(name, [], args);
            
        var callbackId = this._callbackId++;
        this._callbacks[callbackId] = callback;
        ide.send({
            command: "provision",
            type: "call-method",
            target: "openshift",
            method: name,
            args: args || [],
            extra: callbackId
        });
    },
    
    ping: function() {
        this.rpc("ping", function(err, pong) {
            console.log("PING", arguments); 
        });
    },

    loadMarkup: function(callback) {
        var that = this;
        // Adding openshift section markup
        var options = {
            callback: function(inserted) {
                var childNodes = inserted.amlNode.childNodes;
                childNodes.shift();
                var insertedXmlNodes = childNodes.map(function(n) {
                    return n.$aml;
                });
                that.nodes = that.nodes.concat(insertedXmlNodes);
                that.initOpenshift();

                callback();
            }
        };
        hboxOpenshift.insertMarkup(markup, options);
    },
    
    setState: function(state) {
        this.prevState = mdlOpenshiftUserState.data.getAttribute("value");
        apf.xmldb.setAttribute(mdlOpenshiftUserState.data, "value", state);
    },
    
    _setInitMessage: function(msg) {
        apf.xmldb.setAttribute(mdlOpenshiftUserState.data, "initmsg", msg);
    },
    
    initOpenshift: function() {
        var that = this;
        
        this.setState("init");
        
        this._setInitMessage("Fetching account data ...");
        this.rpc("account", [], function(err, account) {
            if (err) return that.onError(err);
            
            that._parseAccount(account);
            
            that._setInitMessage("Fetching available cartridges ...");
            // that.rpc("cartridges", [], function(err, cartridges) {
            //     if (err) return that.onError(err);
                
            //     that._parseCartridges(cartridges);
                that._parseCartridges([
                    { id: "nodejs-0.6", desc: "Node.js 0.6", type: "web"},
                    { id: "diy-0.1", desc: "Do-It-Yourself 0.1", type: "web"},
                    { id: "ruby-1.8", desc: "Ruby 1.8", type: "web"},
                    { id: "ruby-1.9", desc: "Ruby 1.9", type: "web"}
                ]);
                
                that._setInitMessage("Loading applications ...");
                that.rpc("apps", function(err, apps) {
                    if (err) return that.onError(err);
            
                    that._parseUserApps(apps);
                    that.setState("list");
                });
            // });
        });
    },
    
    _parseAccount: function(account) {
        mdlOpenshiftAccount.load(util.toXmlTag("account", {
            "allowes_gears": account["Gears Allowed"],
            "plan": account.Plan,
            "ssl": account["SSL Certificates Supported"],
            "login": account.Login
        }));    
    },
    
    _parseCartridges: function(cartridges) {
        var nodes = cartridges
            .filter(function(cartridge) {
                return !cartridge.pay && cartridge.type == "web";
            })
            .map(function(cartridge) {
                return util.toXmlTag("cartridge", cartridge);
            });
        
        mdlOpenshiftCartridges.load("<cartridges>" + nodes.join("") + "</cartridges>");    
    },
    
    _parseUserApps: function(apps) {
        var nodes = [];
        apps.forEach(function(app) {
            nodes.push(util.toXmlTag("app", {
                name: app,
                caption: app
            }));
        });
        mdlOpenshiftApps.load("<apps>" + nodes.join("") + "</apps>");
    },
    
    signin: function(email, pass) {
        var that = this;

        errServiceSignin.hide();
        openshiftSigninSubmit.disable();

        this.rpc("signin", [email, pass], function(err) {
            openshiftSigninSubmit.enable();
            
            if (err && err.code == 401)
                return that._signedOut(true);
                
            if (err)
                return that.onError(err);
                
            that.initOpenshift();
        });
    },

    signout: function() {
        var that = this;
        
        that._setInitMessage("Signing out ...");
        that.setState("init");
        
        this.rpc("signout", function(err) {
            that._signedOut();
            if (err) return that.onError(err);
        });
    },
    
    _signedOut: function(authError) {
        if (authError)
            errServiceSignin.show();
            
        mdlOpenshiftApps.load("<apps />");
        this.setState("signin");
    },
    
    createNamespace: function(name, callback) {
        var that = this;    
        this.rpc("createDomain", [name], function(err) {
            if (err)
                return that.onError(err, callback);
                
            that.setState(that.prevState || "list");
        });
    },
    
    onError: function(err, callback) {
        if (!callback && typeof err === "function") {
            callback = err;
            err = null;
        }
        if (err && err.code == 401)
            this._signedOut();
        else if (err && err.code == 412 && err.message == "no namespace")
            this.setState("namespace");
        else if (err) {
            if (err.message)
                err = err.message;
            if (typeof err !== "string")
                err = JSON.stringify(err);
            util.alert("Openshift error", "", err);
        }

        (typeof callback === "function") && callback();
    },

    addApp: function() {
        this.setState("create");
    },

    removeApp: function() {
        var that = this;
        if (lstOpenshiftApps.selected) {
            var name = lstOpenshiftApps.selected.getAttribute('caption');
            apf.xmldb.removeNode(lstOpenshiftApps.selected);
            
            // this.rpc("destroy", [name], function(err) {
            //     if (err) that.onError(err);
            // });
        }
    },

    createDeploy: function(name, type, callback) {
        var that = this;
        deploy.createDeploy(name, {
            appName: name
        }, function(err, deployId) {
            
            setTimeout(function() {
                deploy.getDeploys();
            }, 500);
            
            that.rpc("createInstance", [deployId, name, type], function(err) {
                if (err) {
                    trDeploy.select(mdlServers.queryNode('group/server[@did="' + deployId + '"]'));
                    deploy.cancelDeploy();    
                    setTimeout(function() {
                        mnuDeploy.hide();
                    }, 10);
                    that.onError(err, callback);
                    return;
                }
                deploy.getDeploys();
                callback();
            });
        });
    },
    
    createGear: function(name, type) {
        var that = this;
        console.log("creating gear", name, type);
        btnAddDeployOpenshift.disable();
        this.rpc("exists", [name], function(err, exists) {
            btnAddDeployOpenshift.enable();
            
            if (err) return that.onError(err);
            if (exists)
                return that.onError("This app name is already taken. "
                    + "Please, choose a different name and try again.");
            
            var app = apf.getXml('<app/>');
            app.setAttribute("name", name);
            app.setAttribute("caption", name);
            
            apf.xmldb.appendChild(mdlOpenshiftApps.data, app);
            mwDeployTarget.hide();
            tbDeployNameOpenshift.setAttribute("value", "");
            that.setState("list");
            that.createDeploy(name, type, function() {});
        });
    },

    parseDeployOpenshift: function(deployData) {
        var d = deployData;
        var remote = deployData.remote || {metadata: {}};
        var since = remote.date_add ? (new Date(parseInt(remote.date_add, 10))).toString("dd/MM/yyyy") : "n/a";

        return apf.n("<server />")
            .attr("name", remote.metadata.appName || d.name || "")
            .attr("did", d.did || "")
            .attr("state", d.state || "")
            .attr("since", since || "")
            .attr("type", d.type || "")
            .attr("appName", remote.metadata.appName || d.name || "")
            .attr("appUrl", remote.metadata.url || "")
            .attr("busy", d.busy || "")
            .node().xml;
    }

});

});
