.PHONY: ext worker mode theme package test

default: worker
update: worker

# makes ace; at the moment, requires dryice@0.4.2
ace:
	cd node_modules/cloud9; make ace;

# packages core
core: ace
	mkdir -p node_modules/cloud9/build/src
	node node_modules/cloud9/build/r.js -o build/patched.core.build.js

app_ext:
	node node_modules/cloud9/build/r.js -o build/app-ext.build.js

helper:
	cd node_modules/cloud9; node build/packed_helper.cloud9.js

helper_clean:
	cd node_modules/cloud9; node build/packed_helper.cloud9.js 1
	
# packages ext
ext:
	cd node_modules/cloud9; make ext #&& cd ../../; cp node_modules/cloud9/plugins-client/lib.packed/www/c9os.min.js build
	node node_modules/cloud9/build/r.js -o build/app-ext.build.js

worker:
	cd node_modules/cloud9; make worker;

mode:
	cd node_modules/cloud9; make mode;

# copies built ace themes
theme:
	cd node_modules/cloud9; make theme;

gzip_safe:
	cd node_modules/cloud9; make gzip_safe;

gzip:
	cd node_modules/cloud9; make gzip;

c9core: ace core worker mode theme
    
package_clean: helper_clean c9core ext

package: helper c9core ext

test check:
	cd node_modules/cloud9; make test check;

backup: package
	cp -f node_modules/cloud9/plugins-client/lib.packed/www/c9os.min.js build
	cp -f node_modules/cloud9/plugins-client/lib.packed/www/c9os-ext.min.js build

packit: worker
	mkdir -p node_modules/cloud9/plugins-client/lib.packed/www
	cp -f build/c9os.min.js node_modules/cloud9/plugins-client/lib.packed/www
	cp -f build/c9os-ext.min.js node_modules/cloud9/plugins-client/lib.packed/www