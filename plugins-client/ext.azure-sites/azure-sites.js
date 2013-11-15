/**
 * Azure module for the Cloud9 IDE
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {
    "use strict";

    var ide    = require("core/ide");
    var ext    = require("core/ext");
    var util   = require("core/util");
    var deploy = require("ext/deploy/deploy");
    var markup = require("text!ext/azure-sites/azure-sites.xml");
    var css    = require("text!ext/azure-sites/style/style.css");

    module.exports = ext.register("ext/azure-sites/azure-sites", (function () {
        var _requestUserAppsBusy = false;
        var _checkFirstSiteBusy = false;

        var nodes = [];

        function init () {
            apf.importCssString(css || "");

            // expose certain features to the deploy extension
            Object.keys(augment).forEach(function (a) {
                deploy[a] = augment[a];
            });

            // alrighty, this is nasty shiz
            var deployLoaded = function () {
                loadMarkup(function() {

                    // listen to socket messages
                    ide.addEventListener("socketMessage", function (ev) {
                        onMessage(ev.message);
                    });
                    
                    hboxAzureSites.addEventListener("prop.visible", function (ev) {
                        if (ev.value && !apf.isTrue(mdlAzureSitesUserState.getAttribute("loaded"))) {
                            // request base data (like data center locations etc) from the server
                            requestBaseDataFromServer();
                            
                            // the applications a user might or might not have
                            checkFirstSite();
                        }
                    });
                });
            };

            if (typeof hboxAzureSites !== "undefined") {
                deployLoaded();
            }
            else {
                ide.addEventListener("ext:ready", function (ext) {
                    if (ext === deploy) {
                        deployLoaded();
                    }
                });
            }
        }

        /**
         * Depending on the value in 'mdlConfiguration' (part of ext/deploy/deploy.xml),
         * the Azure specific markup will be injected into the 'deploy' screen.
         *
         * @param {callback} Function that is called when the markup was loaded
         */
        function loadMarkup (callback) {
            // insertMarkup expects a property like this
            // add all the nodes, so we can 'destroy' this plugin and all the associated nodes
            var options = {
                callback: function(inserted) {
                    var childNodes = inserted.amlNode.childNodes;
                    childNodes.shift();
                    var insertedXmlNodes = childNodes.map(function(n) {
                        return n.$aml;
                    });
                    nodes = nodes.concat(insertedXmlNodes);

                    callback();
                }
            };

            // hboxAzure is the magic element in /deploy.xml where we can inject the markup
            hboxAzureSites.insertMarkup(markup, options);
//            ddServerType.addEventListener("afterchange", function(e) {
//                switch(ddServerType.value) {
//                    case "azure":
//                        if (azureGetCert.parentNode !== hboxAzure)
//                            hboxAzure.insertBefore(azureGetCert, azureBottomButtons);
//                        break;
//
//                    case "azure-sites":
//                        if (azureGetCert.parentNode !== hboxAzureSites)
//                            hboxAzureSites.insertBefore(azureGetCert, azureSitesBottomButtons);
//                        break;
//                }
//            });
        }

        /**
         * SocketMessage is received
         */
        function onMessage(msg) {
            if (msg.command !== "provision" || msg.type !== "call-method") {
                return;
            }

            if (msg.target !== "azure-sites") {
                return;
            }

            if (!msg.success) {
                console.log("Call method on " + msg.target + " yielded an error: ", msg.err);
            }

            switch (msg.method) {
                case "getUserApps":
                    fillAzureAppsModel(mdlAzureSitesApps, msg.response);
                    apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "loaded", "true");
                    break; 

                case "hasSpaces":
                    _checkFirstSiteBusy = false;

                    if (!msg.success) {
                        apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "error", "true");
                        apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "errorMessage", msg.err);
                        break;
                    }

                    var hasSpaces = msg.response;
                    apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "firstSite", (!hasSpaces).toString());

                    if (hasSpaces)
                        requestUserApps();
                    else
                        apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "loaded", "true");

                    break;

                case "uploadCert":
                    if (msg.success) {
                        onUserCertificateState(mdlAzureSitesUserState, msg.response);
                        
                        checkFirstSite();
                    }
                    break;    
                    
                case "clearCert":
                    onCertCleared(msg.success, msg.response);
                    break;
                    
                case "getUserCertificateState":
                    onUserCertificateState(mdlAzureSitesUserState, msg.response);
                    break;
            }
        }

        function onCertCleared (success, data) {
            if (!success) {
                return;
            }

            // set something to the model
            onUserCertificateState(mdlAzureSitesUserState, data);
            // Empty apps in the model
            mdlAzureSitesApps.load("<apps/>");
            apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "create", "false");
            apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "hasCert", "false");
            apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "firstSite", "false");
            apf.xmldb.setAttribute(mdlAzureSitesUserState.data, "error", "false");
        }
        
        /**
         * Request data needed for initial state
         */
        function requestBaseDataFromServer () {
            // getUserCertificateState
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure-sites",
                method: "getUserCertificateState",
                args: []
            });
        }

        function checkFirstSite() {
            // prevent server flooding
            if (!_checkFirstSiteBusy) {
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure-sites",
                    method: "hasSpaces",
                    args: []
                });

                _checkFirstSiteBusy = true;
            }
        }

        function requestUserApps() {
            if (mdlAzureSitesApps.data) {
                mdlAzureSitesApps.data.selectNodes("//app").forEach(function (a) {
                    apf.xmldb.removeNode(a);
                });
            }
            lstAzureSitesApps.setAttribute("empty-message", 'Loading...');

            // prevent server flooding
            if (!_requestUserAppsBusy) {
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure-sites",
                    method: "getUserApps",
                    args: []
                });

                _requestUserAppsBusy = true;
            }
        }
        
        /**
         * Clear the certificate info
         */
        function clearCert() {
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure-sites",
                method: "clearCert",
                args: []
            });
        }

        /**
         * Handle app response
         */
        function fillAzureAppsModel (model, data) {
            _requestUserAppsBusy = false;

            model.load("<apps />");

            // Azure is not coherent here and sends an empty Object when there
            // no sites, instead of sending an empty array.
            if (!data || (data && Object.keys(data).length === 0)) {
                data = [];
            }

            data.forEach(function (l) {
                var node = model.data.parentNode.createElement("app");
                Object.keys(l).forEach(function (key) {
                    var value = l[key];
                    if (typeof value === "string")
                        apf.xmldb.setAttribute(node, key, value);
                });

                apf.xmldb.setAttribute(node, "HostNames", l.HostNames["a:string"]);
                apf.xmldb.appendChild(model.data, node);
            });

            lstAzureSitesApps.setAttribute("empty-message", "No applications yet");
        }

        function onUserCertificateState (model, data) {
            model.load("<state loaded='true' />");

            data = data || {};
            Object.keys(data).forEach(function (key) {
                var value = data[key];
                apf.xmldb.setAttribute(model.data, key, value);
            });
        }

        /* UI Callbacks */

        var augment = {
            /**
             * Handle preconditions
             */
            handlePrecondAzure_sites: function (deployInstance, info, sentMessage) {
                var isHandled = true;
                switch (info.message.errcode) {
                    case 3: // publish settings validation
                        util.alert(info.defaultMessage, "Publish settings validation error",
                            info.message.msg);
                        break;
                    default:
                        isHandled = false;
                        break;
                }

                return isHandled;
            },

            parseDeployAzure_sites: function(deployData) {
                var d = deployData;
                var remote = deployData.remote || {metadata:{}};

                return apf.n("<server />")
                    .attr("name", d.name || "")
                    .attr("did", d.did || "")
                    .attr("state", d.state || "")
                    .attr("since", remote.date_add ? (new Date(parseInt(remote.date_add, 10))).toString("dd/MM/yyyy") : "n/a")
                    .attr("type", d.type || "")
                    .attr("appName", remote.metadata.appName || "")
                    .attr("busy", d.busy || "")
                    .node().xml;
            }
        };

        /**
         * Kick off a real deploy
         */
        function createDeploy(siteName) {
            deploy.createDeploy(siteName, {
                appName: siteName
            }, function() {
                // hackiness, how i luv it
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure-sites",
                    method: "createDeploy",
                    args: [ siteName ]
                });
            });
        }
        
        /** 
         * Upload a certificate to the users profile
         */
        function uploadCert(subscriptionId) {
            var f = azureSitesGetCert.$ext.getElementsByTagName('input')[0].files[0];

            var doUpload = function (data) {
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure-sites",
                    method: "uploadCert",
                    args: [ data, subscriptionId ]
                });
            };

            if (window.FileReader) {
                var reader = new FileReader();

                reader.onload = (function(file) {
                    doUpload(file.currentTarget.result);
                });

                reader.readAsBinaryString(f);
            }
            else {
                // Safari hack
                var xhr = new XMLHttpRequest();
                xhr.open("POST", "/api/provision/filereader-fallback", true);
                xhr.setRequestHeader("UP-FILENAME", f.name);
                xhr.setRequestHeader("UP-SIZE", f.size);
                xhr.setRequestHeader("UP-TYPE", f.type);

                xhr.onreadystatechange = function() {
                    if (this.readyState !== 4) return;

                    if (xhr.status === 200) {
                        doUpload(xhr.responseText);
                    }
                    else {
                        util.alert("Upload failed", "Uploading the file failed", "The server responded with status " + xhr.status + ". Please try again.");
                    }
                };

                xhr.send(f);
            }
        }

        /**
         * Set the wizard back to original state
         */
        function resetWizard () {
            azureSitesListing.show();
            azureSitesCreateNew.hide();
        }

        return {
            name    : "Azure Sites",
            dev     : "Ajax.org",
            type    : ext.GENERAL,
            deps    : [deploy],
            alone   : true,
            offline : false,
            nodes   : nodes,
            init    : init,

            // UI callbacks
            createDeploy    : createDeploy,
            resetWizard     : resetWizard,
            checkFirstSite  : checkFirstSite,
            clearCert       : clearCert,
            uploadCert      : uploadCert
        };
    }()));

});