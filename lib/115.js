var fs=require('fs'),
    path=require('path'),
    crypto = require('crypto'),
    qs=require('querystring'),
    util=require('util');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;


function Site(username,password,httpclient){
    this.username=username,this.password=password;
    this.http=httpclient||new HttpClient();
    this.http.encoding='utf-8';
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,passwd=this.password;
    var self=this;
    self.http.cookiejar.getCookies('http://115.com',function(err,cookies){
        if(err)return logger.warn(err);
        for(var i=cookies.length-1;i>=0;i--){
            if(cookies[i].key=='OOFA'){
                return self.emit('login');
            }
        }
        //clear all cookie, OOFA cookie would crack login process
        delete self.http.cookiejar.store.idx['115.com']
        var payload=qs.stringify({
            'login[account]':username,'login[passwd]':passwd,'login[time]':'on'
        });
        var url='https://passport.115.com/?ac=login';
        self.http.post(url,payload,function(err,res){
            if(err){return logger.warn(err);}
            if(res.cookie['OOFA']){
                self.emit('login');
            }else{
                logger.warn('[115]%s login failed',username);
            }
        });
    });
};

Site.prototype.checkin=function(){
    var self=this;
    self.http.get('http://115.com',function(err,res){
        var m=res.content.match(/take_token:\s*'([^']+)'/);
        var token=m&&m[1];
        if(!token){return logger.warn('[take_token:] not found , %s already signed?',self.username);}
        var url=util.format('http://115.com/?ct=ajax_user&ac=pick_space&token=%s&_=%d',token,Date.now());
        self.http.get(url,function(err,res){
            var rtn=JSON.parse(res.content);
            logger.info('[115]获得: %s',rtn.picked);
            self.emit('success');
        });
    });
};

Site.prototype.parseHomePage=function(){
    var self=this;
    self.http.get('http://115.com/',function(err,res){
        if(err){return logger.warn(err);}
        var data=res.content||'';

        var i=data.indexOf('UPLOAD_CONFIG_H5'),j=data.indexOf(';',i);
        if(i<0||j<0){return logger.warn('[UPLOAD_CONFIG_H5] not found');}
        var script='var '+data.substring(i,j+1);

        i=data.indexOf('USER_COOKIE',j),j=data.indexOf(';',i);
        if(i<0||j<0)return logger.warn('USER_COOKIE not found');
        script+='var '+data.substring(i,j+1);

        i=data.indexOf('FUpRsa1'),j=data.indexOf(';',i);
        if(i<0||j<0)return logger.warn('FUpRsa1 not found');
        script+='var '+data.substring(i,j+1);

        i=data.indexOf('FUpRsa2'),j=data.indexOf(';',i);
        if(i<0||j<0)return logger.warn('FUpRsa2 not found');
        script+='var '+data.substring(i,j+1);
        self.emit('ready',script);
    });
};
Site.prototype.upload=function(cfg){
    var headers={'User-Agent':'Shockwave Flash','Accept':'text/*'};
    var filepath=cfg.filepath;
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var time=Date.now();
    var rsa1=cfg.FUpRsa1,rsa2=cfg.FUpRsa2;
    var token=((((rsa1 + rsa2) + filesize) + time) + rsa2) + rsa1;
    var payload={
        Filename:filename,
        cookie:cfg.USER_COOKIE,
        aid:1,
        time:time,
        target:'U_1_0',
        token:crypto.createHash('md5').update(token).digest("hex"),
        FILE:{name:'Filedata',filepath:filepath},
        Upload:'Submit Query'
    }
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post(cfg.upload_url,payload,headers,
        function(err,res){
            if(err){
                //TODO:115 upload connection always break,disable status change
                //task.status=-3;
                return logger.error('[upload]error:'+err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};
function upload(filepath){
    var info=ut.ini.param('115.com');
    if(Array.isArray(info)){
        var _cfg=null;
        for(var i=0;i<info.length;i++){
            var d=info[i];
            if(d.hasOwnProperty('upload')){_cfg=d;break;}
        }
        if(!_cfg){
            return logger.error('you must specify upload to which acount.\n set upload property as the following:\n upload=true');
        }
        info=_cfg;
    }
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var site=new Site(info.name,info.pass);
    site.on('login',function(){
        site.parseHomePage();
    });
    site.on('ready',function(script){
        if(!script){return logger.warn('script is empty');}
        try{ eval(script); }catch(err){return logger.warn(err); }
        var cfg={
            filepath:filepath,
            upload_url:UPLOAD_CONFIG_H5.url,
            USER_COOKIE:USER_COOKIE,
            FUpRsa1:FUpRsa1,FUpRsa2:FUpRsa2
        };
        site.upload(cfg);
    });
    site.login();
}
function loadInfo(info){
    info.ntime=parseInt(info.ntime||Date.now()-100);
    info.count=parseInt(info.count||0);
    return info;
}
function checkin(){
    var users=ut.ini.param('115.com');
	if(!Array.isArray(users))users=[users];
    for(var i=0;i<users.length;i++){
        var info=loadInfo(users[i]);
        if(Date.now()-info.ntime>=0 && info.pass && info.pass!='your_password'){
            if(info.count>3){
                info.ntime=Date.now()+3600000*4;
                info.count=0;
                logger.warn('retried 3 times ,please check %s',info.name);
                return;
            }
            info.count++;
            var site=new Site(info.name,info.pass,new HttpClient(true));
            site.on('login',function(){
                site.checkin();
            });
            site.on('success',function(){
                var d=new Date(Date.now()+28800000);//+8 hours
                if(d.getUTCHours()<12){
                    d.setUTCHours(12);
                }else{
                    d.setUTCHours(12);
                    d=new Date(d.valueOf()+1000*60*60*12);//+12 hours
                }
                d.setUTCMinutes(0);
                info.ntime=d.valueOf()-28800000;
                info.count=0;
            });
            site.login();
            break;
        }
    }
}
exports.checkin=checkin;
exports.upload=upload;
if(false){
    console.log(__filename);
    ut.ini.load();
    checkin();
}
