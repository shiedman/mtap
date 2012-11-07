var fs=require('fs'),
    qs=require('querystring'),
    events=require('events'),
    path=require('path');

var ut=require('./utility.js'),
    logger=ut.logger;

var _10mins=600000,_1hour=3600000;
function login(username,passwd,callback){
    var url='http://bbs.9gal.com/login.php';
    var payload=qs.stringify({
        'pwuser':username,'pwpwd':passwd,
        'jumpurl':'index.php','step':2,cktime:31536000
    });
    ut.http.post(url,payload,function(err,res){
        var success=res.cookie['0857d_winduser'];
        if(callback){ callback(success); }
    });
}

function fetchLink(callback){
    var url='http://bbs.9gal.com/index.php';
    ut.http.get(url,function(err,res){
        var data=res.data;
        var m=data.match(/g_intro.php[^"]+|diy_ad_move.php[^"]+/);
        //fs.appendFileSync('log',data,'binary');
        var adsLink='';
        if(m){ adsLink=m[0];}
        if(callback)callback(adsLink);
    });
}

function clickAds(link){
    if(!link)return;
    var url='http://bbs.9gal.com/'+link;
    ut.http.get(url,function(err,res){
        var data=res.data;
        logger.log('statusCode: %d',res.statusCode);
        if(res.statusCode==200){
            var _i=data.indexOf('<br />');
            var _j=data.indexOf('<br',_i+6);
            logger.info(data.substring(_i+6,_j));
            var cfg=ut.ini.param('9gal');
            cfg.adsTime=Date.now()+5*_1hour;
            cfg.tries=0;
        }else{
            logger.info('unlucky');
        }
    });
}
function takeBonus(){
    var cfg=ut.ini.param('9gal');
    if (!cfg)return;
    var user=cfg.user,pass=cfg.pass;
    if(!user || !pass)return;
    if(!cfg.adsTime || Date.now()-cfg.adsTime>=0){
        if(!cfg.accessTime || Date.now()-cfg.accessTime>=_10mins){
            if(cfg.tries>5){
                cfg.adsTime=Date.now()+2*_1hour;
                cfg.tries=0;
                return;
            }

    var evt=new events.EventEmitter();
    evt.on('login',function(){
        fetchLink(function(link){
            if(!link){logger.warn('%s:link is empty',cfg.user);return;}
            clickAds(link);
        });
    });
    ut.Cookie.get('http://bbs.9gal.com/index.php',function(err,cookies){
        var winduser=false;
        for(var i=0;i<cookies.length;i++){
            if(cookies[i].key.indexOf('winduser')>=0){winduser=true;break;}
        }
        if(winduser){
            evt.emit('login');
        }else{
            console.dir(cookies);
            logger.log('%s is login.........',user);
            login(user,pass,function(success){
                if(!success){logger.warn('%s login failed',user);}
                else{
                    evt.emit('login');
                    logger.log('%s login success',user);
                }
            });
        }
    });
    cfg.tries=cfg.tries||0;cfg.tries++;
    cfg.accessTime=Date.now();

    }}
}

exports.takeBonus=takeBonus;
if(false){
    console.log(__filename);
    ut.Cookie.load();
    ut.ini.load();
    setTimeout(function(){ takeBonus(); },2000);
    process.on('exit',function(){
    ut.Cookie.save();
    ut.ini.write();
    });
}
