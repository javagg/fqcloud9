#!/usr/bin/env node

var http = require('http')
var argv = require('optimist').argv;

var httpProxy = require('http-proxy')
var HttpProxy = httpProxy.HttpProxy

var target = argv.target || "localhost:3131"
var options = {
  pathnameOnly: true,
  router: {
      '/ide': target
  }
}

var options2 = {
    router: {
        'strategy-saw.example.com': target
    }
};

HttpProxy.prototype._proxyWebSocketRequest = HttpProxy.prototype.proxyWebSocketRequest

HttpProxy.prototype.proxyWebSocketRequest = function(req, socket, upgradeHead, buffer) {
    this._proxyWebSocketRequest(req, socket, upgradeHead, buffer)
    socket.on('close', function(had_error) {
       console.log("socket close:" + had_error)
    })
    socket.on('error', function(exception) {
        console.log("socket error:" + exception)
    })

    socket.on('timeout', function() {
        console.log("socket timeout:")
    })
}

var server = httpProxy.createServer(options).listen(8300);
var proxy = server.proxy

proxy.on("proxyResponse", function(req, res, response) {
//   console.log(response)
})

proxy.on('webSocketProxyError', function(err, req, socket, head) {
    console.log(err)
})

proxy.on('websocket:start', function(req, socket, head, target) {
    console.log('websocket:start')
})

proxy.on('websocket:outgoing', function(req, socket, head, data) {
    console.log('websocket:outgoing')
})

proxy.on('websocket:incoming', function(reverseProxy, incoming, head, data) {
    console.log('websocket:incoming')
})

proxy.on('websocket:end', function(req, socket, head) {
    console.log('websocket:end')
})

proxy.on('websocket:handshake', function(req, socket, head, sdata, data) {
    console.log('websocket:handshake')
})
