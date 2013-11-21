Install node modules, using
  npm install --no-bin-links

===Build
PATH=`pwd`/node/bin:$PATH make package


Note:
1. "c9 behind proxy"
  i. reset require load path totally, see patch 'cloud9.proxy.static'
      use the following code to activate
      ---
        if (plugin.packagePath && /\.\/connect.static$/.test(plugin.packagePath)) {
            plugin.prefix = "static"
            plugin.workerPrefix = 'static'
            plugin.bindPrefix = '/' + plugin.prefix
        }




 
