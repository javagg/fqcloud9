plugins = require('../node_modules/cloud9/configs/dav.js')

// patch packagePath for ./connect.session.memory

plugins.forEach(function(plugin) {
    if (plugin.packagePath) {

        // patch packagePath for ./connect.session.memory
        if (/\/connect.session.memory$/.test(plugin.packagePath)) {
            plugin.packagePath = "../../../plugins-server/connect.session.memory"
        }
        if (/\/cloud9.fs.vfs$/.test(plugin.packagePath)) {
            delete plugins[plugin]
        }
    }
});

module.exports = plugins