var http=require('http'),
    util=require('util'),
    fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    crypto=require('crypto'),
    urlparse=require('url').parse;

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    ut=require('./utility.js'),
    logger=ut.logger;

function Uploader(userinfo){
    this.construct(userinfo);
    if(!this.user.passwd){
        throw('No password setted');
    }
}
util.inherits(Uploader,require('events').EventEmitter);
Uploader.prototype.construct=function(userinfo){
    this.user={};
    var cfg=ut.ini.param('xunlei');
    if(cfg){this.user.name=cfg.user;this.user.passwd=cfg.pass;}
    if(userinfo instanceof Array && ! (userinfo instanceof Object)){
        for(var k in userinfo){this.user[k]=userinfo[k];}
    }
    this.nodeid='';
    this.sessionid=0;
};


/*
 *var xunlei={
 *    user:{id:'',name:'y2be@163.com',passwd:'sh201279'},
 *    nodeid:'', sessionid:0,
 */
Uploader.prototype.loginCheck=function(callback){
    var url= util.format('http://login.xunlei.com/check?u=%s&t=%d',this.user.name,Date.now());
    ut.http.get(url,function(err,res){
        if (res.statusCode==200){
            if(callback)callback(res.cookie['check_result']);
        }else{
            if(callback)callback(new Error('status code: '+res.statusCode));
            logger.error('[loginCheck]failed: http status is '+res.statusCode);
        }

    });

};

Uploader.prototype.login=function(check_result){
    var url='http://login.xunlei.com/sec2login?xltime='+Date.now();
    if(!check_result){
        logger.warn('check_result not found!');return;
    }
    var _i=check_result.indexOf('0:');
    if(_i>=0)check_result=check_result.substring(_i+2);
    md5=crypto.createHash('md5').update(this.user.passwd).digest('hex')
        md5=crypto.createHash('md5').update(md5).digest('hex')
        md5=crypto.createHash('md5').update(md5+check_result.toUpperCase()).digest('hex')
        var payload=qs.stringify({
            u:this.user.name,p:md5,verifycode:check_result,
            login_enable:1, login_hour:336,loginTime:Date.now()
        });
    var self=this;
    ut.http.post(url,payload,function(err,res){
        if (res.statusCode==200 && res.cookie['luserid']){
            logger.log('login success');
            self.user.id=res.cookie['luserid'];
            self.sessionid=res.cookie['lsessionid'];
            self.emit('login');
        }else{
            logger.error('[loginCheck]failed: http status is '+res.statusCode);
        }
    });
};

Uploader.prototype.isLogin=function(callback){
    var self=this;
    self.user.id='';
    ut.Cookie.get('http://f.xunlei.com/',function(err,cookies){
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
        if(callback)callback(exists);
    });
};

Uploader.prototype.folderExists=function(callback){
    var jQueryFun='jQuery'+Math.floor(Math.random()*10000000)+'_'+Date.now();
    var url=util.format('http://svr.f.xunlei.com/styleBox/getUserFolderStyleBoxs?callback=%s&ownerUserId=%d&needVrd=1&_=%d',jQueryFun,this.user.id,Date.now());
    ut.http.get(url,function(err,res){
        var data=res.data;
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

Uploader.prototype.createFolder=function(callback){
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
    ut.http.post(url,payload,function(err,res){
        var data=res.data;
        var _i=data.indexOf('rtnData='),_j=data.indexOf(')',_i);
        var jsonstr=data.substring(_i+'rtnData='.length,_j);
        var rtndata=JSON.parse(decodeURIComponent(jsonstr));
        if(rtndata.rtn==0){
            //self.nodeid=rtndata.data.nodeId;
            self.emit('folder');
        }else{
            logger.error('[xunlei][createFolder]failed:');
            logger.error(data);
        }
    });
};

Uploader.prototype.addFile=function(filepath,callback){
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
    ut.http.post(url,payload,function(err,res){
        var data=res.data;
        if(!data){logger.warn('[xunlei.addFile]: empty http response');return;}
        data=decodeURIComponent(data);
        var m=data.match(/rtnData=(.+)\)$/);
        if (!m){
            logger.error('[xunlei.addFile]failed:'+filepath);
            logger.error('    cause:'+data); return;
        }
        var cfg=JSON.parse(m[1]);
        if (cfg.rtn!=0){
            logger.error('[upload]failed:'+filepath);
            logger.error('    cause:'+data); return;
        }
        cfg=cfg.data[0];
        cfg.filesize=filesize;
        cfg.filepath=filepath;
        callback(cfg);
    });

};

Uploader.prototype.web_upload=function(cfg){
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

//exports=exports.xunlei;
if(false){
    console.log(__filename);
    //xunlei.loginCheck(function(check){
        //xunlei.login(check);
    //});
    //process.on('exit',function(){
    //ut.Cookie.save();
    //});


    ut.Cookie.load();
    //setTimeout(function(){
        //xunlei.loadCookie();
    //},1000);
    setTimeout(function(){
        //xunlei.addFile('cookies.txt',function(cfg){ console.log(cfg); xunlei.web_upload(cfg); });
        console.log('executing...');
        try{
        upload('cookies.txt');
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);


}
function upload(filepath){
    //var filepath='cookies.txt';
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var xunlei=new Uploader();
    xunlei.on('login',function(){
        xunlei.folderExists(function(exists){
            exists?xunlei.emit('folder'):createFolder();
            /*
             *if(exists){
             *    xunlei.emit('folder');
             *}else{
             *    createFolder();
             *}
             */
        });
    });
    xunlei.on('folder',function(){
        xunlei.addFile(filepath,function(cfg){xunlei.web_upload(cfg);});
    });
    xunlei.isLogin(function(exists){
        //if(true){console.log(exists);return;}
        if(exists){
            xunlei.emit('login');
        }else{
            xunlei.loginCheck(function(check_result){
                xunlei.login(check_result);
            });
        }
    });

}
exports.upload=upload;
