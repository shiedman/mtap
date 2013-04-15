//http://js.t.sinajs.cn/t35/miniblog/static/js/sso.js
var util=require('util'),
    qs=require('querystring');

var ut=require('./utility.js'),
    HttpClient=require('./urlfetch').HttpClient,
    logger=ut.logger;

var SSE=require('./sinaSSOEncoder.js'),
    RSAKey = new SSE.sinaSSOEncoder.RSAKey();


function Site(username,password,httpclient){
    this.username=username,this.password=password;
    this.http=httpclient||new HttpClient();
    this.http.encoding='utf-8';
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var su=new Buffer(encodeURIComponent(username)).toString('base64');
    var self=this;
    logger.info('[ishare.sina.com.cn]%s is login...',username);
    //var callback='STK_'+Date.now();
    var url=util.format('http://login.sina.com.cn/sso/prelogin.php?entry=zhishiren&callback=sinaSSOController.preloginCallBack&su=%s&rsakt=mod&client=ssologin.js(v1.4.4)&_=%s',su,Date.now());
    var preloginTimeStart=Date.now();
    self.http.get(url,{'Referer':'http://ishare.iask.sina.com.cn/'},function(err,res){
        //console.log(res.content);
        if(err){return logger.warn(err);}
        if(res.statusCode!=200){return logger.warn('prlogin failed:%s',res.statusCode);}
        var data=res.content;
        var i=data.indexOf('('),j=data.indexOf(')',i+1);
        if(i<0||j<0){return logger.warn('prelogin failed: %s',data);}
        var me=JSON.parse(data.substring(i+1,j));
        if(me['retcode']!=0){return logger.warn('prelogin failed:%s',data);}
        RSAKey.setPublic(me.pubkey, '10001');
        var sp = RSAKey.encrypt([me.servertime, me.nonce].join("\t") + "\n" + password);
        var payload=qs.stringify({
            entry:'zhishiren',gateway:1,from:'',savestate:30,useticket:0,
            su:su,service:'sso',servertime:me.servertime,nonce:me.nonce,
            pwencode:'rsa2', rsakv:me.rsakv,sp:sp,
            encoding:'utf-8',prelt:Date.now()-preloginTimeStart,
            url:'http://ishare.iask.sina.com.cn/login/ajaxlogin.php?framelogin=1&callback=parent.sinaSSOController.feedBackUrlCallBack',
            returntype:'META'
        });
        var url='http://login.sina.com.cn/sso/login.php?client=ssologin.js(v1.4.4)';
        self.http.post(url, payload,function(err,res){
            self.emit('login',res.content);
        });
        //ut.http.get(urls[0]+'&callback=sinaSSOController.doCrossDomainCallBack&scriptId=ssoscript0&client=ssologin.js(v1.4.2)&_='+Date.now());
        //setTimeout(function(){ut.http.get(urls[1]+'&callback=sinaSSOController.doCrossDomainCallBack&scriptId=ssoscript1&client=ssologin.js(v1.4.2)&_='+Date.now());},1*3000);
        //setTimeout(function(){ut.http.get(urls[0]);},1000);
        
    });
};

Site.prototype.crosslogin=function(content){
    var m=content.match(/<script>([^<]+)</);
    var script=m[1];
    var i=script.indexOf('('),j=script.indexOf(')',i+1);
    if(i<0||j<0){return logger.warn(content);}
    var rtn=JSON.parse(script.substring(i+1,j));
    var urls=rtn.arrURL;
    i= script.indexOf('http://ishare.iask.sina.com.cn'),j=script.indexOf(script[i-1],i);
    if(i<0||j<0){return logger.warn(content);}
    var ishare_url=script.substring(i,j);
    var self=this;
    self.http.get(ishare_url,function(err,res){
        self.emit('ready');
    });
};
Site.prototype.roll=function(){
    var weibo_msg='action=shareweibo&weiboContent=%23%E8%AE%A9%E5%85%B1%E4%BA%AB%E5%8F%98%E6%88%90%E6%B0%B8%E6%81%92%23+%E8%AF%84%E9%80%89%E5%BF%83%E7%9B%AE%E4%B8%AD%E7%9A%84%E5%85%B1%E4%BA%AB%E7%90%86%E7%94%B1%E7%8E%A9%E8%BD%AC%E7%9B%98%E8%B5%A2%E5%A4%A7%E5%A5%96%EF%BC%8C%E5%8A%A0%E5%85%A5%E6%88%91%E4%BB%AC%E7%9A%84%E5%85%B1%E4%BA%AB%E9%98%9F%E4%BC%8D%EF%BC%8C+%E6%88%91%E5%BF%83%E4%B8%AD%E7%9A%84%E5%85%B1%E4%BA%AB%E7%90%86%E7%94%B1%E6%98%AF%E5%B0%86%E5%88%86%E4%BA%AB%E7%9A%84%E8%B7%9D%E7%A6%BB%E4%BC%A0%E9%80%92%E5%BE%97%E6%9B%B4%E8%BF%9C%E3%80%82%E4%BD%A0%E4%BB%AC%E4%B9%9F%E8%B5%B6%E5%BF%AB%E4%B8%80%E8%B5%B7%E6%9D%A5%E8%AF%84%E9%80%89%E5%90%A7%EF%BC%81';
    var self=this;
    var url='http://ishare.iask.sina.com.cn/act/coope/ishare2/api/api.php?callback=jQuery'+Date.now()+'_'+Date.now();
    self.http.post(url,weibo_msg,function(err,res){
        if(res.statusCode!=200)return logger.warn('ishare send weibo message failed');
        //var data=res.content;
        //var i=data.indexOf('('),j=data.indexOf(')',i+1);
        //if(i<0||j<0){return logger.warn(data);}
        //var rtn=JSON.parse(data.substring(i+1,j));
        //if(!rtn['success']){ return logger.warn(data); }
        var payload='req=flash&action=lotto';
        var url='http://ishare.iask.sina.com.cn/act/coope/ishare2/api/api.php';
        self.http.post(url,payload,function(err,res){
            if(res.statusCode!=200)return logger.warn('ishare roll failed');
            logger.info(res.content);
        });
    });

};
function loadInfo(info){
    info.ishare=parseInt(info.ishare||Date.now()-100);
    return info;
}
function checkin(){
    var users=ut.ini.param('vdisk.weibo.com');
	if(!Array.isArray(users))users=[users];
    for(var i=0;i<users.length;i++){
        var info=loadInfo(users[i]);
        if(Date.now()-info.ishare>=0 && info.pass){
            var site=new Site(info.name,info.pass,new HttpClient(true));
            site.on('login',function(content){ site.crosslogin(content); });
            site.on('ready',function(){site.roll();});
            site.login();
            var _3hours=1000*60*60*3;
            info.ishare=Date.now()+_3hours+1000*60*2;
            break;
        }
    }
    //process.exit();
}
exports.checkin=checkin;