//http://js.t.sinajs.cn/t35/miniblog/static/js/sso.js
var util=require('util'),
    fs=require('fs'),
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
    logger.info('[vdisk.weibo.com]',username);
    var callback='STK_'+Date.now();
    var url=util.format('http://login.sina.com.cn/sso/prelogin.php?entry=%s&callback=%s&su=%s&rsakt=mod','miniblog',callback,su);
    var preloginTimeStart=Date.now();
    self.http.get(url,{'Referer':'http://vdisk.weibo.com/'},function(err,res){
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
            su:su,sp:sp,
            url:'http://weibo.com/login.php?url=http%3A%2F%2Fvdisk.weibo.com%2F',
            returntype:'META', encoding:'utf-8',
            pwencode:'rsa2',servertime:me.servertime,
            nonce:me.nonce, gateway:1,
            rsakv:me.rsakv,savestate:7
        });
        var url='http://login.sina.com.cn/sso/login.php?entry=weipan';
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
    if(!m){return logger.warn(content);}
    var script=m[1];
    var i=script.indexOf('('),j=script.indexOf(')',i+1);
    if(i<0||j<0){return logger.warn(content);}
    var rtn=JSON.parse(script.substring(i+1,j));
    var urls=rtn.arrURL;

    var s='location.replace(';
    i= script.indexOf(s),j=i+s.length,k=script.indexOf(script[j],j+1);
    if(i<0||j<0||k<0){return logger.warn(content);}
    var url=script.substring(j+1,k);
    var self=this;
    self.http.get(url,function(err,res){
        self.emit('ready');
    });
};
Site.prototype.checkin=function(){
    var url='http://vdisk.weibo.com/task/checkIn';
    this.http.post(url,null,{'X-Requested-With':'XMLHttpRequest'},function(err,res){
        try{
            var rs=JSON.parse(res.content);
            if(rs.errcode==0){
                logger.log('[vdisk.weibo.com]获得: %sMB',rs.data[0]);
            }else{
                logger.warn(rs.msg);
            }
        }catch(err){
            logger.error(err);
            logger.error(res.data);
        }
    });
};
Site.prototype.list=function(id,callback){
    var headers={
        'X-Request-With':'XMLHttpRequest',
        'Referer':'http://vdisk.weibo.com/'
    };
    var url=util.format('http://vdisk.weibo.com/dir/ajaxListItems?dir_id=%s&file_type=&page_size=100&_=%s',id,Date.now());
    this.http.get(url,headers,function(err,res){
        if(err){
            logger.warn(err);
            return callback([]);
        }
        var rtn=JSON.parse(res.content);
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
    this.http.get(url,headers,function(err,res){
        if(err){
            logger.warn(err);
            return callback(null);
        }else{
            var info=JSON.parse(res.content);
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
            var site=new Site(info.name,info.pass,new HttpClient(true));
            site.on('login',function(content){ site.crosslogin(content); });
            site.on('ready',function(){site.checkin();});
            site.login();
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
    site.on('login',function(content){ site.crosslogin(content); });
    site.on('ready',function(){
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
    site.login();
}
exports.checkin=checkin;
exports.lsdir=lsdir;
if(false){
    console.log(__filename);
    ut.ini.load();
    setTimeout(function(){
        try{
            lsdir(119338987);
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);
    process.on('exit',function(){
        //ut.ini.write();
    });
}
