/*
 ** shiedman (shiedman@gmail.com)
 ** bbs.9gal.com click ads
 */
var fs=require('fs'),
    qs=require('querystring'),
    path=require('path'),
    util=require('util');

var ut=require('../utility.js'),
    request=require('../myrequest.js'),
    logger=ut.logger;

var _10mins=600000,_1hour=3600000;

request=request.defaults({headers:{'Referer':'http://bbs.9gal.com/index.php'}});
function Site(username,password){
    this.username=username,this.password=password;
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,passwd=this.password;
    var self=this;
    var url='http://bbs.9gal.com/index.php';
    var jar=request.defaultJar();
    var winduser_cookie=jar.get({url:url}).filter(function(c){
        return c.name.indexOf('winduser')>=0;
    });
    if(winduser_cookie.length){
        return process.nextTick(function(){
            self.emit('login');
        });
    }
    url='http://bbs.9gal.com/login.php?';
    var payload=qs.stringify({
        pwuser:username,pwpwd:passwd,
        forward:'', 'jumpurl':'http://bbs.9gal.com/index.php',
        'step':2,lgt:1,'cktime':31536000
    });
    payload+='&submit=%B5%C7+%C2%BC';
    request.post(url,{body:payload},function(err,res){
        var winduser_cookie=jar.get({url:url}).filter(function(c){
            return c.name.indexOf('winduser')>=0;
        });
        if(winduser_cookie.length){
            self.emit('login');
        }else{
            logger.warn('[9gal]%s login failed',username);
        }
    }).setHeader('Content-Type','application/x-www-form-urlencoded');
};
Site.prototype.clickBox=function(callback){
    var self=this;
    request('http://bbs.9gal.com/kf_smbox.php',function(err,res,data){
        if(!self.clickads){
            var m=data.match(/diy_ad_move.php[^"]+/)
            var ads_link=m&&m[0];
            if(!ads_link){return logger.warn('ads link not found');}
            request('http://bbs.9gal.com/'+ads_link,function(err,res){
                self.clickads=true;
                self.clickBox(callback);
            });
        }else{
            var m=data.match(/kf_smbox\.php\?box=\d+&safeid=[^"]+/g);
            if(m&&m[0]){
                request('http://bbs.9gal.com/'+m[0],function(err,res,body){
                    var m=body.match(/<br\s*\/>(.+?)<br/)
                    callback(m[1]);
                });
            }else{
                logger.warn('smbox link not found');
                callback();
            }
        }
    });
};

function loadInfo(info){
    info.ntime=parseInt(info.ntime||Date.now()-100);
    info.count=parseInt(info.count||0);
    return info;
}
function checkin(){
    var info=loadInfo(ut.ini.param('bbs.9gal.com'));
    if(!info.name || !info.pass)return;
    if(Date.now()-info.ntime<0)return;
    if(info.count>3){
        info.ntime=Date.now()+3600000*2;
        info.count=0;
        logger.warn('retried 3 times ,please check %s',info.name);
        return;
    }
    info.count++;

    var site=new Site(info.name,info.pass);
    site.login();
    site.on('login',function(){
        site.clickBox(function(msg){
            if(msg){
                logger.info(msg);
                ut.log(msg);
                info.ntime=Date.now()+5*_1hour;
                info.count=0;
            }
        })
    });
}
exports.checkin=checkin;
if(false){
    console.log(__filename);
    ut.ini.load();
    checkin();
}
