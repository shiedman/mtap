var util=require('util');

var ut=require('../utility.js'),
    request=require('../myrequest'),
    logger=ut.logger;

var HEADER={
    'User-Agent': 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 3_0 like Mac OS X; en-us) AppleWebKit/528.18 (KHTML, like Gecko) Version/4.0 Mobile/7A341 Safari/528.16',
    'Accept': 'application/json, text/javascript, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'http://vdisk.weibo.com/wap/',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
};
request=request.defaults({headers:HEADER});
function Site(username,password){
    this.username=username,this.password=password;
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var self=this;
    var jar=request.defaultJar();
    var gsid_cookie=jar.get({url:'http://vdisk.weibo.com'}).filter(function(c){
        return c.name==='gsid';
    });

    if(gsid_cookie.length)
        return process.nextTick(function(){self.emit('login');});

    logger.info('[weibo]%s is login...',username);
    var options={
        url:'http://vdisk.weibo.com/wap/account/ajaxAuthSec?_='+Date.now(),
        form:{
            backurl:'http://vdisk.weibo.com/wap/',
            auth:encryptAll(username,password)
        }
    };
    request.post(options,function(err,res,body){
        if(err){return logger.warn(err);}
        var data=JSON.parse(body);
        if (!data.url){
            return logger.warn('login failed: %s',data);
        }
        request(data.url,function(err,res,body){
            var gsid_cookie=jar.get({
                url:'http://vdisk.weibo.com'
            }).filter(function(c){
                return c.name==='gsid';
            });
            if(gsid_cookie.length)
                return self.emit('login');
            else
                logger.warn('[weibo_wap] %s login failed, please check password',username);
        });
    });
};

Site.prototype.checkin=function(){
//function checkIn(){
    var self=this;
    var url='http://vdisk.weibo.com/wap/api/weipan/checkin/checkin?_='+Date.now();
    request(url,function(err,res,body){
        if(err){return logger.warn(err);}
        var m=body.match(/\[(\d+),(\d+)\]/);
        if(m){
            var size=parseInt(m[1]);
            var star=parseInt(m[2]);
            logger.log('[vdisk.weibo.com]手机签到获得: %sMB',size);
            self.sendWeibo(size,star,0);
        }else{
            logger.warn('签到失败: %s',body);
            var url='http://vdisk.weibo.com/wap/api/weipan/checkin/checkin_info?_='+Date.now();
            request(url,function(err,res,body){
                var data=JSON.parse(body);
                if(parseInt(data['sent_weibo_size'])==0){
                    self.sendWeibo(data['size'],data['star'],0);
                }
            });
        }
    });
};
Site.prototype.sendWeibo=function(size,star,times){
    var self=this;
    if(times>=3){return logger.warn('wendWeibo tried 3 times, aborted');}
    var url='http://vdisk.weibo.com/wap/api/weipan/checkin/checkin_send_weibo?_='+Date.now();
    var form={
        msg:'我今天在#微盘手机签到#获得了'+size+'M免费空间，好运指数'+star+'颗星'
    };
    request.post(url,{form:form},function(err,res,body){
        if(err){return logger.warn(err);}
        var s=body.trim();
        if(s==='50'){
            logger.info('[vdisk.weibo.com]发送微博获得: 50MB')
        }else{
            var data=JSON.parse(s)
            if ('error_code' in data){
                logger.warn('[vdisk.weibo.com]%s',data['error'])
                self.sendWeibo(size,star,times+1);
            }else{
                logger.warn('send weibo message failed:%s',s)
            }
        }
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
            //var domains=['login.sina.com.cn','sina.com.cn','kandian.com','login.t.cn','weibo.com','vdisk.weibo.com'];
            //domains.forEach(function(e){ut.Cookie.remove(e);});
            var site=new Site(info.name,info.pass);
            site.login();
            site.on('login',function(){
                site.checkin();
            });
            var _8hours=1000*60*60*8;
            info.ntime=info.ntime+_8hours;
            break;
            //return;
        }
    }
    //process.exit();
}
exports.checkin=checkin;
if(false){
    console.log(__filename);
    ut.ini.load();
    checkin();
}


//---- helper methods ------------
function cookieHeader(){
    var d={};
    for(var k in HEADER){
        d[k]=HEADER[k];
    }
    d['Cookie']='device=mobile';
    return d;
}
function encryptAll(username, password) {
    return encrypt(username + "\n" + password)
}
function encrypt(s) {
    return bin2hex(str_rot13(base64_encode(s)))
}
function bin2hex(s) {
     return new Buffer(s).toString('hex');
}
function str_rot13(str) {
    return (str + '').replace(/[a-z]/gi, function (s) {
        return String.fromCharCode(s.charCodeAt(0) + (s.toLowerCase() < 'n' ? 13 : -13))
    })
}
function base64_encode(data) {
    return new Buffer(data).toString('base64');
}
