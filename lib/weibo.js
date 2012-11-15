/*
 *var crypto=require('crypto'),
 *    path=require('path'),
 *    fs=require('fs'),
 *    http=require('http'),
 *    urlparse=require('url').parse,
 *    util=require('util');
 */
var util=require('util'),
    qs=require('querystring');
var  ut=require('./utility.js');

var logger=ut.logger;
var SSE=require('./sinaSSOEncoder.js'),
    RSAKey = new SSE.sinaSSOEncoder.RSAKey();
//var RSAKey = new require('./sinaSSOEncoder.js').sinaSSOEncoder.RSAKey();

function cron(){
    //console.log(Date.now());
    var users=ut.ini.param('weibo');
    //console.dir(users);
    for(var name in users){
        var info=JSON.parse(users[name]);
        if(Date.now()-info.time>=0){
            var domains=['login.sina.com.cn','sina.com.cn','kandian.com','login.t.cn','weibo.com','vdisk.weibo.com'];
            domains.forEach(function(e){ut.Cookie.remove(e);});
            sign(name,info.pass);
            var _8hours=1000*60*60*8;
            info.time=Date.now()+_8hours;
            users[name]=JSON.stringify(info);
            break;
            //return;
        }
    }
    //process.exit();
}
function sign(username,password){
logger.info('[weibo]%s is login...',username);
username=new Buffer(encodeURIComponent(username)).toString('base64');
var callback='STK_'+Date.now();
var url=util.format('http://login.sina.com.cn/sso/prelogin.php?entry=miniblog&su=%s&rsakt=mod&callback=%s',username,callback);
ut.http.get(url,{'Referer':'http://vdisk.weibo.com/'},function(err,res){
    var data=res.data;
    var str=data.substring(callback.length+1,data.length-1);
    var me=JSON.parse(str);
    RSAKey.setPublic(me.pubkey, '10001');
    password = RSAKey.encrypt([me.servertime, me.nonce].join("\t") + "\n" + password);
    var payload=qs.stringify({
        su:username,sp:password,
        url:'http://weibo.com/login.php?url=http%3A%2F%2Fvdisk.weibo.com%2F',
        returntype:'META',encoding:'utf-8',
        pwencode:'rsa2',servertime:me.servertime,nonce:me.nonce,
        gateway:1,rsakv:me.rsakv,savestate:7
    });
    ut.http.post('http://login.sina.com.cn/sso/login.php?entry=weipan',
        payload,function(err,res){
        var urls=[];
        var str=res.data;
        for(var i=str.indexOf('http://weibo',str.indexOf('<script>')),j=-1;
            i>=0;i=str.indexOf('http://weibo',j)){
            var j=str.indexOf(str[i-1],i);
            if(j>=0){urls.push(str.substring(i,j).replace(/\\/g,''));}
        }
        if(urls.length!=1){
            logger.error('vdisk.weibo.com: login failed');
            logger.error(str);
            return;
        }
        //ut.http.get(urls[0]+'&callback=sinaSSOController.doCrossDomainCallBack&scriptId=ssoscript0&client=ssologin.js(v1.4.2)&_='+Date.now());
        //setTimeout(function(){ut.http.get(urls[1]+'&callback=sinaSSOController.doCrossDomainCallBack&scriptId=ssoscript1&client=ssologin.js(v1.4.2)&_='+Date.now());},1*3000);
        setTimeout(function(){ut.http.get(urls[0]);},1000);
        setTimeout(function(){
            var url='http://vdisk.weibo.com/task/checkIn';
            ut.http.post(url,null,{'X-Requested-With':'XMLHttpRequest'},
                function(err,res){
                    try{
                    var rs=JSON.parse(res.data);
                    if(rs.errcode==0){
                        logger.log('vdisk.weibo.com: %sMB',rs.data[0]);
                    }else{
                        logger.warn(rs.msg);
                    }
                    }catch(err){
                        logger.error(err);
                        logger.error(res.data);
                    }
                    //ut.Cookie.save('cookie.weibo');
                });
        },6000);
        
    });
});

}
exports.takeBonus=cron;
if(false){
    console.log(__filename);
    ut.ini.load();
    setTimeout(function(){
        console.log('executing...');
        try{
        cron();
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);
    process.on('exit',function(){
        ut.ini.write();
    });
}
