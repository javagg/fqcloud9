Install node modules, using
  npm install --no-bin-links

===Build
make packit


===Build rpm 
on fedora:
  pkg_script/build_rpm_local
on rhel/centos
  scl enable nodejs010 "pkg_script/build_rpm_local"

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




 
