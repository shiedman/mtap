var fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    util=require('util');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;

function Site(userid,key){
    this.userid=userid;
    this.key=key;
    if(!this.key){
        throw('No Key setted');
    }
    //this.http=new HttpClient();
    //this.http.encoding='utf-8';
}
util.inherits(Site,require('events').EventEmitter);
Site.prototype.upload=function(filepath){
    var filepath=filepath;
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var payload={
        Filename:filename,
        FILE:{name:'Filedata',filepath:filepath},
        Upload: 'Submit Query'
    }
    var url=util.format('http://upload.zhuanmi.net/web/upload.do?userid=%s&folderid=0&key=%s',this.userid,this.key);
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post(url,payload,{'User-Agent':'Shockwave Flash'},
        function(err,res){
            if(err){
                //task.status=-3;//not set status, need to retry upload
                return logger.error('[upload]error:%s',err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);
            if(task.status!=0){
                res.on('data',function(chunk){
                    logger.error('upload failed:%s',filename);
                    logger.error(chunk.toString());
                });
            }

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};

function upload(filepath){
    var info=ut.ini.param('www.400gb.com');
    if(!info.userid||!info.key){return logger.warn('userid&key needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Site(info.userid,info.key);
    up.upload(filepath);
}

exports.upload=upload;
if(false){
    console.log(__filename);
    ut.ini.load();
    //ut.cookie.load();
    setTimeout(function(){

        upload('uptobox.js');

    },2000);
    process.on('exit',function(){
        //ut.Cookie.save();
        //ut.ini.write();
    });
}
