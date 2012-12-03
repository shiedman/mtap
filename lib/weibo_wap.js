var util=require('util');
var  ut=require('./utility.js'), logger=ut.logger;
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
function login(username,password){
    logger.info('[weibo]%s is login...',username);
    var url='http://vdisk.weibo.com/auth/ajaxWapAuthSec';
    var payload='auth='+encryptAll(username,password);
    ut.http.post(url,payload,HEADER,function(err,res){
        if(err){return logger.warn(err);}
        try{
            var data=JSON.parse(res.data);
        }catch(err){
            return logger.error(res.data);
        }
        var msg=data['message'];
        if(!msg){
            return logger.warn('[weibo_wap] %s login failed, please check password',username);
        }
        ut.http.get('http://vdisk.weibo.com'+msg,HEADER,function(err,res){
            if(err){return logger.warn(err);}
            var success=res.cookie&&res.cookie['gsid']
            if(success){
                logger.log('[vdisk.weibo.com]logging sucesss');
                checkIn();
            }else{
                logger.warn('[weibo_wap] %s login failed, please check password',username);
            }
        });
    });
}
function checkLogin(data) {
	if(typeof data == 'object' && typeof(data.errcode) != 'undefined' && data.errcode == '401'){
		return false;
	}
	return true;
}

function checkIn(){
    var url='http://vdisk.weibo.com/task/checkIn';
    ut.http.post(url,null,cookieHeader(),function(err,res){
        if(err){return logger.warn(err);}
        try{
            var data=JSON.parse(res.data);
        }catch(err){
            return logger.error(res.data);
        }
        if(data.errcode==0){
            var size = data.data[0];
            var star = data.data[1];
            logger.log('[vdisk.weibo.com]手机签到获得: %sMB',size);
            sendWeibo(size,star,0);
        }else{
            logger.warn('签到失败: %s',util.inspect(data));
        }
    });
}
function sendWeibo(size,star,times){
    if(times>=3){return logger.warn('wendWeibo tried 3 times, aborted');}
    var url='http://vdisk.weibo.com/task/checkInSendWeibo';
    var msg= '我今天在#微盘手机签到#获得了'+size+'M免费空间，发微博再送50M，好运指数'+star+'颗星，你也来 试试手气吧~@微盘+新浪网旗下云存储品牌，超大存储空间，海量资源下载，手机电脑数据 任你同步，人手一盘，微力无限，快来体验吧！'
    ut.http.post(url,'msg='+encodeURIComponent(msg),cookieHeader(),function(err,res){
        if(err){return logger.warn(err);}
        try{
            var data=JSON.parse(res.data);
        }catch(err){
            return logger.error(res.data);
        }
        if(data.errcode==0){
            logger.log('[vdisk.weibo.com]发送微博获得: 50MB');
        }else if(data.errcode==1){
            logger.warn('[vdisk.weibo.com]%s',data.msg);
        }else{
            logger.warn('[sendWeibo][%s]: %s',times,util.inspect(data));
            setTimeout(function(){
                sendWeibo(star,star,++times);
            },10000);
        }
    });
}
function cron(){
    var users=ut.ini.param('weibo');
    for(var name in users){
        var info=JSON.parse(users[name]);
        if(!info.time)info.time=Date.now()-1000;
        if(Date.now()-info.time>=0 && info.pass){
            //var domains=['login.sina.com.cn','sina.com.cn','kandian.com','login.t.cn','weibo.com','vdisk.weibo.com'];
            //domains.forEach(function(e){ut.Cookie.remove(e);});
            ut.Cookie.remove('vdisk.weibo.com');
            login(name,info.pass);
            var _8hours=1000*60*60*8;
            info.time=info.time+_8hours;
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
    //ut.ini.load();
    setTimeout(function(){
        console.log('executing...');
        try{
            login('y2be@163.com','ssskha201279');
            //cron();
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);
    process.on('exit',function(){
        //ut.ini.write();
            //ut.Cookie.remove('vdisk.weibo.com');
        ut.Cookie.trace();
    });
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

