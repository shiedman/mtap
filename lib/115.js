var fs=require('fs'),
    qs=require('querystring'),
    util=require('util');

var ut=require('./utility.js'),
    logger=ut.logger;

function login(username,passwd,callback){
    var url='https://passport.115.com/?ac=login';
    var payload=qs.stringify({ 'login[account]':username,'login[passwd]':passwd });
    ut.http.post(url,payload,function(err,res){
        var success=res.cookie&&res.cookie['OOFL']==encodeURIComponent(username);
        if(callback){ callback(success); }
    });
}

function fetchToken(callback){
    var url='http://115.com';
    ut.http.get(url,function(err,res){
        var data=res.data;
        var m=data.match(/take_token:\s*'([^']+)'/);
        var token='';
        if(m){ token=m[1];}
            //console.log('got 115 token: %s',token);
        if(callback)callback(token);
    });
}

function roll(token){
    if(!token)return;
    var url=util.format('http://115.com/?ct=ajax_user&ac=pick_space&token=%s&_=%d',token,Date.now());
    ut.http.get(url,function(err,res){
        var data=res.data;
        var rtn=JSON.parse(data);
        logger.info('[115]获得: %s',rtn.picked);
    });
}

function dice(username,password){
    logger.log('%s - dicing',username);
    login(username,password,function(success){
        if(!success){logger.warn('%s - login failed',username);return;}
        logger.log('%s - login success',username);
        fetchToken(function(token){
            if(!token){logger.warn('%s - token is empty',username);return;}
            logger.log('%s - got token: %s',username,token);
            roll(token);
        });
    });
}
function cron(){
    //console.log(Date.now());
    var users=ut.ini.param('115');
    //console.dir(users);
    for(var name in users){
        var info=JSON.parse(users[name]);
        if(!info.time)info.time=Date.now()-1000;
        if(Date.now()-info.time>=0 && info.pass){
            ut.Cookie.remove('115.com');
            dice(name,info.pass);
            var _4hours=1000*60*60*4;
            info.time=info.time+_4hours;
            users[name]=JSON.stringify(info);
            break;
            //return;
        }
    }
    //process.exit();
}
exports.takeBonus=cron;
if(false){
    console.log(__filename);
    ut.Cookie.load();
    ut.ini.load();
    setInterval(cron,5000);
    process.on('exit',function(){
        ut.Cookie.save();
        //ut.ini.write();
    });
}
/**
var cfgfile='115.cfg';
function loadConfig(){
    if(!fs.existsSync(cfgfile)){console.error('config file not exists: %s',cfgfile);return;}
    return fs.readFileSync(cfgfile,'utf-8').split(/\r*\n/)
        .filter(function(rx) { return rx.length })
        .map(function(rx) { return rx.split(',') });
    
}
function saveConfig(configs){
    var rs='';
    for(var i=0;i<configs.length;i++){
        rs+=configs[i].join(',')+'\n';
    }
    fs.writeFileSync(cfgfile,rs);
}
function cron(){
    try{
        var configs=loadConfig();
        if(!configs){return;}
        for(var i=0;i<configs.length;i++){
            var c=configs[i];
            var time=c[2];
            if(Date.now()-time>=0){
                dice(c[0],c[1]);
                var _6hours=1000*60*60*6;
                c[2]=Date.now()+_6hours;
                saveConfig(configs);
                break;
            }
        }
    }catch(err){
        console.error(err.message);
        console.error(err.stack);
    }
}
*/
