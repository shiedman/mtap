var fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    util=require('util');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;

function Site(username,password){
    //this.construct(username,password,filepath);
    this.username=username;
    this.password=password;
    if(!this.password){
        throw('No password setted');
    }
    this.http=new HttpClient();
    this.http.encoding='utf-8';
}
util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var url='http://uptobox.com/';
    var self=this;
    self.http.cookiejar.getCookies(url,function(err,cookies){
        if(err)return logger.warn(err);
        for(var i=cookies.length-1;i>=0;i--){
            if(cookies[i].key=='xfss'){return self.emit('login');}
        }
        var payload=qs.stringify({ 
            op:'login',
            redirect:'http://uptobox.com/',
            login:username,
            password:password,
            x:1, y:15
        });
        self.http.post(url,payload,{'Referer':'http://uptobox.com/login.html'},function(err,res){
            if(res.cookie['xfss']){
                self.emit('login');
            }else{
                logger.warn('[uptobox]%s login failed',username);
            }
        });
    });
};
Site.prototype.multi_upload=function(filename){
    var self=this;
    var site_url='uptobox.com/?op=multi_upload';
    self.http.get('http://'+site_url,function(err,res){
        if(err){return logger.warn(err);}
        var data=res.content||'';
        if(data.indexOf('sess_id')<0){
            return logger.warn('sess_id not found');
        }
        var i=data.search(/<form\s+name="file"/);
        if(i<0){ return logger.warn('<form name="file" ...> NOT FOUND');}
        var j=data.indexOf('</form>',i+6);
        if(j<0){ return logger.warn('<form name="file" ...> NOT FOUND');}
        var form=data.substring(i,j);
        var action=form.match(/action="([^"]+)"/)[1];
        var hiddens=form.match(/<input\s+type="hidden"[^>]+\/>/g)
        var cfg={};
        hiddens.forEach(function(e){
            var parts=e.match(/name="([^"]+)"\s+value="([^"]+)"/);
            cfg[parts[1]]=parts[2];
        });
        var UID='';
        for(var i=0;i<12;i++) UID+=''+Math.floor(Math.random() * 10);
        //var filename=path.basename(self.filepath);
        var url = cfg['srv_tmp_url']+'/status.html?'+UID+'='+encodeURIComponent(filename)+'='+site_url;
        self.http.get(url,function(err,res){
            if(err){return logger.warn(err);}
            if(res.statusCode==200){
                cfg['upload_url']=action+UID+'&js_on=1&utype=reg&upload_type=file';
                self.emit('ready',cfg);
            }else{
                logger.warn('failed:%s',url);
            }
        });
    });
};
Site.prototype.upload=function(cfg){
    var headers={
        'User-Agent':'Mozilla/5.0 (Windows NT 5.1; rv:17.0) Gecko/20100101 Firefox/17.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    var filepath=cfg.filepath;
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var payload={
        upload_type:'file',
        sess_id:cfg['sess_id'],
        srv_tmp_url:cfg['srv_tmp_url'],
        FILE:{name:'file_0',filepath:filepath},
        file_0_descr:'',
        tos:1,
        submit_btn:''
    }
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post(cfg.upload_url,payload,headers,
        function(err,res){
            if(err){
                task.status=-3;return logger.error('[upload]error:%s',err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};

function upload(filepath){
    var info=ut.ini.param('uptobox');
    //console.log(info);
    if(!info.user||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Site(info.user,info.pass);
    //var filename=path.basename(self.filepath);
    up.on('login',function(){
        up.multi_upload(path.basename(filepath));
    });
    up.on('ready',function(cfg){
        if(!cfg){return logger.warn('cfg is empty');}
        cfg['filepath']=filepath;
        up.upload(cfg);
    });
    up.login();

}

exports.upload=upload;
if(false){
    console.log(__filename);
    ut.ini.load();
    //setInterval(cron,5000);
    //login('y2be@163.com','su201279');
    //ut.http.get('http://115.com',function(err,res){
        //fs.writeFileSync('log',res.data);
    //});
    setTimeout(function(){

    upload('uptobox.js');

    },2000);
    process.on('exit',function(){
        //ut.Cookie.save();
        //ut.ini.write();
    });
}
/**
POST /cgi-bin/upload.cgi?upload_id=329232476565&js_on=1&utype=reg&upload_type=file HTTP/1.1
Host: www11.uptobox.com
User-Agent: Mozilla/5.0 (Windows NT 5.1; rv:17.0) Gecko/20100101 Firefox/17.0
Accept-Language: zh-cn,en;q=0.5
Accept-Encoding: gzip, deflate
Connection: keep-alive
Referer: http://uptobox.com/?op=multi_upload
Cookie: login=shiedman; xfss=b0s1g8wp08mdlk4b
Content-Type: multipart/form-data; boundary=---------------------------28253686825547
Content-Length: 2019

-----------------------------28253686825547
Content-Disposition: form-data; name="upload_type"

file
-----------------------------28253686825547
Content-Disposition: form-data; name="sess_id"

b0s1g8wp08mdlk4b
-----------------------------28253686825547
Content-Disposition: form-data; name="srv_tmp_url"

http://www11.uptobox.com/tmp
-----------------------------28253686825547
Content-Disposition: form-data; name="file_0"; filename="examples.zip"
Content-Type: application/zip

PK..
-----------------------------28253686825547
Content-Disposition: form-data; name="file_1"; filename=""
Content-Type: application/octet-stream


-----------------------------28253686825547
Content-Disposition: form-data; name="file_0_descr"

test
-----------------------------28253686825547
Content-Disposition: form-data; name="tos"

1
-----------------------------28253686825547
Content-Disposition: form-data; name="submit_btn"


-----------------------------28253686825547--

*/
