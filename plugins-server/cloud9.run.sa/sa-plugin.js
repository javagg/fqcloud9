var SaRunner = require("./sa-runner");
var ShellRunner = require("cloud9/plugins-server/cloud9.run.shell/shell").Runner;

module.exports = function setup(options, imports, register) {
    var pm = imports["process-manager"];
    var sandbox = imports.sandbox;
    var vfs = imports.vfs;

    SaRunner.call(this, options.url, vfs, pm, sandbox, function (err) {
        if (err) return register(err);
        register(null, { "run-sa": { Runner: SaRunner.Runner }});
    });
};

(function() {
    this.name = "sa";
    this.createChild = function(callback) {
        this.args = (this.saArgs || []).concat(this.file, this.scriptArgs);
        ShellRunner.prototype.createChild.call(this, callback);
    };
}).call(SaRunner.Runner.prototype);