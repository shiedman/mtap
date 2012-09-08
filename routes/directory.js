/*
 ** shiedman (shiedman@gmail.com)
 ** directory listing
 **
 */

var util=require('util');
var fs = require('fs')
  , parse = require('url').parse
  , path = require('path')
  , normalize = path.normalize
  , extname = path.extname
  , join = path.join;

function _error(code){
  var err = new Error(http.STATUS_CODES[code]);
  err.status = code;
  return err;
}
exports.directory=function(root){
    root=normalize(root);

return function (req,res,next){
    var accept = req.headers.accept || 'text/plain'
      , url = parse(req.url)
      , dir = decodeURIComponent(url.pathname)
      , path = normalize(join(root, dir));
    // null byte(s), bad request
    if (~path.indexOf('\0')) return next(_error(400));

    // malicious path, forbidden
    if (0 != path.indexOf(root)) return next(_error(403));

    // check if we have a directory
    fs.stat(path, function(err, stat){
        if (err) return 'ENOENT' == err.code ? next() : next(err);
        if (!stat.isDirectory()) return next();

        // fetch files
        files=fs.readdirSync(path);
        files.sort();
        var list=[];
        for (var i in files){
            var f=files[i];
            var fstat=fs.statSync(join(path,f));
            //var href=join(dir,encodeURIComponent(f));
            var href=join(dir,f);
            var d=fstat.mtime;
            var dt=util.format('%s-%s-%s',d.getFullYear(),d.getMonth()+1,d.getDate());
            dt+=' '+d.toLocaleTimeString();
            var o={};
            o.up=!fstat.isDirectory() && fstat.size>10000000;
            o.style=fstat.isDirectory()?'icon-folder-close':'icon-file';
            o.href=encodeURI(href.replace(/\\/g,'/'));
            o.uploadURL='/_upload'+o.href;
            o.filename=f;
            o.size=fstat.isDirectory()? '[DIR]':get_file_size(fstat.size);
            o.date=dt;
            list.push(o);
        }
        res.render('files',{files:list,p:join(dir,'..'),root:dir});
    });
}
};

//返回文件大小
function get_file_size(size)
{
	var kb = 1024; // Kilobyte
	var mb = 1024 * kb; // Megabyte
	var gb = 1024 * mb; // Gigabyte
	return size < kb ? size+'B' : size < mb ? (size / kb).toFixed(2)+'K' : size < gb ? (size / mb).toFixed(2)+'M' : (size / gb).toFixed(2)+'G';
}
