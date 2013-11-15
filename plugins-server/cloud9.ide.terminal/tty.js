/**
 * tty.js
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 */

/**
 * Modules
 */

var path = require('path')
    , fs = require('fs')
    , Stream = require('stream').Stream
    , EventEmitter = require('events').EventEmitter;

var io = require('engine.io')
    , pty = require('pty.js')
    , term = require('term.js');

var logger = require('./logger');

/**
 * Server
 */

function Server(conf) {
    if (!(this instanceof Server)) {
        return new Server(conf);
    }

    var self = this;

    this.sessions = {};
    this.conf = conf;
    this.server = conf.server;
    this.io = io.attach(this.server, conf.io || { log: false });
    this.connection = conf.connection;
    this.init();
}

Server.prototype.init = function() {
    this.init = function() {};
    this.initIO();
};

Server.prototype.initIO2  = function() {
    var self = this
    var connection = this.connection

}

Server.prototype.initIO = function() {
    var self = this
        , io = this.io

    io.on('connection', function(socket) {
        var handleConnection = function(socket) {
            var transport = {
                send: function(message) {
                    console.log("ttmess: "+message)
                    socket.send(message)
                },
                disconnect: function() {
                    socket._events = {};
                    socket.$emit = function() {};
                    socket.disconnect();
                }
            }

            var session = new Session(transport, self.conf);
            self.sessions[session.id] = session;

            // XXX Possibly wrap socket events from inside Session
            // constructor, and do: session.on('create')
            // or session.on('create term').
            socket.on('message', function(data) {
                data = JSON.parse(data);
                console.log("tty.message: " + JSON.stringify(data))
                if (data.cmd == 'data') {
                    return session.handleData(data.id, data.payload);
                }
                if(data.cmd == 'create') {
                    return session.handleCreate(data.cols, data.rows);
                }
                if (data.cmd == 'kill') {
                    return session.handleKill(data.id);
                }
                if (data.cmd == 'move') {
                    return session.handleMove(data.id, data.left, data.top);
                }
                if (data.cmd == 'resize') {
                    return session.handleResize(data.id, data.cols, data.rows);
                }
                if (data.cmd == 'process') {
                    return session.handleProcess(data.id);
                }
                if (data.cmd == 'request paste') {
                    return session.handlePaste();
                }

                return console.log("Unknown message received: %s", JSON.stringify(data));

            });
            socket.on('close', function() {
                session.handleDisconnect();

                if (self.sessions[session.id]) {
                    delete self.sessions[session.id];
                }
                return
            });
        };

        return handleConnection(socket)
    });
};

//Server.prototype.log = function() {
//    return this._log('log', slice.call(arguments));
//};
//
//Server.prototype.error = function() {
//    return this._log('error', slice.call(arguments));
//};
//
//Server.prototype.warning = function() {
//    return this._log('warning', slice.call(arguments));
//};

Server.prototype._log = function(level, args) {
//    if (this.conf.log === false) return;
//    args.unshift(level);
//    return logger.apply(null, args);
};

Session.prototype.server_log = function(level, args) {
    args.unshift(level);
    return logger.apply(null, args);
};
/**
 * Session
 */


function Session(transport, server_conf) {
    this.transport = transport
    this.terms = {};
//    this.req = socket.request;

    this.server_conf = server_conf
    var conf = server_conf
        , terms = this.terms
//        , sessions = this.server.sessions
//        , req = socket.request;

    this.id = this.uid();
    this.log('Session \x1b[1m%s\x1b[m created.', this.id);
}

Session.uid = 0;

Session.prototype.uid = function() {
    return Session.uid++ + '';
};

Session.prototype.disconnect = function() {
    try {
        this.transport.disconnect()
    } catch (e) {
        ;
    }
    this.clearTimeout();
};

Session.prototype.log = function() {
    return this._log('log', slice.call(arguments));
};

Session.prototype.error = function() {
    return this._log('error', slice.call(arguments));
};

Session.prototype.warning = function() {
    return this._log('warning', slice.call(arguments));
};

Session.prototype._log = function(level, args) {
    if (typeof args[0] !== 'string') args.unshift('');
    var id = this.id.split('|')[0];
    args[0] = '\x1b[1m' + id + '\x1b[m ' + args[0];
    return this.server_log(level, args);
};

Session.prototype.sync = function() {
    var self = this
        , terms = {}
        , queue = [];

    Object.keys(this.terms).forEach(function(key) {
        var term = self.terms[key];
        terms[key] = {
            id: term.pty,
            pty: term.pty,
            cols: term.cols,
            rows: term.rows,
            left: term.left,
            top: term.top,
            process: sanitize(term.process)
        };
    });

    Object.keys(self.terms).forEach(function(key) {
        var term = self.terms[key]
            , cols = term.cols
            , rows = term.rows;

        // A tricky way to get processes to redraw.
        // Some programs won't redraw unless the
        // terminal has actually been resized.
        term.resize(cols + 1, rows + 1);
        queue.push(function() {
            term.resize(cols, rows);
        });

        // Send SIGWINCH to our processes, and hopefully
        // they will redraw for our resumed session.
        // self.terms[key].kill('SIGWINCH');
    });

    setTimeout(function() {
        queue.forEach(function(item) {
            item();
        });
    }, 30);

    if(!isEmpty(terms))
        self.sendMessage(JSON.stringify({cmd: 'sync', terms: terms}));
};

