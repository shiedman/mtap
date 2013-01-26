var fs=require('fs'),
    http=require('http'),
    urlparse=require('url').parse,
    qs=require('querystring'),
    util=require('util'),
    path=require('path');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;


function Site(username,password,httpclient){
    this.username=username,this.password=password;
    this.http=httpclient||new HttpClient();
    this.http.encoding='utf-8';
    this.http.referer='http://pan.baidu.com/';
    this.loginTime=Date.now();
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var homepage='http://pan.baidu.com/';
    var self=this;
    self.http.cookiejar.getCookies(homepage,function(err,cookies){
        for(var i=0;i<cookies.length;i++){
            if(cookies[i].key=='BDUSS'){
                return self.emit('login',cookies[i].value);
            }
        }
        self.takeToken();
    });

};
Site.prototype.takeToken=function(){
    var username=this.username;
    var self=this;
    var homepage='http://pan.baidu.com/';
    self.http.get(homepage,function(err,res){
        if(err||res.statusCode!=200){return logger.error('error:%s\r\ncontent:%s',err,res&&res.content);}
        var m=res.content.match(/<script\s+src="(https:\/\/passport.baidu.com\/[^"]+)"/);
        if(!m)return logger.error(res.content);
        var url=m[1].replace(/&amp;/g,'&');
        self.http.get(url,function(err,res){
            if(err||res.statusCode!=200){return logger.error('error:%s\r\ncontent:%s',err,res&&res.content);}
            //bdPass.api.params.login_token='cb56d0c95f44c4c0511f19f14e516bb9';
            var m=res.content.match(/login_token='([^']+)'/);
            if(!m)return logger.error(res.content);
            var token=m[1];
            self._login(token);
        });
    });
    /**
    var url=util.format('http://passport.baidu.com/v2/api/?logincheck&callback=bdPass.api.login._needCodestringCheckCallback&tpl=pp&charset=UTF-8&index=0&username=%s&isphone=false&time=%s',username,Date.now());
    self.http.get(url,function(err,res){
        var data=res.content;
        var i=data.indexOf('({'),j=data.indexOf('})',i+2);
        if(i<0||j<0)return logger.error(data);
        var rtn=JSON.parse(data.substring(i+1,j+1));
        if(rtn.errno!=0)return logger.error(data);
        var url=util.format('http://passport.baidu.com/v2/api/?otherplacecheck&callback=bdPass.api.login._needOtherPlaceTipCallback&tpl=pp&index=0&username=%s&inputType=username&time=%s',username,Date.now());
        self.http.referer='http://pan.baidu.com/';
        self.http.get(url,function(err,res){
            var data=res.content;
            var i=data.indexOf('({'),j=data.indexOf('})',i+2);
            if(i<0||j<0)return logger.error(data);
            var rtn=JSON.parse(data.substring(i+1,j+1));
            if(rtn.errno!=0)return logger.error(data);
            self._login();
        });
    });
    **/
};
Site.prototype._login=function(token){
    var url='https://passport.baidu.com/v2/api/?login';
    var payload=qs.stringify({
        ppui_logintime:Date.now()-this.loginTime,
        charset:'UTF-8',codestring:'',
        token:token,
        isPhone:false,index:0,u:'',safeflg:0,
        staticpage:'http://pan.baidu.com/res/static/thirdparty/passportJump.html',
        loginType:1,tpl:'netdisk',
        callback:'parent.bdPass.api.login._postCallback',
        username:this.username,
        password:this.password,
        verifycode:'',mem_pass:'on'
    });
    var self=this;
    self.http.post(url,payload,function(err,res){
        var data=res.content;
        var s='encodeURI(',i=data.indexOf(s),j=data.indexOf(data[i+s.length],i+s.length+1);
        if(i<0||j<0)return logger.error(data);
        var redirect=encodeURI(data.substring(i+s.length+1,j));
        var bduss=res.cookie['BDUSS'];
        self.http.get(redirect,function(err,res){
            if(err)return logger.error(err);
            if(res.statusCode==200){
                self.emit('login',bduss);
            }else{
                logger.warn(res.content);
            }
        });

    });
};

Site.prototype.commit=function(filename,filesize,filemd5){
    var payload=qs.stringify({
        path:'/'+filename,isdir:0,
        size:filesize,
        block_list:JSON.stringify([filemd5]),
        method:'post'
    });

    var url='http://pan.baidu.com/api/create?a=commit&channel=chunlei&clienttype=0&web=1';
    var headers={
        'X-Requested-With':'XMLHttpRequest',
        'Referer':'http://pan.baidu.com/disk/home'
    };
    this.http.post(url,payload,headers,function(err,res){
        if(err)return logger.error(err);
        if(res.statusCode!=200)return logger.warn(res.content);
        var rtn=JSON.parse(res.content);
        if(rtn.errno==0){
            logger.info('[baidu.upload]success ==> %s',filename);
        }else{
            logger.warn(res.content);
        }
    });
};
Site.prototype.upload=function(filepath,BDUSS){
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var url='http://pcs.baidu.com/rest/2.0/pcs/file?method=upload&type=tmpfile&app_id=250528&BDUSS='+BDUSS;
    var payload={
        Filename:filename,
        FILE:{name:'Filedata',filepath:filepath},
        Upload:'Submit Query'
    }
    var self=this;
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post(url,payload,{'User-Agent':'Shockwave Flash'},
        function(err,res){
            if(err){
                task.status=-3;
                return logger.error('[upload]error:'+err.message);
            }
            if(res.statusCode!=200){
                return logger.warn('server resposne :%s',res.statusCode);
            }
            var content='';
            res.on('data',function(chunk){
                content+=chunk.toString();
            });
            res.on('end',function(){
                var rtn=JSON.parse(content);
                if(rtn.md5){
                    self.commit(filename,filesize,rtn.md5);
                }else{
                    logger.warn(content);
                }
            });

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};
function upload(filepath){
    var info=ut.ini.param('pan.baidu.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var site=new Site(info.name,info.pass);
    site.on('login',function(bduss){
        if(bduss){
            site.upload(filepath,bduss);
        }else{
            logger.warn('BDUSS not found in cookie, have logined?');
        }
    });
    site.login();
}
exports.upload=upload;
if(false){
    console.log(__filename);
    ut.ini.load();
    setTimeout(function(){
    upload('baidu.js');
    },2000);
}
