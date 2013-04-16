var fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    net=require('net'),
    util=require('util');

var httptask=require('../httptask.js'),
    multipart=require('../multipart.js'),
    ut=require('../utility.js'),
    logger=ut.logger;

function Site(userid,key){
    this.userid=userid;
    this.key=key;
    if(!this.key){ throw('No Key setted'); }
}
util.inherits(Site,require('events').EventEmitter);
Site.prototype.upload=function(filepath){
    var filepath=filepath;
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var payload={
        Filename:filename,
        Filedata:{path:filepath},
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
Ftp.prototype.connect=function(callback,deadline){
    var n=0,self=this;
    var cmd=['USER '+this.user,331,'PASS '+this.password,230,'OPTS UTF8 ON',200,'CWD /',250, 'TYPE I',200,'PASV',227,'MLSD',150];
    var cmdSocket=net.connect(this.port,this.host,function(){
        logger.log('connected to %s:%s',cmdSocket.remoteAddress,cmdSocket.remotePort);
        cmdSocket.setEncoding('utf-8');
        cmdSocket.once('data',function(resp){
            //cmdSocket.setTimeout(0);//removeListener('timeout',_timeout);
            logger.log(resp);
            if(code(resp)==220){
                clearTimeout(cmdTimeout);
                process.nextTick(function(){
                    cmdSocket.write(cmd[n]+'\r\n');
                    n++;
                });
                cmdSocket.on('data',handshake);
            }else{
                logger.warn('expected welcome message,but response with:%s',resp);
            }
        });
    });
    var cmdTimeout=setTimeout(function(){
        logger.warn('timeout 20s,reconnect to server');
        cmdSocket.removeAllListeners();
        cmdSocket.destroy();
        deadline=deadline||0;
        if(deadline<3)self.connect(callback,deadline+1);
    },2000);
    cmdSocket.setNoDelay(true);
    function handshake(resp){
        if(code(resp)==cmd[n]){
            if(cmd[n-1]=='PASV'){
                var opt=parseIP(resp);
                listfiles(opt.port,opt.host);
            }
            n++;
            if(n<cmd.length){
                cmdSocket.write(cmd[n]+'\r\n'); n++;
            }else{
                //console.log('remove handshake');
                cmdSocket.removeListener('data',handshake);
            }
        }else{
            cmdSocket.removeAllListeners();
            cmdSocket.destroy();
            logger.warn('%s but response with %s',cmd[n-1],resp);
        }
    }
    function listfiles(port,host,tried){
        logger.log('listing files at %s:%s',host,port);
        var conn=net.connect(port,host,function(){
            conn.setEncoding('utf-8');
            conn.once('data',function(info){
                //conn.removeAllListeners('data');
                var lines=info.split(/\r*\n/).filter(function(e){
                    return e.indexOf('Type=file')>0;
                })
                var files={};
                for (var i = 0, l = lines.length; i < l; i ++) {
                    var v = lines[i].split(';');
                    files[v[3].trim()]=parseInt(v[0].split('=')[1]);
                }
                conn.removeAllListeners('error');
                //conn.removeAllListeners();
                conn.destroy();
                setTimeout(function(){
                    self.files=files;
                    self.controlSocket=cmdSocket;
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
                cmdSocket.removeAllListeners();
                self.connect(callback);
            }
        });
    }
    cmdSocket.on('error',function(err){
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
        return logger.warn('upload %s ,but start byte %s >= filesize %s',filename,start,filesize);
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
        var fstream=null;
        var conn=net.connect(remotePort,remoteHost,function(){
            //conn.removeAllListeners();
            logger.log('begin ftp upload:%s',filepath);
            var task=new httptask.Task(filepath,filesize,2,function(){
                ftpupload(filepath);
            });
            task.downloaded=start;
            fstream=fs.createReadStream(filepath,{start:start});
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
            fstream.on('error',function(err){
                conn.destroy();
                conn.removeAllListeners();
                fstream.removeAllListeners();
                logger.error(err);
            });
            conn.on('drain',function(){
                if(paused){ fstream.resume(); paused=false;}
            });
            task.on('abort',function(){
                fstream.removeAllListeners();
                conn.removeAllListeners();
                fstream.destroy();
                conn.destroy();
            });
            self.quit();
        });
        conn.on('error',function(err){
            logger.error('ftp.ctdisk.com connection timeout:%j',err);
            if(fstream){
                logger.error('ftp.ctdisk.com upload failed:%j',err);
                fstream.removeAllListeners();
                conn.removeAllListeners();
                fstream.destroy();
                fstream=null;
            }
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
    //var d=require('domain').create();
        //d.run(function(){
    ftp.connect(function(){ 
        logger.log('ready to ftp upload'); 
            ftp.upload(filepath);
    });
        //});
        //d.on('error',function(err){
            //console.error(err);
        //});
}
exports.httpupload=httpupload;
exports.ftpupload=ftpupload;
if(0){
    console.log(__filename);
    ut.ini.load();
    ftpupload(__filename);
}
