/**
 * Terminal for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
/*global self barTerminal tabEditors*/

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var util = require("core/util");
var markup = require("text!ext/terminal/terminal.xml");
var editors = require("ext/editors/editors");
var Aceterm = require("./aceterm/aceterm");
var Terminal = require("./aceterm/libterm");
var Monitor = require("ext/terminal/monitor");
var commands = require("ext/commands/commands");
var menus = require("ext/menus/menus");
var settings = require("ext/settings/settings");

var cssString = require("text!ext/terminal/style.css");
var markupSettings = require("text!ext/terminal/settings.xml");


Terminal.prototype.onResize = function(width, height) {
    if (this.preventResize)
        return;

    if (!this.fd)
        return;

    var terminal = this;
    var ace      = this.aceSession && this.aceSession.ace;
    
    if (!terminal || !ace) return;

    var size   = ace.renderer.$size;
    var config = ace.renderer.layerConfig;
    
    var h = size.scrollerHeight;
    var w = size.scrollerWidth - 2 * config.padding;

    if (!h || config.lineHeight <= 1)
        return false;

    // top 1px is for cursor outline
    var rows = Math.floor((h - 1) / config.lineHeight);
    var cols = Math.floor(w / config.characterWidth);

    cols = Math.max(cols, 1);
    rows = Math.max(rows, 1);

    if (cols == 1 || rows == 1)
        return;

    // Don't do anything if the size remains the same
    if (cols == terminal.cols && rows == terminal.rows)
        return;

    terminal.resize(cols, rows);
    ide.send({
        command: "ttyResize",
        fd: this.fd,
        cols: cols,
        rows: rows
    });
};

/**
 * TODO:
 * - bug: server crashes when reinstating terminal
 *
 * LATER:
 * - popout feature
 */
