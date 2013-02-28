var util=require('util');

var ut=require('./utility.js'),
    HttpClient=require('./urlfetch').HttpClient,
    logger=ut.logger;

var HEADER={
    'Host': 'vdisk.weibo.com',
    'User-Agent': 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 3_0 like Mac OS X; en-us) AppleWebKit/528.18 (KHTML, like Gecko) Version/4.0 Mobile/7A341 Safari/528.16',
    'Accept': 'application/json, text/javascript, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'http://vdisk.weibo.com/login?backurl=http://vdisk.weibo.com/wap',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
};

function Site(username,password,httpclient){
    this.username=username,this.password=password;
    this.http=httpclient||new HttpClient();
    this.http.encoding='utf-8';
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var self=this;
    self.http.cookiejar.getCookies('http://vdisk.weibo.com',function(err,cookies){
        if(err)return logger.warn(err);
        for(var i=cookies.length-1;i>=0;i--){
            if(cookies[i].key=='gsid'){
                return self.emit('login');
            }
        }
        delete self.http.cookiejar.store.idx['vdisk.weibo.com']
        logger.info('[weibo]%s is login...',username);
        var url='http://vdisk.weibo.com/auth/ajaxWapAuthSec';
        var payload='auth='+encryptAll(username,password);
        self.http.post(url,payload,HEADER,function(err,res){
            if(err){return logger.warn(err);}
            try{
                var data=JSON.parse(res.content);
            }catch(err){
                return logger.error(res.content);
            }
            var path=data['message'];
            if(!path){
                return logger.warn('[weibo_wap] %s login failed, please check password',username);
            }
            self.http.get('http://vdisk.weibo.com'+path,HEADER,function(err,res){
                if(err){return logger.warn(err);}
                if(res.cookie['gsid']){
                    logger.log('[vdisk.weibo.com]logging sucesss');
                    self.emit('login');
                }else{
                    logger.warn('[weibo_wap] %s login failed, please check password',username);
                }
            });
        });
    });
};

Site.prototype.checkin=function(){
//function checkIn(){
    var self=this;
    var url='http://vdisk.weibo.com/task/checkIn';
    self.http.post(url,null,cookieHeader(),function(err,res){
        if(err){return logger.warn(err);}
        try{
            var data=JSON.parse(res.content);
        }catch(err){
            return logger.error(res.content);
        }
        if(data.errcode==0){
            var size = data.data[0];
            var star = data.data[1];
            logger.log('[vdisk.weibo.com]手机签到获得: %sMB',size);
            self.sendWeibo(size,star,0);
        }else{
            logger.warn('签到失败: %s',util.inspect(data));
            var info=data.data;
            if(info&&info['send_weibo_size']==0){
                self.sendWeibo(info['size'],info['star'],0);
            }
        }
    });
};
Site.prototype.sendWeibo=function(size,star,times){
    var self=this;
    if(times>=3){return logger.warn('wendWeibo tried 3 times, aborted');}
    var url='http://vdisk.weibo.com/task/checkInSendWeibo';
    var msg= '我今天在#微盘手机签到#获得了'+size+'M免费空间，好运指数'+star+'颗星';
    headers=cookieHeader();
    headers['Referer']='http://vdisk.weibo.com/';
    self.http.post(url,'msg='+encodeURIComponent(msg),headers,function(err,res){
        if(err){return logger.warn(err);}
        try{
            var data=JSON.parse(res.content);
        }catch(err){
            return logger.error(res.content);
        }
        if(data.errcode==0){
            logger.log('[vdisk.weibo.com]发送微博获得: 50MB');
        }else if(data.errcode==1){
            logger.warn('[vdisk.weibo.com]%s',data.msg);
        }else{
            logger.warn('[sendWeibo][%s]: %s',times,util.inspect(data));
            setTimeout(function(){
                self.sendWeibo(star,star,++times);
            },10000);
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
            var site=new Site(info.name,info.pass,new HttpClient(true));
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

