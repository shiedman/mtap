/*
 ** shiedman (shiedman@gmail.com)
 ** bbs.9gal.com click ads
 */
var fs=require('fs'),
    qs=require('querystring'),
    path=require('path'),
    util=require('util');

var ut=require('./utility.js'),
    HttpClient=require('./urlfetch').HttpClient,
    logger=ut.logger;

var _10mins=600000,_1hour=3600000;

function Site(username,password,httpclient){
    this.username=username,this.password=password;
    this.http=httpclient||new HttpClient();
    this.http.encoding='gbk';
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
//function login(username,passwd,callback){
    var username=this.username,passwd=this.password;
    var self=this;
    var url='http://bbs.9gal.com/index.php';
    self.http.cookiejar.getCookies(url,function(err,cookies){
        for(var i=cookies.length-1;i>=0;i--){
            if(cookies[i].key.indexOf('winduser')>=0){
                return self.emit('login');
            }
        }
        delete self.http.cookiejar.store.idx['bbs.9gal.com']
        var url='http://bbs.9gal.com/login.php?';
        var payload=qs.stringify({
            'pwuser':username,'pwpwd':passwd,
            'jumpurl':'index.php','step':2,'cktime':31536000
        });
        self.http.post(url,payload,function(err,res){
            if(res.cookie['0857d_winduser']){
                self.emit('login');
            }else{
                logger.warn('[9gal]%s login failed',username);
            }
        });
    });
};
Site.prototype.clickAds=function(callback){
    var self=this;
    var url='http://bbs.9gal.com/index.php';
    self.http.get(url,function(err,res){
        var data=res.content;
        var m=data.match(/g_intro.php[^"]+|diy_ad_move.php[^"]+/);
        var ads_link=m&&m[0];
        if(!ads_link){return logger.warn('ads link not found');}
        var url='http://bbs.9gal.com/'+ads_link;
        self.http.get(url,function(err,res){
            var data=res.content;
            if(res.statusCode!=200){return logger.warn('%s - %d',url,res.statusCode);}
            var i=data.indexOf('<br />');
            var j=data.indexOf('<br',i+6);
            var msg=data.substring(i+6,j);
            if(msg.indexOf('KFB')>=0&&msg.indexOf('0066CC')<0){
                callback(msg);
            }else{
                callback(null);
                logger.warn('something mystery happened!');
            }
        });
    });
};

function checkin(){
    var cfg=ut.ini.param('9gal');
    if (!cfg)return;
    if(!cfg.user || !cfg.pass)return logger.warn('username or password missing');
    if(cfg.adsTime && Date.now()-cfg.adsTime<0)return;
    if(cfg.accessTime && Date.now()-cfg.accessTime<_10mins)return;
    if(cfg.tries>5){
        cfg.adsTime=Date.now()+2*_1hour;
        cfg.tries=0;
        ut.log('9gal.log','failed to take bonus,please check login name and password');
        return;
    }

    var site=new Site(cfg.user,cfg.pass);
    site.login();
    site.on('login',function(){
        site.clickAds(function(msg){
            if(msg){
                logger.info(msg);
                ut.log('9gal.log',msg);
                cfg.adsTime=Date.now()+5*_1hour;
                cfg.tries=0;
            }
        })
    });
    cfg.tries=cfg.tries||0;
    cfg.tries++;
    cfg.accessTime=Date.now();
}
//exports.Site=Site;
exports.checkin=checkin;
if(false){
    console.log(__filename);
    ut.ini.load();
    setTimeout(function(){ checkin(); },2000);
}
