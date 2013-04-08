var fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    net=require('net'),
    util=require('util');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    //HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;

function Site(userid,key){
    this.userid=userid;
    this.key=key;
    if(!this.key){ throw('No Key setted'); }
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
    var task=new httptask.Task(filepath,filesize,2,function(){
        upload(filepath);
    });
    var req=multipart.post(url,payload,{'User-Agent':'Shockwave Flash'},
        function(err,res){
            if(err){
                //task.status=-3;//no set status, need to retry upload
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
        ,function(data){ task.update(data.length);}
    );
    task.on('abort',function(){req.abort();});
    //task.resumable=false;
};

function httpupload(filepath){
    var info=ut.ini.param('www.400gb.com');
    if(!info.userid||!info.key){return logger.warn('userid&key needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Site(info.userid,info.key);
    up.upload(filepath);
}


function Ftp(user,password,host,port){
    this.user=user,this.password=password;
    this.host=host,this.port=port||21;
    this.controlSocket=null;
}
Ftp.prototype.connect=function(callback){
    var n=0,self=this;
    var cmd=['USER '+this.user,331,'PASS '+this.password,230,'OPTS UTF8 ON',200,'CWD /',250, 'TYPE I',200,'PASV',227,'MLSD',150];
    var c=net.connect(this.port,this.host,function(){
        logger.log('connected to %s:%s',c.remoteAddress,c.remotePort);
        c.setEncoding('utf-8');
        function _timeout(){
            logger.warn('timeout 20s,reconnect to server');
            c.removeAllListeners();
            c.end();
            self.connect(callback);
        }
        c.setTimeout(20000,_timeout);
        c.once('data',function(resp){
            c.removeListener('timeout',_timeout);
            logger.log(resp);
            if(code(resp)==220){
                c.write(cmd[n]+'\r\n');
                n++;
                c.on('data',handshake);
            }else{
                logger.warn('expected welcome message,but response with:%s',resp);
            }
        });
    });
    c.setNoDelay(true);
    function handshake(resp){
        if(code(resp)==cmd[n]){
            if(cmd[n-1]=='PASV'){
                var opt=parseIP(resp);
                listfiles(opt.port,opt.host);
            }
            n++;
            if(n<cmd.length){
                c.write(cmd[n]+'\r\n'); n++;
            }else{
                //console.log('remove handshake');
                c.removeListener('data',handshake);
            }
        }else{
            c.removeListener('data',handshake);
            c.end();
            logger.warn('%s but response with %s',cmd[n-1],resp);
        }
    }
    function listfiles(port,host,tried){
        logger.log('listing files at %s:%s',host,port);
        var conn=net.connect(port,host,function(){
            conn.setEncoding('utf-8');
            conn.on('data',function(info){
                conn.removeAllListeners();
                var lines=info.split(/\r*\n/).filter(function(e){
                    return e.indexOf('Type=file')>0;
                })
                var files={};
                for (var i = 0, l = lines.length; i < l; i ++) {
                    var v = lines[i].split(';');
                    files[v[3].trim()]=parseInt(v[0].split('=')[1]);
                }
                process.nextTick(function(){
                    conn.end();
                });
                setTimeout(function(){
                    self.files=files;
                    self.controlSocket=c;
                    callback();
                },2000);
            });
        });
        conn.once('error',function(err){
            logger.warn('listfiles failed:%j',err);
            if(tried!==2){
                logger.info('retry listfiles');
                listfiles(port,host,(tried||0)+1);
            }else{
                //reconnect to ftp server
                c.removeAllListeners();
                self.connect(callback);
            }
        });
    }
    c.on('error',function(err){
        logger.error('ftp control socket error:%j',err);
    });
};

Ftp.prototype.quit=function(){
    this.controlSocket.write('QUIT\r\n');
}

Ftp.prototype.upload=function(filepath){
    //if(true){console.log(this.files);this.controlSocket.write('QUIT\r\n');return;}
    if(!fs.existsSync(filepath)){return logger.log('not exists:%s',filepath);}
    var filename=path.basename(filepath),self=this;
    var start=self.files[filename]||0,filesize=fs.statSync(filepath).size;
    if(start>=filesize){
        this.quit();
        return logger.warn('start byte %s >= filesize %s',start,filesize);
    }
    var remoteHost,remotePort;
    //PASV->227->(REST->350)->STOR->150
    process.nextTick(function(){
        self.controlSocket.write('PASV\r\n');
    });
    self.controlSocket.once('data',function(resp){
        if(code(resp)!=227){return logger.log('failed to create upload connection:%s',resp);}
        var opt=parseIP(resp);
        remoteHost=opt.host,remotePort=opt.port;
        if (start===0){
            process.nextTick(function(){
                self.controlSocket.write('STOR '+filename+'\r\n');
            });
            self.controlSocket.once('data',transfer);
        }else{
            //resume upload
            process.nextTick(function(){
                self.controlSocket.write('REST '+start+'\r\n');
            });
            self.controlSocket.once('data',rest);
        }
    });
    function rest(resp){
        if(code(resp)==350 && resp.indexOf(start+'')>0){
            process.nextTick(function(){
                self.controlSocket.write('STOR '+filename+'\r\n');
            });
            self.controlSocket.once('data',transfer);
        }else{
            logger.warn('resume upload failed:%s',resp);
        }
    }
    function transfer(resp,disable){
        if(code(resp)!=150){return logger.warn('STOR FAILED:%s',resp);}
        var conn=net.connect(remotePort,remoteHost,function(){
            conn.removeAllListeners('error');
            var task=new httptask.Task(filepath,filesize,2,function(){
                ftpupload(filepath);
            });
            task.downloaded=start;
            var fstream=fs.createReadStream(filepath,{start:start});
            var paused=false;
            fstream.on('data',function(chunk){
                if(!conn.write(chunk)){fstream.pause(); paused=true; }
                task.update(chunk.length);
            });
            fstream.on('end',function(){
                fstream.removeAllListeners();
                conn.removeAllListeners();
                conn.end();
                logger.info('ftp upload ended:%s',filename);
            });
            conn.on('drain',function(){
                if(paused){ fstream.resume(); paused=false;}
            });
            conn.on('error',function(err){
                logger.error('ftp.ctdisk.com upload failed:%j',err);
                fstream.removeAllListeners();
                conn.removeAllListeners();
                fstream.destroy();
            });
            task.on('abort',function(){
                fstream.removeAllListeners();
                conn.removeAllListeners();
                fstream.destroy();
                conn.end();
            });
            self.quit();
        });
        conn.once('error',function(err){
            logger.error('ftp.ctdisk.com connection timeout:%j',err);
            if(!disable){
                logger.info('retry connect to ftp.ctdisk.com');
                transfer(resp,true);
            }
        });
    }
};

function code(s){
    var i=s.indexOf(' '),code=s.substring(0,i);
    return parseInt(code)||-1;
}
function parseIP(s){
    var a=s.match(/\d+,\d+,\d+,\d+,\d+,\d+/);
    if(!a){logger.warn('pasv mode,but ip not foud:'+s);return {};}
    a=a[0].split(',')
    return {host:a[0]+'.'+a[1]+'.'+a[2]+'.'+a[3],port:(a[4]<<8)+parseInt(a[5])};
}

function ftpupload(filepath){
    var info=ut.ini.param('www.400gb.com');
    if(!info.name||!info.pass){return logger.warn('name&pass needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var ftp=new Ftp(info.name,info.pass,'ftp.ctdisk.com');
    ftp.connect(function(){ 
        logger.log('ready to ftp upload'); 
        ftp.upload(filepath);
    });
}
exports.httpupload=httpupload;
exports.ftpupload=ftpupload;
if(false){
    console.log(__filename);
    ut.ini.load();
    ftpupload(__filename);
}
