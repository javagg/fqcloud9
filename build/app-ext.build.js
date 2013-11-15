({
    optimize: "none",
    preserveLicenseComments: false,
    baseUrl: "../",
    paths: {
        "text" : "node_modules/cloud9/build/text", // plugin for pulling in text! files
        "core" : "empty:",
        "ext/settings" : "empty:",
        "ext/main": "empty:",
        "ext/anims": "empty:",
        "ext/panels" : "empty:",
        "ext/menus" : "empty:",
        "ext/commands" : "empty:",
        "ext/dockpanel" : "empty:",
        "ext/editors" : "empty:",
        "ext/noderunner" : "empty:",
        "ace": "empty:",
//        "termjs": "node_modules/term.js/src/term",
//        "tty": "plugins-server/cloud9.ide.terminal/static/tty",
        "jquery": "plugins-server/cloud9.ide.highstock/static/jquery-1.8.3.min",
        "highstock": "plugins-server/cloud9.ide.highstock/static/highstock",
        'ext/metc': 'plugins-client/ext.metc',
        'ext/highstock': 'plugins-client/ext.highstock'
    },
    packages: [
//        {
//            "name": "engine.io",
//            "location": "node_modules/engine.io-client",
//            "main": "engine.io.js"
//        }
    ],
    include: [
//        "termjs",
//        "tty",
        "jquery",
        "highstock",
        'ext/metc/metc',
        'ext/highstock/highstock'
    ],
    exclude: [
        'text'
    ],
    out: "../node_modules/cloud9/plugins-client/lib.packed/www/c9os-ext.min.js",
//    inlineText: true,
    findNestedDependencies: true,
    optimizeAllPluginResources: false,
    useStrict: true,
    wrap: true
})