module.exports = ext.register("ext/terminal/terminal", {
    name    : "Terminal",
    dev     : "Ajax.org",
    type    : ext.EDITOR,
    markup  : markup,
    offline : false,
    deps    : [editors],
    fileExtensions : ["#!terminal"],

    nodes : [],
    terminals : {},
    requests : {},

    counter : 0,

    focus : function(){
        var page = tabEditors.getPage();
        if (!page) return;

        this.container.ace.focus();
    },

    getState : function(doc){
        if (!doc.terminal)
            return;

        return {
            // Temporarily disabled to avoid saving and requesting bash history
            // back and forth.
            /*
            "ydisp": doc.terminal.ydisp,
            "y": doc.terminal.y,
            "x": doc.terminal.x,
            "ybase": doc.terminal.ybase,
            "scrollBottom": doc.terminal.scrollBottom,
            "scrollTop": doc.terminal.scrollTop,
            "lines": doc.terminal.lines,
            */
            "fd": doc.terminal.fd,
            "width": barTerminal.lastWidth || barTerminal.getWidth(),
            "height": barTerminal.lastHeight || barTerminal.getHeight(),
            "type": "nofile"
        };
    },

    setState : function(doc, state, terminal){
        var fd = state.fd;
        if (fd && terminal.fd || this.terminals[fd])
            delete state.fd;

        for (var prop in state) {
            terminal[prop] = state[prop];
        }
        if (state.fd)
            this.terminals[fd] = terminal;
    },
    
    createAceterm: function(barTerminal) {
        // Fetch Reference to the HTML Element
        var container = barTerminal.firstChild.$ext;
        
        // todo do we need barTerminal or e.htmlNode
        var ace = Aceterm.createEditor();
        var st = ace.container.style;
        st.position = "absolute";
        st.left    = "0px";
        st.right   = "0px";
        st.top     = "0px";
        st.bottom  = "0px";
        st.background = "transparent";
        st.color = Terminal.defaultColors.fg;
        ace.setTheme({cssClass: "terminal", isDark: true});
        container.appendChild(ace.container);
        
        ace.on("focus", function() {
            if (barTerminal && barTerminal.$ext && window.apf)
                apf.setStyleClass(barTerminal.$ext, "c9terminalFocus");
            barTerminal.firstChild.focus();
        });
        ace.on("blur", function() {
            if (barTerminal && barTerminal.$ext && window.apf)
                apf.setStyleClass(barTerminal.$ext, null, ["c9terminalFocus"]);
            barTerminal.firstChild.blur();
        });
        
        barTerminal.firstChild.$focussable = true;
        barTerminal.firstChild.focus = function() {
            ace.focus();
        };
        barTerminal.firstChild.blur = function() {
            ace.blur();
        };
        
        var cm = commands;
        // TODO find better way for terminal and ace commands to coexist
        setTimeout(function() {
            ace.commands.addCommands([{
                    bindKey: {win: "F12", mac: "F12|cmd-`"},
                    name:"passKeysToBrowser",
                    passEvent: true,
                    exec:function(){}
                },
                cm.commands.find,
                cm.commands.openterminal,
                cm.commands.gotofile,
                cm.commands.searchinfiles,
                cm.commands.searchinfiles,
                cm.commands.close_term_pane,
                cm.commands.closeallbutme,
                cm.commands.closealltabs,
                cm.commands.closealltotheleft,
                cm.commands.closealltotheright,
                cm.commands.closepane,
                cm.commands.closetab,
                cm.commands.movetabright,
                cm.commands.movetableft,
                cm.commands.movetabup,
                cm.commands.movetabdown,
                cm.commands.nexttab,
                cm.commands.previoustab,
                cm.commands.hidesearchreplace || {},
                cm.commands.hidesearchinfiles || {},
                cm.commands.toggleconsole || {}
            ].filter(function(x){return x}));
        }, 1000);
        ace.commands.exec = function(command) {
            return cm.exec(command, {ace: ace});
        };
        
        return container.ace = ace;
    },

    setDocument : function(doc, actiontracker){
        var _self = this;

        //Remove the previously visible terminal
        if (!this.ace)
            this.ace = this.createAceterm(barTerminal);

        if (!doc.terminal && !doc.starting) {
            doc.starting = true;
            doc.editor   = this;

            var node = doc.getNode();
            node.setAttribute("name", node.getAttribute("name").split(".")[0]);

            var terminal = _self.newTab(function(err, terminal) {
                if (err) {
                    util.alert(
                        "Error opening Terminal",
                        "Error opening Terminal",
                        "Could not open terminal with the following reason:"
                            + err);

                    return;
                }

                terminal.$monitor = new Monitor(terminal);

                var cb = function(){
                    if (doc.state) {
                        barTerminal.lastWidth = barTerminal.getWidth();
                        barTerminal.lastHeight = barTerminal.getHeight();

                        terminal.onResize(doc.state.width, doc.state.height);
                        terminal.preventResize = true;
                        terminal.restoringState = true;

                        var timer;
                        terminal.onafterresize = function(){
                            clearTimeout(timer);

                            _self.setState(doc, doc.state, terminal);
                            terminal.preventResize = false;
                            terminal.restoringState = false;

                            terminal.onResize(
                                barTerminal.lastWidth,
                                barTerminal.lastHeight);

                            delete terminal.onafterresize;
                        };

                        timer = setTimeout(function(){
                            terminal.onafterresize();
                        }, 5000);
                    }
                    else {
                        terminal.onResize();
                    }
                };

                //Check if barTerminal is visible or wait for it
                if (apf.window.vManager.check(barTerminal, "term" + terminal.fd, cb))
                    cb();

                menus.addItemByPath("View/Terminals/"
                  + doc.getNode().getAttribute("name"),
                  doc.mnuItem = new apf.item({
                    onclick : function(){
                        tabEditors.set(doc.getNode().getAttribute("path"));
                    }
                }), 300);

                terminal.on("title", function(title){
                    apf.xmldb.setAttribute(doc.getNode(), "name", title);
                    //apf.xmldb.setAttribute(doc.getNode(), "path", title);

                    doc.mnuItem.setAttribute("caption", title);
                });

                doc.terminal = terminal;
                doc.starting = false;
                doc.dispatchEvent("init");
            }, doc.state && doc.state.fd);

            doc.addEventListener("close", function(e){
                if (this.editor != _self || !doc.terminal)
                    return;

                if (doc.mnuItem && doc.mnuItem.parentNode)
                    doc.mnuItem.parentNode.removeChild(doc.mnuItem);

                var fd = doc.terminal.fd;
                if (!fd)
                    return;

                doc.terminal.fd = null;

                ide.send({
                    command: "ttyKill",
                    fd: fd
                });

                delete _self.terminals[fd];
            });
            
            this.container.ace.setSession(terminal.aceSession);
        }
        else if (doc.terminal){
            this.container.ace.setSession(doc.terminal.aceSession);
            doc.terminal.onResize();
            this.focus();
        }
    },

    hook : function() {
        var _self = this;

        menus.addItemByPath("View/Terminals", null, 195),
        menus.addItemByPath("View/Terminals/New Terminal",
          this.mnuItem = new apf.item({
              command  : "openterminal"
          }), 100),
        menus.addItemByPath("View/Terminals/~", new apf.divider(), 200);

        commands.addCommand({
            name: "openterminal",
            hint: "Opens a new terminal window",
            msg: "opening terminal.",
            bindKey: {mac: "Option-T", win: "Alt-T"},
            exec: function (editor) {
                _self.openNewTerminal();
            }
        });

        ide.addEventListener("settings.load", function(e) {
            settings.setDefaults("auto/terminal", [
                ["fontfamily", "Monaco, Ubuntu Mono, Menlo, Consolas, monospace"],
                ["fontsize", "12"],
                ["blinking", "true"],
                ["scrollback", "1000"]
            ]);
        });

        settings.addSettings("Terminal", markupSettings);
        
        ide.addEventListener("socketMessage", function (evt) {
            var message = evt.message;
            if (message.command === "ttyCallback"
              || message.command === "ttyData"
              || message.command === "ttyGone"
              || message.command === "ttyResize") {
                _self[message.command](message);
                settings.save();
            }
        });

        // ide.addEventListener("init.ext/console/console", function() {
        //     cliBox.appendChild(new apf.button({
        //         "skin":"c9-simple-btn",
        //         "class":"btn-terminal",
        //         "margin": "6 0 0 4",
        //         "caption":"Open a Terminal",
        //         "icon" : "terminal_tab_icon.png",
        //         "onclick": "require('ext/terminal/terminal').openNewTerminal();"
        //     }), btnCollapseConsole);
        //     cliBox.appendChild(new apf.divider({
        //         "skin":"divider_console",
        //         "margin": "2 0 2 7"
        //     }), btnCollapseConsole);
        // });
    },
    
    addCss : function() {
        if (cssString) {
            apf.importCssString(cssString);
            cssString = "";
        }
    },

    init : function() {
        var _self = this;
        var editor = barTerminal;

        this.addCss();

        this.container = barTerminal.firstChild.$ext;
        barTerminal.firstChild.$isTextInput = function(){return true};
        barTerminal.firstChild.disabled = false;

        //Nothing to save
        ide.addEventListener("beforefilesave", function(e) {
            var page = tabEditors.getPage();
            return !(page && page.$doc && (page.$doc.terminal || page.$doc.starting));
        });

        editor.show();

        /* Initialize the Terminal */

        // Keep the terminal resized
        barTerminal.addEventListener("resize", function() {
            if (!this.$ext.offsetWidth && !this.$ext.offsetHeight)
                return;

            this.lastWidth = this.getWidth();
            this.lastHeight = this.getHeight();

            if (_self.ace)
                _self.ace.renderer.onResize();
        });

        barTerminal.addEventListener("prop.blinking", function(e){
            Terminal.cursorBlink = apf.isTrue(e.value);
        });
        barTerminal.addEventListener("prop.fontfamily", function(e){
            apf.setStyleRule(".c9terminal .c9terminalcontainer .terminal",
                "font-family",
                e.value || "Ubuntu Mono, Monaco, Menlo, Consolas, monospace");
        });
        barTerminal.addEventListener("prop.fontsize", function(e){
            apf.setStyleRule(".c9terminal .c9terminalcontainer .terminal",
                "font-size",
                e.value ? e.value + "px" : "10px");
        });
        barTerminal.addEventListener("prop.scrollback", function(e){
            Terminal.scrollback = parseInt(e.value) || 1000;
        });

        // Check if all terminals are still active
        ide.addEventListener("afteronline", function(){
            for (var fd in _self.terminals) {
                ide.send({
                    command: "ttyPing",
                    fd: fd
                });
            }
        });
    },
    
    openNewTerminal: function(){
        editors.gotoDocument({
            path: "Terminal" + ++this.counter + ".#!terminal",
            type: "nofile"
        });
    },
    
    // Serialize a callback
    request : function (callback) {
        var reqId;
        while (this.requests.hasOwnProperty(reqId = Math.random() * 0x100000000));
        this.requests[reqId] = callback;
        return reqId;
    },

    // [reqId, fd]
    ttyCallback: function(message) {
        var reqId = message.reqId;
        var request = this.requests[reqId];
        delete this.requests[reqId];

        request(message.error, message);
    },

    // [fd, data]
    ttyData: function(message) {
        var term = this.terminals[message.fd];
        if (term) {
            term.$monitor.onData(message.data);
            term.write(message.data);
        }
    },

    // []
    ttyResize : function(message){
        var term = this.terminals[message.fd];
        if (term && term.onafterresize) {
            term.onafterresize();
            delete term.onafterresize;
        }
    },

    // []
    ttyGone : function(message){
        var term = this.terminals[message.fd];
        if (term) {
            delete term.fd;
            delete this.terminals[message.fd];
            this.restart(term);
        }
    },

    newTab: function (callback, fd) {
        var _self = this;
        var terminal = new Aceterm(80, 24, function(data) {
            if (!terminal.fd || terminal.reconnecting || terminal.terminated) {
                console.warn("Dropping input", data);
                return;
            }
            ide.send({
                command: "ttyData",
                fd: terminal.fd,
                data: data
            });
        });
        
        terminal.aceSession.resize = terminal.onResize.bind(terminal);

        var cb = function(err, message) {
            if (err)
                return callback(err, terminal);

            terminal.fd = message.fd;
            _self.terminals[message.fd] = terminal;
            callback(null, terminal);
        };

        if (!fd) {
            var reqId = this.request(cb);

            ide.send({
                command: "ttyCreate",
                reqId: reqId
            });
        }
        else {
            ide.send({
                command: "ttyPing",
                fd: fd
            });
            
            cb(null, {fd: fd});
        }
        
        return terminal;
    },

    restart : function(terminal){
        var _self = this;

        if (terminal.reconnecting || terminal.restoringState)
            return;

        terminal.writeln("");
        terminal.write("Connection Terminated. Reconnecting...");
        terminal.reconnecting = true;

        var cb = function(err, message) {
            terminal.reconnecting = false;

            if (err) {
                terminal.writeln(" Failed.");
                terminal.terminated = true;
                terminal.fd = "";
                terminal.onFdUpdate && terminal.onFdUpdate();
                return;
            }

            terminal.writeln(" Done.");

            if (terminal.fd)
                delete _self.terminals[terminal.fd];

            terminal.fd = message.fd;
            _self.terminals[message.fd] = terminal;
            
            terminal.onFdUpdate && terminal.onFdUpdate();

            terminal.onResize();
        };

        var reqId = this.request(cb);

        ide.send({
            command: "ttyCreate",
            reqId: reqId
        });
    }
});

});
