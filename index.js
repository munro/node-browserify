var fs = require('fs');
var path = require('path');
var find = require('findit');

var npm = require('npm');
var finder = require('finder');

exports = module.exports = function (opts) {
    if (typeof opts === 'string') {
        opts = { base : opts };
        var opts_ = arguments[1];
        if (typeof opts_ === 'object') {
            Object.keys(opts_).forEach(function (key) {
                opts[key] = opts_[key];
            });
        }
    }
    
    if (!opts.mount) opts.mount = '/browserify.js';
    
    var src = wrappers.prelude
        + (opts.base ? find.sync(opts.base) : [])
            .filter(function (file) {
                return file.match(/\.js$/)
            })
            .map(wrapScript.bind({}, opts.base))
            .join('\n')
    ;
    
    npm.load(function () {
        // async middleware is hard >_<
        (opts.npm || []).forEach(function (name) {
            // this part mostly lifted from npm/lib/explore.js
            var nv = name.split('@');
            var n = nv[0], v = nv[1] || 'active';
            var dir = path.join(npm.dir, n, v, 'package')
            
            fs.stat(dir, function (err, stat) {
                if (err || !stat.isDirectory()) {
                    console.error("It doesn't look like "
                        + name + ' is installed.'
                    );
                }
                else wrapPackage(dir, function (err, wrapped) {
                    if (err) console.error(
                        'Error wrapping package ' + name + ': '
                        + (err.stack ? err.stack : err)
                    )
                    else src += wrapped
                });
            });
        });
    });
    
    return function (req, res, next) {
        if (req.url === opts.mount) {
            res.writeHead(200, { 'Content-Type' : 'text/javascript' });
            res.end(src);
        }
        else next();
    };
}

var wrappers = {
    prelude : fs.readFileSync(__dirname + '/wrappers/prelude.js', 'utf8'),
    body : fs.readFileSync(__dirname + '/wrappers/body.js', 'utf8'),
};

exports.wrapScript = wrapScript;
function wrapScript (base, filename) {
    var src = fs.readFileSync(filename, 'utf8');
    
    var bs = base.split('/');
    var rs = filename.split('/');
    for (var i = 0; i < bs.length && i < rs.length && bs[i] === rs[i]; i++);
    var rel = './' + rs.slice(i).join('/').replace(/^\.(?:\/|$)/,'');
    
    return wrappers.body
        .replace('$body', src)
        .replace(/\$filename/g, JSON.stringify(rel))
    ;
}

exports.wrapPackage = wrapPackage;
function wrapPackage (dir, cb) {
    fs.readFile(dir + '/package.json', 'utf8', function (err, body) {
        if (err) { cb(err); return }
        
        function resolve (p) {
            return require.resolve(dir + '/' + p);
        }
        
        var pkg = JSON.parse(body);
        if (pkg.main) {
            cb(null, wrapScript(dir, resolve(pkg.main)));
        }
        
        if (pkg.modules) {
            Object.keys(pkg.modules).forEach(function (name) {
                cb(null, wrapScript(dir, resolve(pkg.modules[name])));
            });
        }
        
        if (pkg.directory && pkg.directory.lib) {
            fs.readdir(pkg.directory.lib, function (err, files) {
                if (err) cb(err)
                else files.forEach(function (file) {
                    cb(null, wrapScript(
                        dir + '/' + pkg.directory.lib,
                        resolve(file)
                    ));
                })
            })
        }
    });
}
