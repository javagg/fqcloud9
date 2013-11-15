// This file is stolen from node_modules/cloud9/build/core.build.js
// apf_patch.js is added
({
    optimize: "none",
    preserveLicenseComments: false,
    baseUrl: "../",
    paths: {
        "text" : "node_modules/cloud9/build/text", // plugin for pulling in text! files
        "core" : "node_modules/cloud9/plugins-client/cloud9.core/www/core",
        "treehugger" : "node_modules/cloud9/node_modules/treehugger/lib/treehugger",
        "v8debug": "node_modules/cloud9/node_modules/v8debug/lib/v8debug",
        "ext/main": "node_modules/cloud9/plugins-client/ext.main",
        "apf-packaged": "node_modules/cloud9/plugins-client/lib.apf/www/apf-packaged",

        // Added by freequant team
        "apf-patch": "plugins-server/cloud9.proxy.static/static/packed_apf_patch",

        // Needed because `r.js` has a bug based on packages config below:
        //   `Error evaluating module "undefined" at location "~/cloud9infra/node_modules/cloud9/events-amd.js"`
        "events-amd": "empty:"
    },
    packages: [
        {
            "name": "engine.io",
            "location": "node_modules/cloud9/node_modules/engine.io-client",
            "main": "engine.io.js"
        },
        {
            "name": "smith.io",
            "location": "node_modules/cloud9/plugins-server/c9.smith.io/www",
            "main": "client.js"
        },
        {
            "name": "smith",
            "location": "node_modules/cloud9/node_modules/smith",
            "main": "smith.js"
        },
        {
            "name": "msgpack-js",
            "location": "node_modules/cloud9/node_modules/msgpack-js-browser",
            "main": "msgpack.js"
        }
    ],
    include: [
        "node_modules/cloud9/node_modules/ace/build/src/ace",
        "node_modules/cloud9/node_modules/ace/build/src/theme-chrome",
        "node_modules/cloud9/node_modules/ace/build/src/theme-clouds",
        "node_modules/cloud9/node_modules/ace/build/src/theme-clouds_midnight",
        "node_modules/cloud9/node_modules/ace/build/src/theme-cobalt",
        "node_modules/cloud9/node_modules/ace/build/src/theme-crimson_editor",
        "node_modules/cloud9/node_modules/ace/build/src/theme-dawn",
        "node_modules/cloud9/node_modules/ace/build/src/theme-eclipse",
        "node_modules/cloud9/node_modules/ace/build/src/theme-idle_fingers",
        "node_modules/cloud9/node_modules/ace/build/src/theme-kr",
        "node_modules/cloud9/node_modules/ace/build/src/theme-merbivore",
        "node_modules/cloud9/node_modules/ace/build/src/theme-merbivore_soft",
        "node_modules/cloud9/node_modules/ace/build/src/theme-mono_industrial",
        "node_modules/cloud9/node_modules/ace/build/src/theme-monokai",
        "node_modules/cloud9/node_modules/ace/build/src/theme-pastel_on_dark",
        "node_modules/cloud9/node_modules/ace/build/src/theme-solarized_dark",
        "node_modules/cloud9/node_modules/ace/build/src/theme-solarized_light",
        "node_modules/cloud9/node_modules/ace/build/src/theme-textmate",
        "node_modules/cloud9/node_modules/ace/build/src/theme-tomorrow",
        "node_modules/cloud9/node_modules/ace/build/src/theme-tomorrow_night",
        "node_modules/cloud9/node_modules/ace/build/src/theme-tomorrow_night_blue",
        "node_modules/cloud9/node_modules/ace/build/src/theme-tomorrow_night_bright",
        "node_modules/cloud9/node_modules/ace/build/src/theme-tomorrow_night_eighties",
        "node_modules/cloud9/node_modules/ace/build/src/theme-twilight",
        "node_modules/cloud9/node_modules/ace/build/src/theme-vibrant_ink",
        "apf-packaged/apf_release",
        "apf-patch",
        "core/document",
        "core/ext",
        "core/ide",
        "core/settings",
        "core/util",
        "ext/main/main",
        "treehugger/traverse",
        "treehugger/js/parse",
        "v8debug/util",
        "v8debug/V8Debugger"
    ],
    exclude: [
        "text"
    ],
    out: "../node_modules/cloud9/build/src/core.packed.js",
    inlineText: true,
    findNestedDependencies: true,
    optimizeAllPluginResources: false,
    useStrict: true,
    wrap: true
})