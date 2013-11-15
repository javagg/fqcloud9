/**
 * Azure module for the Cloud9 IDE
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {
    "use strict";

    var ide    = require("core/ide");
    var ext    = require("core/ext");
    var util   = require("core/util");
    var deploy = require("ext/deploy/deploy");
    var css    = ""; // require("text!ext/azure/style/style.css");
    var markup = require("text!ext/azure/azure.xml");
    var modalMarkup = require("text!ext/azure/azure-modals.xml");

    module.exports = ext.register("ext/azure/azure", (function () {
        var _requestUserAppsBusy = false;

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
                    
                    hboxAzure.addEventListener("prop.visible", function (ev) {
                        if (ev.value && !apf.isTrue(mdlAzureUserState.getAttribute("loaded"))) {
                            // request base data (like data center locations etc) from the server
                            requestBaseDataFromServer();
                            
                            // the applications a user might or might not have
                            requestUserApps();
                            
                            // add the operating system model to be used in the dropdown
                            fillAzureOperatingSystemModel(mdlAzureOS);
                            // add instance sizes
                            fillAzureInstanceSizeModel(mdlAzureInstanceSize);
                        }
                    });
                });
            };

            if (typeof hboxAzure !== "undefined") {
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
            hboxAzure.insertMarkup(markup, options);
        }

        /**
         * SocketMessage is received
         */
        function onMessage(msg) {
            if (msg.command !== "provision" || msg.type !== "call-method" || msg.target !== "azure") return;

            if (!msg.success) {
                console.log("Call method on " + msg.target + " yielded an error: ", msg.err);
            }

            switch (msg.method) {
                case "getDatacenterLocations":
                    fillAzureDatacenterModel(mdlAzureDatacenters, msg.response);
                    break;
                case "createCsdef":
                    if (msg.response.slot === "staging") {
                        deployToStage();
                    }
                    else {
                        deploy.doDeploy();
                    }
                    break;
                case "getUserApps":
                    fillAzureAppsModel(mdlAzureApps, msg.response);
                    break;
                case "uploadCert":
                    onCertUploaded(msg.success, msg.response, msg.err);
                    break;
                case "getUserCertificateState":
                    onUserCertificateState(mdlAzureUserState, msg.response);
                    break;
                case "clearCert":
                    onCertCleared(msg.success, msg.response);
                    break;
            }
        }

        function requestUserApps() {
            if (mdlAzureApps.data) {
                mdlAzureApps.data.selectNodes("//app").forEach(function (a) {
                    apf.xmldb.removeNode(a);
                });
            }
            lstAzureApps.setAttribute("empty-message", 'Loading...');

            // prevent server flooding
            if (!_requestUserAppsBusy) {
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure",
                    method: "getUserApps",
                    args: []
                });

                _requestUserAppsBusy = true;
            }
        }

        /**
         * Request data needed for initial state
         */
        function requestBaseDataFromServer () {
            // get data center locations
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure",
                method: "getDatacenterLocations",
                args: []
            });

            // getUserCertificateState
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure",
                method: "getUserCertificateState",
                args: []
            });
        }

        /**
         * Fill a model with the Azure Operating System model
         */
        function fillAzureOperatingSystemModel (model) {
            model.load("<oss/>");

            // @todo, do we want to move this to the DB?
            var choices = [ { name: "Windows 2008 SP2", value: 1 }, { name: "Windows 2008 R2", value: 2 } ];
            choices.forEach(function (c) {
                var node = model.data.parentNode.createElement("os");
                Object.keys(c).forEach(function (k) {
                    apf.xmldb.setAttribute(node, k, c[k]);
                });
                apf.xmldb.appendChild(model.data, node);
            });

            // @todo, has to be better way
            ddlAzureOS.select(model.data.firstChild);
        }

        /**
         * Fill a model with the azure instance sizes
         */
        function fillAzureInstanceSizeModel (model) {
            model.load("<sizes/>");

            // @todo, do we want to move this to the DB?
            var choices = [
                { name: "Extra small (Shared CPU, 768 MB)", value: "ExtraSmall" },
                { name: "Small (1 CPU, 1.75 GB)", value: "Small" },
                { name: "Medium (2 CPU, 3.5 GB)", value: "Medium" },
                { name: "Large (4 CPU, 7 GB)", value: "Large" },
                { name: "Extra large (8 CPU, 14 GB)", value: "ExtraLarge" },
            ];
            choices.forEach(function (c) {
                var node = model.data.parentNode.createElement("size");
                Object.keys(c).forEach(function (k) {
                    apf.xmldb.setAttribute(node, k, c[k]);
                });
                apf.xmldb.appendChild(model.data, node);
            });

            // @todo, has to be better way
            if (typeof ddlAzureInstanceSize !== "undefined") {
                ddlAzureInstanceSize.select(model.data.firstChild);
            }
        }

        //mdlAzureInstanceSize

        /**
         * Fill a model with the Azure Datacenter locations
         */
        function fillAzureDatacenterModel (model, locs) {
            model.load("<locations />");

            (locs || []).forEach(function (l) {
                var node = model.data.parentNode.createElement("location");
                apf.xmldb.setAttribute(node, "name", l);
                apf.xmldb.appendChild(model.data, node);
            });

            // @todo has to be better way (via model.$amlnodes ?)
            ddlAzureDatacenter.select(model.data.firstChild);
        }

        /**
         * Handle app response
         */
        function fillAzureAppsModel (model, data) {
            _requestUserAppsBusy = false;

            model.load("<apps />");

            (data || []).forEach(function (l) {
                var node = model.data.parentNode.createElement("app");
                Object.keys(l).forEach(function (key) {
                    apf.xmldb.setAttribute(node, key, l[key]);
                });
                apf.xmldb.appendChild(model.data, node);
            });

            lstAzureApps.setAttribute("empty-message", "No applications yet");
        }

        function onUserCertificateState (model, data) {
            model.load("<state loaded='true' />");
            
            if (!model.getAttribute("step")) {
                data = data || {};
                data.step = 1;
            }

            Object.keys(data || {}).forEach(function (k) {
                apf.xmldb.setAttribute(model.data, k, data[k]);
            });
        }

        /**
         * Handle uploadCert response
         */
        function onCertUploaded (success, data, err) {
            if (!success) {
                switch (err && err.code) {
                    case 8: // multiple subscription ids found show window

                        winAzureChooseSubscription.show();

                        mdlAzureSubscriptions.load("<subscriptions/>");
                        (err.ids || []).forEach(function (subscr) {
                            var node = mdlAzureSubscriptions.data.parentNode.createElement("subscription");
                            Object.keys(subscr).forEach(function (k) {
                                apf.xmldb.setAttribute(node, k, subscr[k]);
                            });
                            apf.xmldb.appendChild(mdlAzureSubscriptions.data, node);
                        });
                        ddlAzureChooseSubscription.setAttribute("value", err.ids.length ? err.ids[0].name : "");

                        break;
                    default:
                        util.alert("Certificate not valid",
                            "The file you uploaded doesn't look like a valid certificate",
                            "Please re-upload the certificate" + (err ? ("<br><br>" +  (typeof err === "string" ? err : JSON.stringify(err))) : ""));
                        break;
                }
                return;
            }

            // set something to the model
            onUserCertificateState(mdlAzureUserState, data);

            // request user apps
            requestUserApps();
            // request more basedata
            requestBaseDataFromServer();
        }

        /**
         * Handle clearCert response
         */
        function onCertCleared (success, data) {
            if (!success) {
                return util.alert("Certificate not present",
                            "Could not clear the certificate because there is none present");
            }

            // set something to the model
            onUserCertificateState(mdlAzureUserState, data);
        }

        /* UI Callbacks */

        var augment = {
            /**
             * Handle preconditions
             */
            handlePrecondAzure: function (deployInstance, info, sentMessage) {
                var isHandled = true;
                switch (info.message.errcode) {
                    case 2: // no csdef file
                        util.question(info.defaultMessage, "No 'csdef' file present",
                            "Would you like assistance creating one?",
                            function () {
                                winQuestion.hide();
                                winAzureCsdef.show();

                                if (sentMessage) {
                                    // OK so APF will evaluate this if we start with '{' and end with '}', so lets strip those off
                                    // and add em again when we use it
                                    var stringified = JSON.stringify(sentMessage);
                                    if (stringified.length >= 2) {
                                        winAzureCsdef.setAttribute("originalmessage", stringified.substr(1, stringified.length - 2));
                                    }
                                }
                            },
                            null,
                            function () {
                                winQuestion.hide();
                            }
                        );
                        break;
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
            
            parseDeployAzure: function (deployData) {
                var d = deployData;
                var remote = deployData.remote || {metadata:{}};

                var src = {
                    name: d.name || "",
                    did: d.did || "",
                    state: d.state,
                    since: remote.date_add ? (new Date(parseInt(remote.date_add, 10))).toString("dd/MM/yyyy") : "n/a",
                    type: d.type,
                    appName: remote.metadata.appName,
                    busy: d.busy
                };

                var tempModel = new apf.model();
                tempModel.load("<server/>");

                Object.keys(src).forEach(function (k) {
                    tempModel.data.setAttribute(k, src[k]);
                });

                return apf.xmldb.cleanNode(tempModel.data).xml;
            }
        };

        /** // file.currentTarget.result
         * Upload a certificate to the users profile
         */
        function uploadCert(subscriptionId) {
            var f = azureGetCert.$ext.getElementsByTagName('input')[0].files[0];

            var doUpload = function (data) {
                ide.send({
                    command: "provision",
                    type: "call-method",
                    target: "azure",
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
        ///provision/filereader-fallback
        }

        /**
         * Clear the certificate info
         */
        function clearCert() {
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure",
                method: "clearCert",
                args: []
            });
        }

        /**
         * Create a csdef file, then start deploying
         */
        function createCsdef (instanceSize, originalMessage) {
            ide.send({
                command: "provision",
                type: "call-method",
                target: "azure",
                method: "createCsdef",
                args: [ instanceSize, originalMessage ]
            });
        };

        /**
         * Kick off a real deploy
         */
        function createDeploy (service, instanceCount, operatingSystem, datacenter, enableRdp, rdpUser, rdpPass) {
            var metadata = {
                operatingSystem: Number(operatingSystem) || 1,
                instanceCount: Number(instanceCount) || 1,
                datacenter: datacenter,
                target: "production", // default target is production

                enablerdp: !!enableRdp,
                rdpuser: rdpUser || null,
                rdppassword: rdpPass || null
            };

            deploy.createDeploy(service, metadata);
        }

        /**
         * Deploy to stage, instead of prod
         */
        function deployToStage () {
            deploy.doDeploy(false, { slot: "staging" });
        }

        /**
         * Set the wizard back to original state
         */
        function resetWizard () {
            azureListing.show();
            azureCreateNew.hide();
        }

        return {
            name    : "Azure",
            dev     : "Ajax.org",
            type    : ext.GENERAL,
            deps    : [deploy],
            alone   : true,
            offline : false,
            nodes   : nodes,
            css     : css,
            init    : init,
            markup  : modalMarkup,

            // UI callbacks
            createDeploy    : createDeploy,
            createCsdef     : createCsdef,
            resetWizard     : resetWizard,
            uploadCert      : uploadCert,
            clearCert       : clearCert,
            deployToStage   : deployToStage
        };
    }()));

});