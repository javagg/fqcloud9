/**
 * "File a ticket" module for Cloud9 IDE
 *
 * Inserts a menu item under the "Help" menu, which, upon being
 * clicked displays a window where a user can file support ticket.
 *
 * @author Daniela Gavidia
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function (require, exports, module) {

var ext = require("core/ext");
var ide = require("core/ide");
var menus = require("ext/menus/menus");
var util   = require("core/util");
var markup = require("text!ext/supportticket/supportticket.xml");
var attachmentSizeLimit = 2000000;  // limit size of attachment to <= 2MB

module.exports = ext.register("ext/supportticket/supportticket", {
    name: "Supportticket",
    dev: "Ajax.org",
    alone: true,
    type: ext.GENERAL,
    markup: markup,

    nodes: [],

    init: function (amlNode) {
    },

    hook: function () {
        var _self = this;
        this.nodes.push(
        menus.addItemByPath("Help/Support/Report a bug...", new apf.item({
            onclick: function() {
                ext.initExtension(_self);
                supportticketWindow.show();
            }
        }), 1800000));
    },

    /**
     * Custom functions
     */

    /**
     * fileTicket
     *
     * This function is called when pressing the Send button. It sends the contents
     * of the form to the Zendesk Cloud9 IDE account, creating a support ticket
     * there.
     */
    fileTicket: function () {
        supportticketBtnSend.setAttribute("disabled", true);
        var fileHandler = supportticketAttachment.$ext.getElementsByTagName('input')[0].files[0];
        if (fileHandler) { // there is an attachment
            if (fileHandler.size > attachmentSizeLimit) {
                util.alert("Upload failed", "Attachment size exceeds limit", "Please limit the size of the attachment to less than 2 MB.");
                // Reenable Send button and clear file chooser
                supportticketBtnSend.setAttribute("disabled", false);
                this.clearFileChooser();
                return;
            }

            if (window.FileReader) {
                var reader = new FileReader();
                reader.onload = (function (file) {
                    var attachedFile = {
                        binary : file.currentTarget.result,
                        name : fileHandler.name
                    };
                    sendTicketToServer(attachedFile);
                });
                reader.readAsBinaryString(fileHandler);
            }
            else { // Safari hack
                var xhr = new XMLHttpRequest();
                xhr.open("POST", "/api/provision/filereader-fallback/images", true);
                xhr.setRequestHeader("Content-Type", "application/octet-stream");
                xhr.setRequestHeader("UP-FILENAME", fileHandler.name);
                xhr.setRequestHeader("UP-SIZE", fileHandler.size);
                xhr.setRequestHeader("UP-TYPE", fileHandler.type);

                xhr.onreadystatechange = function () {
                    if (this.readyState !== 4) return;

                    if (xhr.status === 200) {
                        var attachedFile = {
                            binary : xhr.responseText,
                            name : fileHandler.name
                        };
                        sendTicketToServer(attachedFile);
                    }
                    else {
                        util.alert("Upload failed", "Uploading the file failed",
                            "The server responded with status " + xhr.status + ". Please try again.");
                    }
                };
                xhr.send(fileHandler);
            }
        }
        else {  // no attachment
            sendTicketToServer();
        }

        function sendTicketToServer(attachedFile) {
            var subject = supportticketSubject.getValue();
            var description = supportticketDescription.getValue();
            var postData = {
                "subject" : subject,
                "description" : description,
                "projectName" : cloud9config.projectName,
                "userAgent" : navigator.userAgent
            };
            if (attachedFile) {
                postData.attachmentName = attachedFile.name;
                postData.attachmentBinary = attachedFile.binary;
            }
            var keys = Object.keys(postData);
            var keyValueArray = keys.map(function (key) {
                return encodeURIComponent(key) + "=" + encodeURIComponent(postData[key]);
            });
            var postString = keyValueArray.join("&");

            apf.ajax(apf.config.baseurl + "/api/context/fileticket", {
                method: "post",
                data: postString,
                contentType: "application/x-www-form-urlencoded",
                callback: function (data, state, extra) {
                    if (state != apf.SUCCESS) {
                        return util.alert("Error filing Zendesk ticket",
                            "Please email us at support@c9.io",
                            typeof data === "string" ? data : JSON.stringify(data));
                    }
                    data = JSON.parse(data);
                    // Show confirmation message
                    supportticketConfirmationMessage.setAttribute("caption",
                        "<center>Thanks for your report.<br><br>Our support team will get in touch<br>"
                        + "with you as soon as possible at<br><b>" + apf.escapeXML(data["email"]) + "</b></center>");
                    supportticketForm.setProperty("visible", false);
                    supportticketConfirmation.setProperty("visible", true);
                    supportticketBtnSend.hide();
                    supportticketBtnClose.setCaption("Close");
                }
            });
        }
    },

    clearFileChooser: function () {
        // Clear the file chooser. A bit hacky, but it works.
        var fileChooser = document.getElementById("supportticketFileChooser");
        fileChooser.innerHTML = fileChooser.innerHTML;
    },

    closeWindow: function () {
        supportticketWindow.hide();
        // Set the "Report a bug" form back to it's original state
        supportticketForm.setProperty("visible", true);
        supportticketConfirmation.setProperty("visible", false);
        supportticketBtnSend.setAttribute("disabled", false);
        supportticketBtnSend.show();
        supportticketBtnClose.setCaption("Cancel");
        supportticketSubject.setValue("");
        supportticketDescription.setValue("");
        this.clearFileChooser();
    }
});

});