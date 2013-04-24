/**
 * http://bitshare.com
 * upload
 *
 */

var crypto=require('crypto'),
    path=require('path'),
    fs=require('fs'),
    util=require('util');

var request=require('../myrequest'),
    httptask=require('../httptask'),
    multipart=require('../multipart.js'),
    ut=require('../utility.js'),
    logger=ut.logger;

request=request.defaults({
    encoding:'utf-8'
});
var HASHKEY='';
function Site(username,password){
    this.user=username,this.passwd=md5(password);
    this.hashkey=HASHKEY||'';
    if(!this.passwd){ throw('No password setted'); }
}
util.inherits(Site,process.EventEmitter);

Site.prototype.login=function(){
    var self=this;
    if(self.hashkey){return process.nextTick(function(){self.emit('login');});}
    var form={user:this.user,password:this.passwd};
    var LOGIN_URL='http://bitshare.com/api/openapi/login.php';
    request.post(LOGIN_URL,{form:form},function(err,res,body){
        if(err)return logger.error(err);
        var m=body.match(/SUCCESS:([a-z0-9]+)/);
        if(!m)return logger.warn('login failed:%s',body);
        self.hashkey=m[1];
        HASHKEY=m[1];
        self.emit('login');
    });
}

Site.prototype.getFiles=function(folderID,cb){
    folderID=folderID||0;
    var self=this;
    var form={ action:'getfiles',hashkey:this.hashkey,mainfolder:folderID}
    var GETFILES_URL='http://bitshare.com/api/openapi/filestructure.php';
    request.post(GETFILES_URL,{form:form},function(err,res,body){
        var files=body.trim().split('\r\n').map(function(line){
            var p=line.split('#');
            return {id:p[0],name:p[1],size:p[2]};
        });
        if(!files||!files.length){
            cb(new Error('getfiles failed'));
            return logger.error('failed to getfiles:%s',body);
        }
        cb(null,files);
    });
}
Site.prototype.getFileserver=function(cb){
    var FILESERVER_URL='http://bitshare.com/api/openapi/upload.php';
    var form={action:'getFileserver'};
    request.post(FILESERVER_URL,{form:form},function(err,res,body){
        if(err)return logger.error(err);
        var m=body.match(/SUCCESS:(.+)/);
        if(m){
            cb(null,server_url=m[1].trim());
        }else{
            cb(new Error('failed get fileserver'));
        }
    });
}

Site.prototype._uploadFile=function(upload_url,filepath,resumeID,start){
    var headers={
        'User-Agent':'Mozilla/5.0 (Ubuntu; rv:17.0) Gecko/20100101 Firefox/17.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    var filesize=fs.statSync(filepath).size,start=start||0;
    if(start>=filesize){return logger.error("can't resume upload %s, %s >= %s",filepath,start,filesize);}
    /*
     *var r=request.post(server_url,function(err,res,body){
     *});
     *var form=r.form();
     *form.append('file',fs.createReadStream(filepath),{knowLength:filesize});
     *form.append('hashkey',this.hashkey);
     *form.append('filesize',filesize);
     *r.headers['Content-Length']=form.getLengthSync();
     */
    var payload={
        hashkey:this.hashkey, filesize:filesize,
        file:{path:filepath,start:start},
    }
    if(resumeID)payload['resume ID']=resumeID;
    var task=new httptask.Task(filepath,filesize,2,function(){
        upload(filepath);
    });
    task.downloaded=start;
    var req=multipart.post(upload_url,payload,null,
        function(err,res){
            if(err){ return logger.error('[upload]error:%s',err.message); }
            logger.log('[upload]response: %s ==> %s',res.statusCode,filepath);
            res.setEncoding('utf-8');
            var rs='';
            res.on('data',function(chunk){
                rs+=chunk;
            });
            res.on('end',function(){
                res.removeAllListeners();
                logger.info(rs);
                if(rs.substring(0,7)!='SUCCESS'){ task.status=2; }
            });
        }
        ,function(data){ task.update(data.length);}
    );
    task.on('abort',function(){req.abort();});
}
Site.prototype.uploadFile=function(upload_url,filepath){
    var self=this;
    self.getFiles(0,function(err,files){
        if(err)return logger.warn('upload failed to begin');
        var filename=path.basename(filepath);
        var start=0;
        for (var i = 0, l = files.length; i < l; i ++) {
            var f = files[i];
            if(f.name==filename){
                start=f.size;break;
            }
        }
        if(start>0){
            var form={
                action:'resumeFile',hashkey:self.hashkey,
                filename:filename,filesize:fs.statSync(filepath).size
            };
            var options={
                url:'http://bitshare.com/api/openapi/upload.php',
                form:form
            }
            request.post(options,function(err,res,body){
                //SUCCESS:[resume ID]#[file size]#[fileserver url]
                var m=body.match(/SUCCESS:(\d+)#(\d+)#(.+)/);
                if(!m){return logger.error('%s - resume failed:%s',filename,body);}
                self._uploadFile(m[3],filepath,m[1],m[2]);
            });
        }else{
            self._uploadFile(upload_url,filepath);
        }
    });
}

function md5(s){
    return crypto.createHash('md5').update(s).digest('hex');
}

function upload(filepath){
    var info=ut.ini.param('bitshare.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var site=new Site(info.name,info.pass);
    site.login();
    site.once('login',function(){
        site.getFileserver(function(err,server_url){
            if(err)return logger.error(err);
            site._uploadFile(server_url,filepath);
        });
        //site.getFiles(0,function(err,a){
            //site.getFiles(306284,function(err,b){
                //fs.appendFileSync('bi.json',JSON.stringify(a.concat(b),null,2));
            //});
        //});
    });
}
exports.upload=upload;

if(0){
    console.log(__filename);
    ut.ini.load();
    upload(__filename);
}