Session.prototype.handleCreate = function(cols, rows) {
    var self = this
        , terms = this.terms
        , conf = this.server_conf;

    var len = Object.keys(terms).length
        , term
        , id;

    if (len >= conf.limitPerUser || pty.total >= conf.limitGlobal) {
        this.warning('Terminal limit reached.');
        self.sendMessage(JSON.stringify({cmd: 'createACK', error: 'Terminal limit.' }));
    }

    var shell = typeof conf.shell === 'function'
        ? conf.shell(this)
        : conf.shell;

    var shellArgs = typeof conf.shellArgs === 'function'
        ? conf.shellArgs(this)
        : conf.shellArgs;

    term = pty.fork(shell, shellArgs, {
        name: conf.termName,
        cols: cols,
        rows: rows,
        cwd: conf.cwd || process.env.HOME
    });

    id = term.pty;
    terms[id] = term;
    terms[id].left = '';
    terms[id].top = '';

    term.on('data', function(data) {
        //console.log('<- ID: %s | Payload: %s | Socket: %s', id, data, self.socket.readyState);
        self.sendMessage(JSON.stringify({cmd: 'data', id: id, payload: data}));
    });

    term.on('close', function() {
        // Make sure it closes
        // on the clientside.
        self.sendMessage(JSON.stringify({cmd: 'killACK', id: id}));

        // Ensure removal.
        if (terms[id]) delete terms[id];

        self.log(
            'Closed pty (%s): %d.',
            term.pty, term.fd);
    });

    this.log(
        'Created pty (id: %s, master: %d, pid: %d).',
        id, term.fd, term.pid);

    self.sendMessage(JSON.stringify({cmd: 'createACK', id: id, pty: term.pty, process: sanitize(conf.shell)}))
};

Session.prototype.sendMessage = function(message) {
    this.transport.send(message)
}

Session.prototype.handleData = function(id, data) {
    //console.log('-> ID: %s | Payload: %s', id, data);
    var terms = this.terms;
    if (!terms[id]) {
        this.warning(''
            + 'Client attempting to'
            + ' write to a non-existent terminal.'
            + ' (id: %s)', id);
        return;
    }
    terms[id].write(data);
};

Session.prototype.handleKill = function(id) {
    var terms = this.terms;
    if (!terms[id]) return;
    terms[id].destroy();
    delete terms[id];
};

Session.prototype.handleMove = function(id, left, top) {
    var terms = this.terms;
    if (!terms[id]) return;
    terms[id].left = left;
    terms[id].top = top;
}

Session.prototype.handleResize = function(id, cols, rows) {
    var terms = this.terms;
    if (!terms[id]) return;
    terms[id].resize(cols, rows);
};

Session.prototype.handleProcess = function(id) {
    var terms = this.terms;
    if (!terms[id]) return;
    var name = terms[id].process;
    this.sendMessage(JSON.stringify({cmd: 'processACK', id: id, name: sanitize(name)}))
};

Session.prototype.handleDisconnect = function() {
    var self = this
        , terms = this.terms

    // XXX Possibly create a second/different
    // destroy function to accompany the one
    // above?
    function destroy() {
        var key = Object.keys(terms)
            , i = key.length
            , term;

        while (i--) {
            term = terms[key[i]];
            delete terms[key[i]];
            term.destroy();
        }
    }

    this.log('Client disconnected.');
    destroy()
    self.log('Killing all pty\'s.');
    return ;
};

Session.prototype.handlePaste = function() {
    var self = this;
    var execFile = require('child_process').execFile;

    function exec(args) {
        var file = args.shift();
        return execFile(file, args, function(err, stdout, stderr) {
            if (err)
                return self.sendMessage(JSON.stringify({cmd: 'pasteACK', error: err}));


            if (stderr && !stdout)
                return self.sendMessage(JSON.stringify({cmd: 'pasteACK', error: new Error(stderr)}));

            self.sendMessage(JSON.stringify({cmd: 'pasteACK', stdout: stdout}))
        });
    }

    // X11:
    return exec(['xsel', '-o', '-p'], function(err, text) {
        if (!err) return func(null, text);
        return exec(['xclip', '-o', '-selection', 'primary'], function(err, text) {
            if (!err) return func(null, text);
            // Mac:
            return exec(['pbpaste'], function(err, text) {
                if (!err) return func(null, text);
                // Windows:
                // return exec(['sfk', 'fromclip'], function(err, text) {
                return func(new Error('Failed to get clipboard contents.'));
            });
        });
    });
};

Session.prototype.setTimeout = function(time, func) {
    this.clearTimeout();
    this.timeout = setTimeout(func.bind(this), time);
};

Session.prototype.clearTimeout = function() {
    if (!this.timeout) return;
    clearTimeout(this.timeout);
    delete this.timeout;
};

// Server Methods
Object.keys(EventEmitter.prototype).forEach(function(key) {
    if (Server.prototype[key]) return;
    Server.prototype[key] = function() {
        return this.server[key].apply(this.server, arguments);
    };
});

/**
 * Helpers
 */

var slice = Array.prototype.slice;

function sanitize(file) {
    if (!file) return '';
    file = file.split(' ')[0] || '';
    return path.basename(file) || '';
}

function applyConfig() {
    var hasOwnProperty = Object.prototype.hasOwnProperty;

    for (var key in Terminal._opts) {
        if (!hasOwnProperty.call(Terminal._opts, key)) continue;
        if (typeof Terminal._opts[key] === 'object' && Terminal._opts[key]) {
            if (!Terminal[key]) {
                Terminal[key] = Terminal._opts[key];
                continue;
            }
            for (var k in Terminal._opts[key]) {
                if (hasOwnProperty.call(Terminal._opts[key], k)) {
                    Terminal[key][k] = Terminal._opts[key][k];
                }
            }
        } else {
            Terminal[key] = Terminal._opts[key];
        }
    }

    delete Terminal._opts;
}

/**
 * Utility
 */

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

/**
 * Expose
 */

exports = Server;
exports.Server = Server;
exports.Session = Session;
exports.logger = logger;
exports.createServer = Server;

module.exports = exports;