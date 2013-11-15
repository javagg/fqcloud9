define(function(require, exports, module) {
    var ext = require("core/ext");
    var ide = require("core/ide", function(ide) {
        require("termjs", function(termjs) {
            require("tty")
        });
    });
    var util = require("core/util");
    var settings = require("core/settings");
    var c9console = require('ext/console/console');

    var markup = require("text!ext/tty/tty.xml");
    var css = require("text!ext/tty/static/style.css")

//    var skin = require("text!ext/tty/skin.xml");
//    require("termjs", function(termjs) {
//        require("tty")
//    });

    module.exports = ext.register("ext/tty/tty", {
        name     : "Cloud9 Terminal",
        dev      : "Sten Feldman",
        alone    : true,
        deps     : [],
        type     : ext.GENERAL,
        markup   : markup,
//        skin     : {
//            id   : "newTerminalBtn",
//            data : skin,
//            "media-path" : ide.staticPrefix + "/ext/tty/static/images/",
//            "icon-path"  : ide.staticPrefix + "/ext/tty/static/icons/"
//        },
        css      : util.replaceStaticPrefix(css),
        deps     : [c9console],
        markupInsertionPoint: tabConsole,
        nodes : [],
        windows: [],
        terms: {},
        elements: {},

        init: function() {
            var _self = this;
            apf.importCssString(this.css);

            this.windows = [];
            this.terms = {};

            this.elements = {
                root: document.documentElement,
                body: document.body,
                pgOutput: document.getElementsByClassName('pgOutput')[0],
                pgTerminal: document.getElementsByClassName('pgTerminal')[0],
                newTerminal: document.getElementsByClassName('newTerminalBtn')[0]
            };

            var root = this.elements.root;
            var body = this.elements.body;
//            var pgOutput = this.elements.pgOutput;
//            var pgTerminal = this.elements.pgTerminal;
            var newTerminal = this.elements.newTerminal;

            var settings = require("core/settings");
            var c9console = require('ext/console/console');

            if (pgTerminal1) {
                pgTerminal1.addEventListener("mousedown", function(e) {
                    if (c9console.hiddenInput == false && settings.model.queryValue("auto/console/@showinput") == 'true') {
                        c9console.hideInput();
                        settings.model.setQueryValue("auto/console/@showinput", true);

                        pgOutput.addEventListener("click", function(e) {
                            if(settings.model.queryValue("auto/console/@showinput") == 'true') c9console.showInput();
                        })

                        var length = document.getElementsByClassName('pgConsole').length;

                        for (var i = 0; i < length; i++) {
                            pgConsole.addEventListener("click", function(e) {
                                if(settings.model.queryValue("auto/console/@showinput") == 'true') c9console.showInput();
                            })
                        }
                    }
                });
            }

            if (newTerminal1) {
                newTerminal1.addEventListener("click", function(e) {
                    var container = document.getElementsByClassName('page curpage')[0]

                    if(container != undefined && container.clientHeight < 370) {
                        var rows = container.clientHeight / 27 | 0;
                    }
                    if(container != undefined && container.clientWidth < 600) {
                        var cols = container.clientWidth / 8 | 0;
                    }

                    var transport = {
                        onMessage: function(cb) {
                            tty.socket.on("message", cb)
                        },
                        sendData: function(data) {
                            tty.socket.send(data)
                        }
                    }
                    var win = new tty.Window({transport:transport,rows:rows, cols:cols, resume: false});
                    tty.windows.push(win)
                    document.getElementById('terminalWindow1').appendChild(win.el);
               });
            }
        },

        hook: function() {
            var _self = this;
            ext.initExtension(this);
        },

        enable: function() {
            this.nodes.each(function(item) {
                item.enable();
            });
        },

        disable: function() {
            this.nodes.each(function(item) {
                item.disable();
            });
        },

        destroy : function() {
            this.nodes.each(function(item) {
                item.destroy(true, true);
            });
            this.nodes = [];
        }
    });
});