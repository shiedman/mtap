/*
 ** shiedman (shiedman@gmail.com)
 ** directory listing
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
/** listing files under <<root>> **/
exports.directory=function(root){
    root=normalize(root);
    /** map http request path to filesystem path **/
    return function (req,res,next){
        var accept = req.headers.accept || 'text/plain'
          , url = parse(req.url)
          , dir = decodeURIComponent(url.pathname)
          , path = normalize(join(root, dir));
        // null byte(s), bad request
        if (~path.indexOf('\0')) return next(_error(400));

        // malicious path, forbidden
        if (0 != path.indexOf(root)) return next(_error(403));

        fs.exists(path,function(exists){
            if(!exists)return next();
            fs.stat(path,function(err,stats){
                if(err){
                    console.info('failed to read path :%s',path);
                    console.info(err);
                    next();
                }else if(stats.isDirectory()){
                    filelist(dir,path,req,res);
                }else{
                    next();
                }
            });
        });
    };
};
/**
 * listing files , sort by isdir,filename
 */
function filelist(dir,path,req,res){
    // fetch files
    files=fs.readdirSync(path);
    files.sort();
    var list=[];
    for (var i=0;i<files.length;i++){
        var f=files[i];
        var fstat=fs.statSync(join(path,f));
        var href=join(dir,f);
        var d=fstat.mtime;
        var dt=util.format('%s-%s-%s',d.getFullYear(),d.getMonth()+1,d.getDate());
        dt+=' '+d.toLocaleTimeString();
        var o={};
        o.style=fstat.isDirectory()?'icon-folder-open':'icon-list-alt';
        /** determine display icon **/
        var _ext=extname(f);
        if(['.mkv','.avi','.mp4','.flv'].indexOf(_ext)>=0){
            o.style='icon-film';
        }else if(['.mp3','.ac3','.aac','.wav','.flac','.ape','.tta'].indexOf(_ext)>=0){
            o.style='icon-music';
        }else if(['.bmp','.jpg','.jpeg','.png'].indexOf(_ext)>=0){
            o.style='icon-picture';
        }
        o.href=encodeURI(href.replace(/\\/g,'/'));
        o.filename=f;
        o.size=fstat.isDirectory()? '[DIR]':get_file_size(fstat.size);
        o.isdir=fstat.isDirectory()?0:1;
        o.date=dt;
        list.push(o);
    }
    list.sort(function(a,b){
        var n=a.isdir-b.isdir;
        if(n==0 && a.filename != b.filename){
            n=a.filename>b.filename?1:-1;
        }
        return n;
    });
    res.render('files',{files:list,p:encodeURI(join(dir,'..').replace(/\\/g,'/')),root:path,'author':req.headers.authorization});
}
/**
 * format file size ,copy from xunlei.com
 */
function get_file_size(size)
{
	var kb = 1024; // Kilobyte
	var mb = 1024 * kb; // Megabyte
	var gb = 1024 * mb; // Gigabyte
	return size < kb ? size+'B' : size < mb ? (size / kb).toFixed(2)+'K' : size < gb ? (size / mb).toFixed(2)+'M' : (size / gb).toFixed(2)+'G';
}
