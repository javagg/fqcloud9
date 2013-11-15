/*global window apf console*/
define(function(require, exports, module) {
"use strict";

var ide = require("core/ide");
var Collab = require("ext/collaborate/collaborate");

var jQuery = require("jQuery");
var utils = require('./utils');

require("./jquery.timeago");
// var Tinycon = require('../lib/tinycon');
var emoji = require("./my_emoji");

var seenMsgs = {};
var throbTimeout;

var self = {
    show: function () {
        jQuery("#chaticon").hide();
        jQuery("#chatbox").show();
        setTimeout(function(){
            jQuery("#chatinput").focus();
        });
        self.scrollDown();
        // Tinycon.setBubble(0);
        ide.dispatchEvent("track_action", {type: "chat"});
    },
    hide: function () {
        jQuery("#chatcounter").text("0");
        jQuery("#chaticon").show();
        jQuery("#chatbox").hide();
    },
    scrollDown: function() {
        if(jQuery('#chatbox').css("display") != "none"){
            if(!self.lastMessage || !self.lastMessage.position() || self.lastMessage.position().top < jQuery('#chattext').height()) {
                jQuery('#chattext').animate({scrollTop: jQuery('#chattext')[0].scrollHeight}, "fast");
                self.lastMessage = jQuery('#chattext > p').eq(-1);
            }
        }
    },
    send: function() {
        var text = jQuery("#chatinput").val();
        text = emoji.toEmojiUnicode(text);
        this.socket.send({
            command: "vfs-collab",
            type: "CHAT_MESSAGE",
            data: { text: text }
        });
        jQuery("#chatinput").val("");

        ide.dispatchEvent("track_action", {type: "chat"});
    },
    addMessage: function(msg, increment) {
        if (seenMsgs[msg.id])
            return;
        seenMsgs[msg.id] = true;
        //correct the time
        // msg.timestamp += this._pad.clientTimeOffset;
        msg.timestamp = new Date(msg.timestamp);

        //create the time string
        var msgDate = new Date(msg.timestamp);
        var text = utils.escapeHtmlWithClickableLinks(msg.text.trim(), "_blank");
        text = text.replace(/\n/g, '<br/>');
        text = emoji.emoji(text);

        var user = self.WS.users[msg.userId];
        var authorName = utils.escapeHTML(user.fullname);
        var color = self.WS.colorPool[msg.userId];
        var authorColor = utils.formatColor(color);

        var authorNameEl = jQuery("<a href='javascript:void(0)' style='text-decoration: none'><b>" + authorName + "</b></a>").click(function () {
            Collab.showMembers();
            Collab.selectMember(msg.userId);
        });

        var chatOpen = jQuery("#chatbox").is(":visible");

        var html;
        var chatThrob = jQuery('#chatthrob');
        var throbText = "";

        var notif = msg.notification;
        if (notif) {
            html = jQuery("<p class='author'>").css("color", "gray")
                .append(authorNameEl.css("color", "gray"))
                .append("<span> " + text + "</span>");

            if (notif.linkText) {
                html.append(jQuery("<a href='javascript:void(0)'>" + notif.linkText + "</a>").click(function() {
                    notif.linkHandler();
                }));
                throbText = "<b>" + authorName + "</b> " + text + " " + notif.linkText;
            }

            html.append("<br/>").append(jQuery("<span class='chattime timeago' title='" + msgDate.toISOString() + "'>" + msgDate + "</span> ").timeago());
        }
        else {
            html = jQuery("<p class='author'>")
                .append(authorNameEl.css("color", "black"))
                .append("<span style='color:" + authorColor + "'>: " + text + "<br/></span>")
                .append(jQuery("<span class='chattime timeago' title='" + msgDate.toISOString() + "'>" + msgDate + "</span> ").timeago());
                throbText = "<b>"+authorName+"</b>" + ": " + text;
        }

        jQuery("#chattext").append(html);

        //should we increment the counter??
        if(increment) {
            var count = Number(jQuery("#chatcounter").text());
            count++;

            // is the users focus already in the chatbox?
            var inputFocussed = jQuery("#chatinput").is(":focus");

            if (!inputFocussed)
                jQuery("#chat-notif").get(0).play();
            if (!chatOpen) {
                chatThrob.html(throbText).show();
                clearTimeout(throbTimeout);
                throbTimeout = setTimeout(function () {
                    chatThrob.hide(500);
                }, 5000);
            }

            jQuery("#chatcounter").text(count);
        }
         // Clear the chat mentions when the user clicks on the chat input box
        // jQuery('#chatinput').click(function(){
            // Tinycon.setBubble(0);
        // });
        self.scrollDown();
    },
    init: function(WS, socket) {
        self.WS = WS;
        if (!/r/.test(WS.fs))
            return console.warn("Don't have read access - You can't use chat");

        jQuery.each(WS.chatHistory, function(i, o) {
            self.addMessage(o);
        });
        jQuery("#chatcounter").text(WS.chatHistory.length);
        if (self.socket) // previously inited
            return;
        self.socket = socket;
        var chatInputBox = jQuery("#chatinput");
        chatInputBox.keypress(function(evt) {
            //if the user typed enter, fire the send
            if (evt.which == 13 || evt.which == 10)
            if (!evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey){
                evt.preventDefault();
                self.send();
            }
        });
        chatInputBox.keydown(function(evt) {
            if (evt.which == 27) {
                self.hide();
            }
        });
        chatInputBox.focus(function() {
            if (typeof apf !== "undefined" && apf.activeElement)
                apf.activeElement.blur();
        });

        var chatText = jQuery('#chattext');
        autoResizeChatText(chatInputBox.get(0), function (height) {
            // self.scrollDown(); - flaky scrolling
            chatText.css("bottom", height+12);
        });

        jQuery("#chaticon").click(function () {
            self.show();
            return false;
        });

        jQuery("#chatmembers").click(function () {
            Collab.showMembers();
        });

        jQuery("#chatthrob").click(function () {
            jQuery(this).hide();
            self.show();
        });

        jQuery("#chatcross").click(function () {
            self.hide();
            return false;
        });
    }
};

function autoResizeChatText(text, resizeCallback) {
    var observe;
    if (window.attachEvent) {
        observe = function (element, event, handler) {
            element.attachEvent('on'+event, handler);
        };
    }
    else {
        observe = function (element, event, handler) {
            element.addEventListener(event, handler, false);
        };
    }

    function resize () {
        text.style.height = 'auto';
        var height = text.scrollHeight || 13;
        text.style.height = height+'px';
        resizeCallback(height);
    }
    /* 0-timeout to get the already changed text */
    function delayedResize () {
        window.setTimeout(resize, 5);
    }
    observe(text, 'change',  delayedResize);
    observe(text, 'cut',     delayedResize);
    observe(text, 'paste',   delayedResize);
    observe(text, 'drop',    delayedResize);
    observe(text, 'keydown', delayedResize);

    text.focus();
    text.select();
    resize();
}

module.exports = self;

});