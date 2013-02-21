/*
 ** shiedman (shiedman@gmail.com)
 ** f.xunlei.com upload
 */
var http=require('http'),
    util=require('util'),
    fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    crypto=require('crypto'),
    urlparse=require('url').parse;

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;

function Site(userinfo){
    this.user={};
    var cfg=ut.ini.param('f.xunlei.com');
    if(cfg){this.user.name=cfg.name;this.user.passwd=cfg.pass;}
    if(userinfo instanceof Array && ! (userinfo instanceof Object)){
        for(var k in userinfo){this.user[k]=userinfo[k];}
    }
    this.nodeid='';
    this.sessionid=0;

    if(!this.user.passwd){
        throw('No password setted');
    }
    this.http=new HttpClient();
    this.http.follow_redirects=0;
    this.http.encoding='utf-8';
}
util.inherits(Site,require('events').EventEmitter);


/*
 *var xunlei={
 *    user:{id:'',name:'ero123@163.com',passwd:'123456'},
 *    nodeid:'', sessionid:0,
 */
Site.prototype.login=function(){
    var self=this;
    var url= util.format('http://login.xunlei.com/check?u=%s&t=%d',this.user.name,Date.now());
    self.http.get(url,function(err,res){
        if(res.statusCode!=200)return logger.error('GET %s - %s',url,res.statusCode);
        var check_result=res.cookie['check_result'];
        if(!check_result)return logger.warn('check_result not found!');

        var i=check_result.indexOf('0:');
        if(i>=0)check_result=check_result.substring(i+2);
        md5=crypto.createHash('md5').update(self.user.passwd).digest('hex');
        md5=crypto.createHash('md5').update(md5).digest('hex');
        md5=crypto.createHash('md5').update(md5+check_result.toUpperCase()).digest('hex');
        var payload=qs.stringify({
            u:self.user.name,p:md5,verifycode:check_result,
            login_enable:1, login_hour:336,loginTime:Date.now()
        });
        var url='http://login.xunlei.com/sec2login?xltime='+Date.now();
        self.http.post(url,payload,function(err,res){
            if (res.statusCode==200 && res.cookie['luserid']){
                logger.log('login success');
                self.user.id=res.cookie['luserid'];
                self.sessionid=res.cookie['lsessionid'];
                self.emit('login');
            }else{
                logger.error('[loginCheck]failed: http status is '+res.statusCode);
            }
        });
    });

};

Site.prototype.isLogin=function(callback){
    var self=this;
    self.user.id='';
    self.http.cookiejar.getCookies('http://f.xunlei.com/',function(err,cookies){
        var exists=false;
        for(var i=0;i<cookies.length;i++){
            if(cookies[i].key=='luserid'){
                self.user.id=cookies[i].value;
                exists=true;
            }
            if(cookies[i].key=='lsessionid'){
                self.sessionid=cookies[i].value;
                exists=true;
            }
        }
        callback(exists);
    });
};

Site.prototype.folderExists=function(callback){
    var jQueryFun='jQuery'+Math.floor(Math.random()*10000000)+'_'+Date.now();
    var url=util.format('http://svr.f.xunlei.com/styleBox/getUserFolderStyleBoxs?callback=%s&ownerUserId=%d&needVrd=1&_=%d',jQueryFun,this.user.id,Date.now());
    this.http.get(url,function(err,res){
        var data=res.content;
        var jsonstr=data.substring(jQueryFun.length+1,data.length-1);
        var rtnData=JSON.parse(jsonstr);
        if(rtnData.rtn!=0){
            logger.warn('[xunlei][folderExists]failed to retrieve folder list');
            return logger.warn(data);
        }
        var nodes=rtnData.data.nodes;
        for(var i=0;i<nodes.length;i++){
            if(nodes[i].nodeName=='dotcloud')return callback(true);
        }
        callback(false);
    });
};

