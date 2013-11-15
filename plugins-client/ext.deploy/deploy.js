/**
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 *
 */

define(function(require, exports, module) {

var ext     = require("core/ext");
var ide     = require("core/ide");
var util    = require("core/util");
var panels  = require("ext/panels/panels");
var markup  = require("text!ext/deploy/deploy.xml");
var skin    = require("text!ext/deploy/skin.xml");
var css     = require("text!ext/deploy/style/style.css");
var ideConsole = require("ext/console/console");

var defaultConfig = null;
var serverTypeMap = {
    "heroku": "Heroku.com",
    "openshift": "RedHat Openshift",
    "cloudfoundry": "Cloud Foundry",
    "gae"   : "Google App Engine",
    "azure" : "Windows Azure Cloud Services",
    "azure-sites"   : "Windows Azure Websites"
};
var periodMap = {
    "1d": "day",
    "1w": "week",
    "1m": "month",
    "1y": "year"
};

module.exports = ext.register("ext/deploy/deploy", {
    name     : "Deploy Panel",
    dev      : "Ajax.org",
    alone    : true,
    type     : ext.GENERAL,
    markup   : markup,
     skin    : {
        id   : "gitskin",
        data : skin,
        "media-path" : ide.staticPrefix + "/ext/deploy/style/images/",
        "icon-path"  : ide.staticPrefix + "/ext/deploy/style/icons/"
    },
    css   : css,
    deps  : [ideConsole],
    nodes : [],
    defaultWidth : 230,

    hook : function() {
        var _self = this;

        panels.register(this, {
            position : 6000,
            caption: "Deploy",
            "class": "deploy"
        });

        ide.addEventListener("socketMessage", this.onMessage.bind(this));

        // update server statuses on socket connect
        ide.addEventListener("socketConnect", this.onSocketConnect.bind(this));
    },

    /**
     * Refresh data on socket connect
     */
    onSocketConnect: function () {
        // make sure the plugin xml is actually loaded
        if (!window.mdlServers)
            return;

        if (mdlServers.data) {
            mdlServers.data.selectNodes("//server").forEach(function (node) {
                ide.send({
                    command: "provision",
                    type: "status",
                    deployid: node.getAttribute("did")
                });
            });
        }
    },

    init: function(amlNode) {
        var _self = this;

        this.panel = winDeploy;
        this.nodes.push(winDeploy);

        colLeft.appendChild(winDeploy);
        apf.importCssString(this.css || "");

        // load initial data
        this.getProducts();
        this.onSocketConnect();

        ide.dispatchEvent("ext:ready", this);

        setTimeout(_self.refreshBusyServers.bind(_self), 10000);
    },

    refreshBusyServers: function () {
        var _self = this;

        if (window.mdlServers && mdlServers.data) {
            mdlServers.data.selectNodes("//server[@busy='true']").forEach(function (node) {
                ide.send({
                    command: "provision",
                    type: "status",
                    deployid: node.getAttribute("did")
                });
            });
        }

        setTimeout(_self.refreshBusyServers.bind(_self), 10000);
    },

    destroy : function(){
        this.$destroy();
        panels.unregister(this);
    },

    /**
     * Receive all socketMessages, filter 'em here out if you want to do something with em
     */
    onMessage: function(e) {
        var message = e.message;

        if (message.command === "provision") {
            switch (message.type) {
                case "list-deploys":
                    this.parseDeploys(message.deploys);
                    break;
                case "status":
                    this.updateDeploy(message.deployid, message.status);
                    break;
                case "delete":
                    this.removeDeployFromList(message.deployid);
                    break;
                case "failed-preconditions":
                    this.deployPreconditions(message.deployid, message.text, message.original);
                    break;
                case "failed-deployment":
                    this.deployError(message.text);
                    break;
                case "exception":
                    this.serverError(message.text);
                    break;
            }

            return;
        }

        if (message.type != "result" && message.subtype != "git" && !(message.body && message.body.err))
            return;

        var cmd = message.body && message.body.argv && message.body.argv.join(" ");

        if (cmd !== "git branch" || !window.mdlBranches)
            return;

        var body = message.body.out || message.body.err;
        if (!body)
            return;

        // start parsing the branches:
        var out = body.replace(/(\*|\(.*\)| |\t)/g, "").split(/\n/);
        var xml = "<branches>";

        for (var i = 0, l = out.length; i < l; ++i) {
            if (!out[i])
                continue;
            xml += '<branch name="' + apf.escapeXML(out[i]) + '"/>';
        }

        mdlBranches.load(xml + "</branches>");
    },

    /**
     * Update the display status of a deploy.
     * Status is in the form: { busy: true|false, message: "" }
     */
    updateDeploy: function (deployId, status) {
        var node = mdlServers.data && mdlServers.data.selectSingleNode("//server[@did=" + deployId + "]");

        if (node) {
            Object.keys(status).forEach(function (k) {
                apf.xmldb.setAttribute(node, k, status[k]);
            });
        }
    },

    onWindowShow: function(win) {
        if (win === mwDeployTarget) {
            if (!ddServerType.selected) {
                ddServerType.setValue(defaultConfig);
            }
        }
    },

    /**
     * Display deploy info menu
     */
    displayDeployInfo : function(){
        var stateReady = parseInt(trDeploy.selected.getAttribute("state"), 10) == 2;
        if (!(trDeploy.$selected && stateReady))
            return;

        var pos = apf.getAbsolutePosition(trDeploy.$selected);
        var offX = apf.getHtmlInnerWidth(trDeploy.$ext) + 6;
        var offY = -21;

        mnuDeploy.display((pos[0] + offX), (pos[1] + offY));
    },

    /**
     * Adds new deploy server to deploy tree
     */
    addDeployToList: function(type, deployData, inprogress) {
        var name = deployData.name;
        var type = deployData.type;
        var groupNode = mdlServers.queryNode('group[@type="' + type + '"]');

        if (!groupNode) {
            name = serverTypeMap[type];
            var node = apf.getXml('<group type="' + type + '" name="' + name + '" />');
            groupNode = apf.xmldb.appendChild(mdlServers.data, node);
        }

        if (!inprogress) {
            deploy.getDeploys(function(){
                var n = 'group[@type="' + type + '"]/server[@name="' + name + '"]';
                trDeploy.select(mdlServers.queryNode(n));
            });
        }
        else {
            var xmlContent = this.parseDeploy(deployData, type);
            apf.xmldb.appendChild(groupNode, apf.getXml(xmlContent));
            mwDeployTarget.hide();
        }
    },

    /**
     * Remove deploy server from deploy tree
     */
    removeDeployFromList: function(did) {
        var serverNode = mdlServers.queryNode('group/server[@did="' + did + '"]');
        if (serverNode.parentNode.childNodes.length === 1)
            apf.xmldb.removeNode(serverNode.parentNode);
        else
            apf.xmldb.removeNode(serverNode);
    },

    orderDetails: {},

    /**
         * creates new deploy server
     */
    createDeploy: function(name, metadata, callback) {
        if (this.creatingDeploy) return;

        var _self = this;
        var type = ddServerType.selected.getAttribute("id");
        metadata = metadata || {};

        var checkNameExists = function(name, type, onSuccess) {
            var exists = mdlServers.queryNode("group[@type='" + type + "']/server[@name='" + name + "']");
            if (exists) {
                winDeployNameExists.show();
                btnDeployNameExistsYes.onclick = function () {
                    onSuccess();
                    winDeployNameExists.hide();
                };
                return true;
            }
            return false;
        };

        // precondition check
        if (checkNameExists(name, type, doCreateDeploy)) {
            return;
        }
        else {
            doCreateDeploy();
        }

        function doCreateDeploy () {
            // make sure to reflect the creation in the UI
            var deployData = {
                name: name,
                type: type,
                busy: true,
                message: "Creating instance"
            };

            _self.addDeployToList(type, deployData, true);
            _self.creatingDeploy = true;

            var product;
            switch (type) {
                case "heroku":
                    product = mdlProducts.queryNode("//vendor[@id='heroku']/products/product[@id='free']");
                    break;
                case "openshift":
                    product = mdlProducts.queryNode("//vendor[@id='openshift']/products/product[@id='free']");
                    break;
                case "azure":
                    product = mdlProducts.queryNode("//vendor[@id='azure']/products/product[@id='free']");
                    break;
                case "azure-sites":
                    product = mdlProducts.queryNode("//vendor[@id='azure-sites']/products/product[@id='free']");
                    break;
                case "cloudfoundry":
                    product = mdlProducts.queryNode("//vendor[@id='cloudfoundry']/products/product[@id='free']");
                    break;
                default:
                    throw new Error("Unknown type " + type);
            }

            // enrich the metadata object with the attributes from the product
            for (var ix = 0; ix < product.attributes.length; ix++) {
                var attr = product.attributes[ix];
                var exclude = [ "id", "amount", "currency", "duration", "prolong", "period" ];
                if (!exclude.contains(attr.name) && !metadata[attr.name])
                    metadata[attr.name] = attr.value;
                };

                // Now create the deploy target
            // the server will tell us if we need payment
            var data = {
                name: name,
                type: type,
                workspaceid: ide.workspaceId,
                metadata: metadata,
                product: product.getAttribute("id")
            };

            var postdata = Object.keys(data).map(function (k) {
                var v = data[k];
                if (typeof v !== "string") {
                    v = JSON.stringify(v);
                }
                return encodeURIComponent(k) + "=" + encodeURIComponent(v);
            }).join("&");

            apf.ajax(window.location.pathname + "/api/deploy/create", {
                method: "post",
                data: postdata,
                callback: function(jsonData, state, extra) {
                    _self.creatingDeploy = false;

                    if (state !== apf.SUCCESS) {
                        util.alert(
                            "Create deploy error",
                            "An error occurred while creating a new deploy target",
                            extra.http.responseText
                        );
                    }

                    mwDeployTarget.hide();
                    _self.getDeploys();

                    // if we need a contract for this server
                    try {
                        jsonData = JSON.parse(jsonData);
                    }
                    catch (e) {
                        window && window.console && window.console.log(
                            "The data returned from the server is not in JSON format: ", jsonData);
                    }

                    if (jsonData && jsonData.requirecontract) {
                        _self.startServerPayment(jsonData.deployid, jsonData.requirecontract);
                    }

                    if (typeof callback === "function") {
                        callback(null, jsonData.deployid);
                    }
                }
            });
        }
    },

    /**
     * Cancel deploy server subscription
     */
    cancelDeploy: function(){
        winConfirmDelDeploy.hide();
        winConfirmDelFreeDeploy.hide();

        ide.send({
            command: "provision",
            type: "delete",
            deployid: trDeploy.selected.getAttribute("did")
        });
    },

    /**
     * gets a list of all deploy server for this project
     */
    getDeploys: function(pid) {
        ide.send({
            command: "provision",
            type: "list-deploys"
        });
    },

    /**
     * Parses a deploy server from object to xml
     * If deploy.js prototype is augmented with a method parser from another
     * extension, this will be executed instead
     */
    parseDeploy: function(deployData, type) {
        if (!type) {
            type = deployData.type;
        }

        if (type) {
            var typeStr = type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, "_");
            return this["parseDeploy" + typeStr](deployData);
        }

        var remote = deployData.remote || {};
        var args = {
            name: deployData.name,
            did: deployData.did || '',
            type: type,
            state: deployData.state || 0,
            ip: remote.metadata && remote.metadata.host ? remote.metadata.host.split("@")[1] : "n/a",
            since: remote.date_add ? (new Date(parseInt(remote.date_add, 10))).toString("dd/MM/yyyy") : "n/a",
            disposedate: deployData.disposedate ? (new Date(parseInt(deployData.disposedate, 10))).toString("dd/MM/yyyy") : "",
            billingdate: deployData.billingdate ? (new Date(parseInt(deployData.billingdate, 10))).toString("dd/MM/yyyy") : "",
            ram: deployData.ram,
            transactionid: deployData.transactionid,
            busy: deployData.busy
        };

        // add all fields from metadata that aren't added yet
        if (remote && remote.metadata) {
            Object.keys(remote.metadata).map(function (m) {
                if (!args[m]) {
                    args[m] = remote.metadata[m];
                }
            });
        }

        return util.toXmlTag("server", args);
    },

    /**
     * parses all found project deploy servers to xml and loads it into the model mdlServers
     */
    parseDeploys: function(deployData){
        var _self   = this;
        var deploys = {};
        var pending = [];
        var deploy, i;

        if (!mdlProducts.data) {
            if (!this.retryInterval) {
                this.retryInterval = setInterval(function(){
                    _self.parseDeploys(deployData);
                }, 100);
            }
            return;
        }

        if (this.retryInterval)
            clearInterval(this.retryInterval);

        for (i = 0; i < deployData.length; i++) {
            deploy = deployData[i];

            if (!deploys[deploy.type]) {
                deploys[deploy.type] = [];
            }

            deploys[deploy.type].push(deploy);
        }

        var xml = "<data>", name;
        for (var type in deploys) {
            // the item needs to be in the products model, otherwise you cant deploy to it
            if (!mdlProducts.data || !mdlProducts.data.selectSingleNode("//vendor[@id='" + type + "']")) {
                continue;
            }

            name = serverTypeMap[type] || type;
            xml += util.toXmlTag("group", {
                type: type,
                name: name
            }, true);

            var deploysType = deploys[type];
            var l = deploysType.length;
            for (i = -1; ++i < l;) {
                deploy = deploysType[i];
                if (deploy.state === "3") {
                    continue;
                }

                if (deploy.state !== "2") {
                    pending.push(deploy.did);
                }
                xml += this.parseDeploy(deploy, type);
            }
            xml += "</group>";
        }

        xml += "</data>";
        mdlServers.load(xml);
    },

    /**
     * Get all server products
     */
    getProducts: function() {
        var _self = this;
        apf.ajax(document.location.pathname + "/api/deploy/products", {
            callback: function (data, state, extra) {
                if (state !== apf.SUCCESS) {
                    throw new Error("Could not get product information");
                }
                
                data = JSON.parse(data);

                _self.parseProducts(data);
                _self.getDeploys();
            }
        });
    },

    /**
     * parses all products to xml and load in into mdlProducts
     */
    parseProducts: function(products) {
        var data = apf.getXml("<vendors/>");

        Object.keys(products).forEach(function (vendor) {
            var root = data.parentNode.createElement("vendor");
            apf.xmldb.setAttribute(root, "id", vendor);
            apf.xmldb.setAttribute(root, "caption", serverTypeMap[vendor]);

            var productNode = data.parentNode.createElement("products");

            Object.keys(products[vendor]).forEach(function (product) {
                var node = data.parentNode.createElement("product");
                apf.xmldb.setAttribute(node, "id", product);

                var prdObj = products[vendor][product];
                prdObj.currency = "$";
                prdObj.period = periodMap[prdObj.duration] || prdObj.duration;

                Object.keys(prdObj).forEach(function (k) {
                    apf.xmldb.setAttribute(node, k, prdObj[k]);
                });

                productNode.appendChild(node);
            });

            root.appendChild(productNode);

            data.appendChild(root);
        });
        mdlProducts.load(data);
    },

    /**
     * Performs a deploy (a new version of the app) to the provisioned machine.
     *
     * Use args as an object to post extra data to the server
     */
    doDeploy: function(autoFixPrecond, args) {
        var current = trDeploy.selected;
        var did = current && current.getAttribute("did");
        if (!did) {
            return;
        }

        ideConsole.show();
        ideConsole.showOutput();
        var msg = "Deploy '" + current.getAttribute("name") + "' to " + serverTypeMap[current.getAttribute("type")];
        var command_id = ideConsole.createOutputBlock(msg, false);

        var deployMsg = {
            command: "provision",
            type: "deploy",
            deployid: did,
            fixPrecond: autoFixPrecond,
            command_id: command_id
        };

        // vendor specific extensions, have to move into seperate classes
        switch (current.getAttribute("type")) {
            case "heroku":
                deployMsg.branchName = (ddDeployBranches.visible && ddDeployBranches.value) || "master";
                break;
        }

        Object.keys(args || {}).forEach(function (k) {
            if (!deployMsg[k]) {
                deployMsg[k] = args[k];
            }
        });

        ide.send(deployMsg);
    },

    /**
     * Handle a precondition failure from the server,
     * pass in a String for info for an alert, pass in an PreconditionError object for a question
     *
     * The 'sentMessage' var contains the original message that was sent to the server
     */
    deployPreconditions: function (deployId, info, sentMessage) {
        if (typeof info === "string") {
            return util.alert("Preconditions failed", info, "");
        }

        var _self = this;

        var current = trDeploy.getModel().data.selectSingleNode("//server[@did=" + deployId + "]");
        var type = current.getAttribute("type");

        // custom precond handling
        var handler = type ? this["handlePrecond" + type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, "_")] : null;
        if (handler && handler(current, info, sentMessage)) {
            return;
        }

        var question;
        switch (typeof info.message === "object" && Number(info.message.errcode)) {
            case 14: // git has uncommitted changes
                question = "Do you want to continue?";
                break;
            default:
                question = "Would you like us to fix this?";
                break;
        }

        var msg = info.message && info.message.msg ? info.message.msg : info.message;

        return util.question(info.defaultMessage || "Preconditions failed", msg, question, function() {
            // Yes!
            winQuestion.hide();
            _self.doDeploy(true, sentMessage);
        }, null, function() {
            // No!
            apf.xmldb.setAttribute(current, "state", "2");
            winQuestion.hide();
        });
    },

    /**
     * Handle deployment errors
     */
    deployError: function (text) {
        ideConsole.show();

        // prettyfying actions
        // {"msg":"Expected resp.statusCode between 200 and 299","body":{"@":{"xmlns":"http://schemas.microsoft.com/windowsazure","xmlns:i":"http://www.w3.org/2001/XMLSchema-instance"},"Code":"ResourceNotFound","Message":"The subscription ID was not found."}}
        if (text.msg && text.body && text.body["@"] && text.body["@"].xmlns === "http://schemas.microsoft.com/windowsazure") {
            var msg = text.body.Message;

            var append = "<br/><br/>" + msg;

            switch (text.body.Message) {
                case "The subscription ID was not found.":
                    msg = "Your subscription details might not be valid. Please re-upload your publish settings." + append;
                    break;
            }

            return util.alert("Deployment error", "An error occured during deployment. Azure responded '" + text.body.Code + "'", msg);
        }

        util.alert("Deployment error", "An error occured during deployment", typeof text === "string" ? text : JSON.stringify(text));
    },

    /**
     * Handle unhandled server exceptions
     */
    serverError: function (text) {
        util.alert("Deployment error", "An error occured while performing a deployment action", text);
    },

    /**
     * start payment for a given server
     */
    startServerPayment: function (deployId, contractId) {
        var opts = {
            width: 1000,
            height: 650,
            personalbar: 0,
            toolbar: 0,
            scrollbars: 1,
            resizable: 1
        };

        var win = window.open("/order/payment?contractid=" + contractId, "payment", Object.keys(opts).map(function(k) {
            return k + "=" + opts[k];
        }).join(","));

        win.focus();
    }
});

});