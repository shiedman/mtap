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

function Site(username,password){
    this.user={name:username,passwd:password};
    //var cfg=ut.ini.param('f.xunlei.com');
    //if(cfg){this.user.name=cfg.name;this.user.passwd=cfg.pass;}
    /*
     *if(userinfo instanceof Array && ! (userinfo instanceof Object)){
     *    for(var k in userinfo){this.user[k]=userinfo[k];}
     *}
     */
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

Site.prototype.lsRoot=function(userId,callback){
    if(!userId)userId=this.user.id;
    var jQueryFun='jQuery'+Math.floor(Math.random()*10000000)+'_'+Date.now();
    var url=util.format('http://svr.f.xunlei.com/styleBox/getUserFolderStyleBoxs?callback=%s&ownerUserId=%d&needVrd=1&_=%d',jQueryFun,userId,Date.now());
    this.http.get(url,function(err,res){
        if(err)return callback([]);
        try{
            var data=res.content;
            var jsonstr=data.substring(jQueryFun.length+1,data.length-1);
            var rtnData=JSON.parse(jsonstr);
            if(rtnData.rtn!=0){
                logger.warn('[xunlei]failed to retrieve folder list:%s',url);
                logger.warn(data);
                return callback([]);
            }
            var nodes=rtnData.data.nodes;
            for(var i=0;i<nodes.length;i++){
                var n=nodes[i];
                n.path='/'+n.nodeName;
                n.type=2;
            }
            callback(nodes);
        }catch(error){
            logger.error(error);
            callback([]);
        }
    });
};
Site.prototype.ls=function(nodeId,userId,callback){
    if(!userId)userId=this.user.id;
    var jQueryFun='jQuery'+Math.floor(Math.random()*10000000)+'_'+Date.now();
    var url=util.format('http://svr.f.xunlei.com/file/getUserFileList?callback=%s&userId=%s&node=%s%%3A%s&needAudit=1&defaultIco=0&_=%s',jQueryFun,userId,userId,nodeId,Date.now());
    this.http.get(url,function(err,res){
        if(err)return callback([]);
        try{
            var data=res.content;
            var jsonstr=data.substring(jQueryFun.length+1,data.length-1);
            var rtnData=JSON.parse(jsonstr);
            if(rtnData.rtn!=0){
                logger.warn('[xunlei]failed to retrieve folder list:%s',url);
                logger.warn(data);
                return callback([]);
            }
            var nodes=rtnData.data.nodes;
            callback(nodes);
        }catch(error){
            logger.error(error);
            callback([]);
        }
    });
};

Site.prototype._lsR=function(nodeId,userId,callback){
    if(nodeId){
        this.ls(nodeId,userId,callback);
    }else{
        this.lsRoot(userId,callback);
    }
};
Site.prototype.lsR=function(nodeId,userId,callback){
    var dirs=[],files=[],working=[],running=1,self=this;
    function visitNodes(nodes){
        for (var i = 0, l = nodes.length; i < l; i ++) {
            var n = nodes[i];
            if(n.type==1){
                files.push(n);
            }else if(n.type==2){
                dirs.push(n);
            }else{
                logger.warn('error type:%s',n.type);
            }
        }
        while(dirs.length>0 && working.length<3){
            working.push(dirs.shift());
        }
        running--;
        //console.log('running:%s',running);
        if(working.length&&running<3){
            //var d=dirs.shift();
            while(working.length){
                var d=working.shift();
                running++;
                self._lsR(d.nodeId,userId,visitNodes);
            }
        }else{
            if(running==0)callback(files);
        }
    }
    this._lsR(nodeId,userId,visitNodes);
};

Site.prototype.iterateFiles=function(nodes){
    var files=nodes||[],errors=0,running=0,scans=0,self=this;
    function visitFiles(){
        if(files.length){
            //var d=dirs.shift();
            var d=files.shift();
            running++;
            var url=util.format('http://f.xunlei.com/%s/file/%s',d.userId,d.nodeId);
            var headers={'Referer':'http://f.xunlei.com/'+d.userId}
            self.http.get(url,headers,function(err,res){
                running--;
                if(err||res.statusCode!=200){
                    errors++;
                    logger.warn('error %s:%s',res.statusCode,url);
                    logger.warn(err);
                    var _arr=url.split('/'),_nodeId=_arr.pop(),_=_arr.pop(),_userId=_arr.pop();
                    files.push({userId:_userId,nodeId:_nodeId});
                }else{
                    scans++;
                }
                if(errors<100){
                    visitFiles();
                }else{
                    logger.warn('go 100 errors, congratulations man');
                }
            });
        }else{
            //console.log('running:%s',running);
            //if(running==0){
            logger.info('[running:%s]scaned files: %s',running,scans);
            //}
        }
    }
    visitFiles();
    visitFiles();
    visitFiles();
    //setInterval(function(){ console.log('files:%s, running:%s',files.length,running); },10000);
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
    var task=new httptask.Task(filepath,cfg.filesize,2,function(){
        upload(filepath);
    });
    var req=multipart.post(cfg._upload_url,payload,headers,
        function(err,res){
            if(err){
                //task.status=-3;
                return logger.error('[upload]error:'+err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){task.update(data.length);}
    );
    task.on('abort',function(){req.abort();});
    //task.resumable=false;
};

/*
 *}
 */

function upload(filepath){
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var cfg=ut.ini.param('f.xunlei.com');
    var valid=cfg && cfg.name && cfg.pass;
    if(!valid){
        return logger.warn('invalid config :%j',cfg);
    }
    var xunlei=new Site(cfg.name,cfg.pass);
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
function scan(loginuser,loginpass,scantarget,scanNodeId){
    var xunlei=new Site(loginuser,loginpass);
    xunlei.once('login',function(){
        xunlei.lsR(scanNodeId,scantarget,function(nodes){
            logger.info('total files: %s',nodes.length);
            //fs.writeFileSync('nodes.txt',JSON.stringify(nodes,null,2));
            xunlei.iterateFiles(nodes);
        });
    });
    xunlei.login();
}
exports.upload=upload;
exports.scan=scan;
if(false){
    console.log(__filename);

    //ut.ini.load();
    try{
        //upload('xunlei.js');
        console.log(process.memoryUsage());
        scan('username','password','uesrid');//,'5bc864c8-f92b-4279-a079-79afc8d21f3b');
        process.on('exit',function(){
            console.log(process.memoryUsage());
        });
        if(false){
        var s=fs.readFileSync('nodes.txt','utf-8');
        var nodes1=JSON.parse(s);
        s=fs.readFileSync('nodes0.js','utf-8');
        var nodes0=JSON.parse(s);
        console.log('nodes0:%s,nodes1:%s',nodes0.length,nodes1.length);
        for (var l = nodes0.length,i=l-1; i >=0; i --) {
            var n0 = nodes0[i];
            for (var j = 0, len = nodes1.length; j < len; j ++) {
                var n1 = nodes1[j];
                if(n0.nodeId==n1.nodeId){
                    nodes0.splice(i,1);
                    nodes1.splice(j,1);
                    break;
                }
            }
        }
        console.log(nodes0);
        console.log(nodes1);
        }
    }catch(err){
        console.log(err);
        console.log(err.stack);
    }


}
