/**
 * Heroku module for the Cloud9 IDE
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var ide    = require("core/ide");
var ext    = require("core/ext");
var util   = require("core/util");
var deploy = require("ext/deploy/deploy");
var css    = require("text!ext/heroku/style/style.css");
var markup = require("text!ext/heroku/heroku.xml");

module.exports = ext.register("ext/heroku/heroku", {
    name    : "Heroku",
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
    augment: ["parseDeployHeroku"],

    init: function(amlNode) {
        apf.importCssString(this.css || "");

        var _self = this;
        this.augment.forEach(function(methodName) {
            deploy[methodName] = _self[methodName];
        });

        var deployLoaded = function() {
            _self.loadMarkup(function() {
                btnAddDeployHeroku.disable();
            });
        }

        if (typeof hboxHeroku !== "undefined") {
            deployLoaded();
        }
        else {
            ide.addEventListener("ext:ready", function(ext) {
                if (ext === deploy) {
                    deployLoaded();
                }
            });
        }
    },

    loadMarkup: function(callback) {
        // Adding heroku section markup
        var options = {
            callback: function(inserted) {
                var childNodes = inserted.amlNode.childNodes;
                childNodes.shift();
                var insertedXmlNodes = childNodes.map(function(n) {
                    return n.$aml;
                });
                this.nodes = this.nodes.concat(insertedXmlNodes);
                this.signinChecking();

                this.setupModelEvents();
                herokuSignin.setProperty("visible", true);

                callback();
            }.bind(this)
        };
        hboxHeroku.insertMarkup(markup, options);
    },

    signinChecking: function() {
        var _self = this;

        apf.ajax("/api/provision/heroku/signedin", {
            method: "get",
            callback: function(data, state, extra) {
                if (state != apf.SUCCESS)
                    return;

                _self.getUserApps(_self.hideSignin);
            }
        });
    },

    signin: function(email, pass) {
        var _self = this;
        var caption = herokuSigninSubmit.getProperty("caption");

        errServiceSignin.hide();
        herokuSigninSubmit.disable();
        herokuSigninSubmit.setProperty("caption", "In progress..");

        apf.ajax("/api/provision/heroku/signin", {
            method: "post",
            data: "email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(pass),
            callback: function(data, state, extra) {
                if (state != apf.SUCCESS) {
                    errServiceSignin.show();
                    herokuSigninSubmit.enable();
                    herokuSigninSubmit.setProperty("caption", caption);
                    return;
                }

                data = JSON.parse(data);
                if (data.auth) {
                    _self.getUserApps(function() {
                        _self.hideSignin();
                        herokuSigninSubmit.enable();
                        herokuSigninSubmit.setProperty("caption", caption);
                    });
                } else {
                    _self.onError(function() {
                        herokuSigninSubmit.enable();
                        herokuSigninSubmit.setProperty("caption", caption);
                    });
                }
            }
        });
    },

    signout: function() {
        var _self = this;
        var caption = herokuSigninSubmit.getProperty("caption");
        herokuSigninSubmit.disable();
        herokuSigninSubmit.setProperty("caption", "In progress..");

        apf.ajax("/api/provision/heroku/signout", {
            method: "post",
            callback: function(data, state) {
                herokuSigninSubmit.enable();
                herokuSigninSubmit.setProperty("caption", caption);

                if (state != apf.SUCCESS)
                    return _self.onError(data);

                _self.showSignin();
            }
        });
    },

    showSignin: function() {
        herokuListing.setProperty("visible", false);
        herokuSignin.setProperty("visible", true);
        herokuSigninForm.setProperty("visible", false);
        herokuSigninStart.setProperty("visible", true);
        btnAddDeployHeroku.disable();
        herokuSigninEmail.clear();
        herokuSigninPass.clear();
    },

    onError: function(data, callback) {
        if (!callback && typeof data === "function") {
            callback = data;
            data = null;
        }
        if (data)
            util.alert("Heroku error", "", typeof data === "string" ? data : JSON.stringify(data));

        (typeof callback === "function") && callback();
    },

    getUserApps: function(callback) {
        var _self = this;
        apf.ajax("/api/provision/heroku/apps", {
            method: "get",
            data: "",
            callback: function(data, state, extra) {
                if (state != apf.SUCCESS)
                    return _self.onError(data, callback);

                var apps = JSON.parse(data);

                if (apps) {
                    _self.parseUserApps(apps);
                    (typeof callback === "function") && callback();
                }
             }
         });
    },

    parseUserApps: function(apps) {
        var nodes = [];
        apps.forEach(function(app) {
            nodes.push(util.toXmlTag("app", {
                name: app.name,
                caption: app.name,
                stack: app.stack
            }));
        });
        mdlHerokuApps.load("<apps>" + nodes.join("") + "</apps>");
    },

    displaySignin: function() {
        herokuSigninStart.setProperty("visible", false);
        herokuSigninForm.setProperty("visible", true);
        herokuSigninEmail.focus();
    },

    hideSignin: function() {
        herokuSignin.setProperty("visible", false);
        herokuListing.setProperty("visible", true);
        lstHerokuApps.reselect();
        btnAddDeployHeroku.enable();
    },

    addApp: function() {
//        if (this.app) {
//            lstHerokuApps.select(lstHerokuApps.queryNode("app[@new]"));
//            lstHerokuApps.startRename(this.app);
//        } else {

        btnHerokuAddNewApp.disable();

        var newNodes = mdlHerokuApps.queryNodes('app[@new]');
        this.app     = apf.getXml('<app name="" caption="Untitled" new="' + (newNodes.length + 1) + '" />');
        apf.xmldb.appendChild(mdlHerokuApps.data, this.app, newNodes[0])

        setTimeout(function(){
            var newNode = mdlHerokuApps.queryNode('app[@new="' + (newNodes.length + 1) + '"]');
            lstHerokuApps.select(newNode);
            lstHerokuApps.startRename(newNode);
        }, 100);
//        }
    },

    removeApp: function() {
        if(lstHerokuApps.selected) {
            apf.xmldb.removeNode(lstHerokuApps.selected)
            this.app = null;
            btnHerokuAddNewApp.enable();
        }
    },

    checkAppName: function(name) {
        var _self = this;
        btnAddDeployHeroku.disable();
        apf.ajax("/api/provision/heroku/apps/check", {
            method: "post",
            data: "appName=" + name,
            callback: function(data, state, extra) {
                btnAddDeployHeroku.enable();
                btnHerokuAddNewApp.enable();
                if (state != apf.SUCCESS)
                    return _self.onError(data);
             }
         });
    },

    setupModelEvents: function() {
        var _self = this;
        mdlHerokuApps.addEventListener("update", function(event) {
            var data = event.undoObj && event.undoObj.args;
            if (!data)
                return;

            var elem = data[0];
            var newValue = data[1];
            var attr    = data[2];
            if (attr !== "@caption")
                return;

            if (newValue === "") {
                apf.xmldb.setAttribute(elem, "caption", "Untitled");
                apf.xmldb.setAttribute(elem, "name", "");
            }
            else if (newValue !== "Untitled"){
                _self.checkAppName(newValue.trim());
                apf.xmldb.setAttribute(elem, "name", newValue.trim());
            }
        });
    },

    /**
     * Removes invalid characters which could possibly cause the Heroku API
     * to refuse the name of the app
     */
    validRename: function(event) {
        var name = event.args[1];
        this._tempRename = event.amlNode.selected.getAttribute("caption");
        var exists  = mdlHerokuApps.queryNode('app[@caption=\''+name+'\']');
        var valid = /^[a-zA-Z0-9\-]+$/.test(name);
        var validlength = name.length <= 30;

        return !exists && valid && validlength;
    },

    _tempRename: null,

    createDeploy: function (name) {
        var metadata = {};

        deploy.createDeploy(name, metadata);

        // @todo billing, do this in an event listener instead
        /*function() {
            if (!lstHerokuApps.selected)
                return false;

            deploy.createDeploy(deployName, deployType, metadata, function() {
                btnHerokuAddNewApp.enable();
                _self.getUserApps();
            });
        });*/
    },

    parseDeployHeroku: function(deployData) {
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
            .attr("appUrl", remote.metadata.webUrl || "")
            .attr("busy", d.busy || "")
            .node().xml;
    }

});

});