Site.prototype.createFolder=function(callback){
    var self=this;
    var requestType=Math.floor(Math.random()*10000000);
    var url='http://svr.f.xunlei.com/folder/mkdir?xltime='+requestType;
    var payload=qs.stringify({
        requestType:requestType,
        proxyUrl:'http://f.xunlei.com/postProxy.html',
        userId:this.user.id,
        path:'/dotcloud',
        desc:'robots upload',
        category:7,status:1,topic:true,tags:''
    });
    self.http.post(url,payload,function(err,res){
        var data=res.content;
        var _i=data.indexOf('rtnData='),_j=data.indexOf(')',_i);
        var jsonstr=data.substring(_i+'rtnData='.length,_j);
        var rtndata=JSON.parse(decodeURIComponent(jsonstr));
        if(rtndata.rtn==0){
            //self.nodeid=rtndata.data.nodeId;
            logger.info('[xunlei]folder dotcloud created');
            self.emit('folder');
        }else{
            logger.error('[xunlei][createFolder]failed:');
            logger.error(data);
        }
    });
};

Site.prototype.addFile=function(filepath,callback){
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var requestType=Math.floor(Math.random()*10000000);
    var url='http://svr.f.xunlei.com/file/addFile?xltime='+requestType;

    var payload=qs.stringify({
        requestType:requestType,
        proxyUrl:'http://f.xunlei.com/postProxy.html',
        userId:this.user.id,
        path:'/dotcloud/'+filename,
        size:filesize,
        nodeId:this.nodeId,
        option:'rename',desc:'',poiName:'动漫'
    });
    this.http.post(url,payload,function(err,res){
        var data=res.content;
        if(!data)return logger.warn('[xunlei.addFile]: empty http response');
        data=decodeURIComponent(data);
        var m=data.match(/rtnData=(.+)\)$/);
        if (!m)return logger.error('[xunlei.addFile]failed: %s\r\n\tcause:%s',filepath,data);
        var cfg=JSON.parse(m[1]);
        if (cfg.rtn!=0)return logger.error('[upload]failed: %s\r\n\tcause:%s',filepath,data);
        cfg=cfg.data[0];
        cfg.filesize=filesize;
        cfg.filepath=filepath;
        callback(cfg);
    });

};

Site.prototype.web_upload=function(cfg){
    var headers={'User-Agent':'Shockwave Flash'};
    var infoStr="userid=${userid};sessionid=${sessionid};transactionid=${transactionid};encrypttype=0;iscompress=0;keytype=0;chunksize_0=${size};chunkseq_0=0;nodeid_0=${nodeId};filesize_0=${size};hash_0=0;";
    var info={
        userid:this.user.id,sessionid:this.sessionid,
        transactionid:cfg._transaction_id,size:cfg.filesize,nodeId:cfg._nodeid
    };
    var filepath=cfg.filepath;
    var filename=path.basename(filepath);
    var payload={
        Filename:filename,
        info:infoStr.format(info),
        FILE:{name:'info',filepath:filepath},
        Upload:'Submit Query'
    }
    var task=new httptask.Task(null,filepath,cfg.filesize);
    var req=multipart.post(cfg._upload_url,payload,headers,
        function(err,res){
            if(err){
                task.status=-3;return logger.error('[upload]error:'+err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};

/*
 *}
 */

function upload(filepath){
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var xunlei=new Site();
    xunlei.on('login',function(){
        xunlei.folderExists(function(exists){
            exists?xunlei.emit('folder'):xunlei.createFolder();
        });
    });
    xunlei.on('folder',function(){
        xunlei.addFile(filepath,function(cfg){xunlei.web_upload(cfg);});
    });
    xunlei.isLogin(function(exists){
        exists?xunlei.emit('login'):xunlei.login();
    });

}
exports.upload=upload;
if(false){
    console.log(__filename);

    ut.ini.load();
    //ut.Cookie.load();
    //setTimeout(function(){
        //xunlei.loadCookie();
    //},1000);
    setTimeout(function(){
        //xunlei.addFile('cookies.txt',function(cfg){ console.log(cfg); xunlei.web_upload(cfg); });
        try{
        upload('xunlei.js');
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);


}
