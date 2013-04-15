//http://js.t.sinajs.cn/t35/miniblog/static/js/sso.js
var util=require('util'),
    fs=require('fs'),
    qs=require('querystring');

var ut=require('../utility.js'),
    request=require('../myrequest'),
    logger=ut.logger;

var SSE=require('./sinaSSOEncoder.js'),
    RSAKey = new SSE.sinaSSOEncoder.RSAKey();


function Site(username,password){
    this.username=username,this.password=password;
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var su=new Buffer(encodeURIComponent(username)).toString('base64');
    var self=this;
    logger.info('[vdisk.weibo.com]',username);
    var url=util.format('http://login.sina.com.cn/sso/prelogin.php?entry=%s&callback=STK_%s&su=%s&rsakt=mod','miniblog',Date.now(),su);
    var preloginTimeStart=Date.now();
    request(url,{headers:{'Referer':'http://vdisk.weibo.com/'}},function(err,res,data){
        //console.log(res.content);
        if(err){return logger.warn(err);}
        if(res.statusCode!=200){return logger.warn('prlogin failed:%s',res.statusCode);}
        var i=data.indexOf('('),j=data.indexOf(')',i+1);
        if(i<0||j<0){return logger.warn('prelogin failed: %s',data);}
        var me=JSON.parse(data.substring(i+1,j));
        if(me['retcode']!=0){return logger.warn('prelogin failed:%s',data);}
        RSAKey.setPublic(me.pubkey, '10001');
        var sp = RSAKey.encrypt([me.servertime, me.nonce].join("\t") + "\n" + password);
        var form={
            su:su,sp:sp,
            url:'http://weibo.com/login.php?url=http%3A%2F%2Fvdisk.weibo.com%2F',
            returntype:'META', encoding:'utf-8',
            pwencode:'rsa2',servertime:me.servertime,
            nonce:me.nonce, gateway:1,
            rsakv:me.rsakv,savestate:7
        };
        var url='http://login.sina.com.cn/sso/login.php?entry=weipan';
        request.post(url, {form:form},function(err,res,body){
            var m=body.match(/location\.replace\("([^"]+)"/);
            if(!m){return logger.warn(body);}
            request(m[1],function(err,res){
                self.emit('login');
            });
        });
        
    });
};

Site.prototype.checkin=function(){
    var url='http://vdisk.weibo.com/task/checkIn';
    var headers={
        'Referer':'http://vdisk.weibo.com/',
        'X-Requested-With':'XMLHttpRequest'
    };
    request.post(url,{headers:headers},function(err,res,body){
        try{
            var rs=JSON.parse(body);
            if(rs.errcode==0){
                logger.log('[vdisk.weibo.com]获得: %sMB',rs.data[0]);
            }else{
                logger.warn(rs.msg);
            }
        }catch(err){
            logger.error(err);
            logger.error(body);
        }
    });
};
Site.prototype.list=function(id,callback){
    var headers={
        'X-Request-With':'XMLHttpRequest',
        'Referer':'http://vdisk.weibo.com/'
    };
    var url=util.format('http://vdisk.weibo.com/dir/ajaxListItems?dir_id=%s&file_type=&page_size=100&_=%s',id,Date.now());
    request(url,{headers:headers},function(err,res,body){
        if(err){
            logger.warn(err);
            return callback([]);
        }
        var rtn=JSON.parse(body);
        var files=rtn.data;
        callback(files);
    });
};

Site.prototype.listfiles=function(id,callback){
    var self=this;
    this.list(id,function(list){
        var files=list.filter(function(e){return e.size>0;});
        var data=[];
        function fetchUrl(){
            var file=files.pop();
            if(!file){return callback(data);}
            self.getLink(file.id,function(info){
                if(info)data.push(info);
                fetchUrl();
            });
        }
        fetchUrl();
    });
};

Site.prototype.getLink=function(fid,callback){
    var headers={
        'X-Request-With':'XMLHttpRequest',
        'Referer':'http://vdisk.weibo.com/'
    };
    var url=util.format('http://vdisk.weibo.com/file/info?fid=%s&dl=true&_=%s',fid,Date.now());
    request(url,{headers:headers},function(err,res,body){
        if(err){
            logger.warn(err);
            return callback(null);
        }else{
            var info=JSON.parse(body);
            callback(info);
        }
    });
};

Site.prototype.downloadFiles=function(list){
    var file=list.pop();
    if(!file){return logger.info('download finished');}
    var self=this;
    self.getLink(file.id,function(info){
        console.log(info.name,info.s3_url);
        self.downloadFiles(list);
    });
}

function loadInfo(info){
    info.ntime=parseInt(info.ntime||Date.now()-100);
    return info;
}
function checkin(){
    var users=ut.ini.param('vdisk.weibo.com');
	if(!Array.isArray(users))users=[users];
    for(var i=0;i<users.length;i++){
        var info=loadInfo(users[i]);
        if(Date.now()-info.ntime>=0 && info.pass && info.pass!='your_password'){
            var site=new Site(info.name,info.pass);
            site.login();
            site.on('login',function(){site.checkin();});
            info.ntime+=1000*60*60*8;
            break;
        }
    }
    //process.exit();
}
function lsdir(dirid){
    if(dirid==undefined||dirid==null||dirid<0){return logger.warn('dirid malformat');}
    var user=ut.ini.param('vdisk.weibo.com','upload');
    if(!user.name || !user.pass)return logger.warn('name or pass missing');
    var site=new Site(user.name,user.pass,new HttpClient(true));
    site.login();
    site.on('login',function(){
        site.listfiles(dirid,function(files){
            var s='';
            for(var i=0;i<files.length;i++){
                //console.log(files[i].name,files[i].s3_url);
                s+=files[i].s3_url+'\n';
            }
            fs.appendFileSync('vdisk.log',s);
            logger.info('*** list done ****');
        });
    });
}
exports.checkin=checkin;
exports.lsdir=lsdir;
if(false){
    console.log(__filename);
    ut.ini.load();
    checkin();
}
