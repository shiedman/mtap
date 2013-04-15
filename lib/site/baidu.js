/**
 * baidu login become more and more ugly
 */

var fs=require('fs'),
    http=require('http'),
    urlparse=require('url').parse,
    qs=require('querystring'),
    util=require('util'),
    path=require('path');

var httptask=require('../httptask.js'),
    multipart=require('../multipart.js'),
    request=require('../myrequest'),
    ut=require('../utility.js'),
    logger=ut.logger;

request=request.defaults({
    encoding:'utf-8',
    headers:{'Referer':'http://pan.baidu.com/'}
});
function Site(username,password){
    this.username=username,this.password=password;
    this.loginTime=Date.now();
}

util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var homepage='http://pan.baidu.com/';
    var self=this;
    var jar=request.defaultJar();
    var BDUSS=jar.getCookie(homepage,'BDUSS');
    if(BDUSS)
        return process.nextTick(function(){self.emit('login',BDUSS.value);});

    request(homepage,function(err,res,body){
        if(err||res.statusCode!=200){
            return logger.error('error:%s\r\ncontent:%s',err,body);
        }
        var url=util.format('https://passport.baidu.com/v2/api/?getapi&tpl=netdisk&apiver=v3&tt=%s&class=login&callback=bd__cbs__s9fsy0',Date.now());
        request(url,function(err,res,body){
            if(err||res.statusCode!=200){
                return logger.error('error:%s\r\ncontent:%s',err,body);
            }
            //bdPass.api.params.login_token='cb56d0c95f44c4c0511f19f14e516bb9';
            var m=body.match(/bd__cbs__s9fsy0\((.+)\)/);
            if(!m)return logger.error(body);
            try{
                var j=JSON.parse(m[1]);
                var token=j.data.token;
                self._login(j.data.token);
            }catch(err){
                logger.error(err);
            }
        });
    });
};
Site.prototype._login=function(token){
    if(!token)return logger.error('token is emtpy');
    var url='https://passport.baidu.com/v2/api/?login';
    var form={
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
    };
    var self=this;
    request.post(url,{form:form},function(err,res,data){
        var bduss=request.defaultJar().getCookie(url,'BDUSS');
        if(!bduss)return logger.warn('login failed, bduss cookie not found');
        var s='encodeURI(',i=data.indexOf(s),j=data.indexOf(data[i+s.length],i+s.length+1);
        if(i<0||j<0)return logger.error(data);
        var redirect=encodeURI(data.substring(i+s.length+1,j));
        request(redirect,function(err,res,body){
            if(err)return logger.error(err);
            if(res.statusCode==200){
                self.emit('login',bduss.value);
            }else{
                logger.warn(body);
            }
        });

    });
};

Site.prototype.commit=function(filename,filesize,filemd5){
    var payload={
        path:'/'+filename,isdir:0,
        size:filesize,
        block_list:JSON.stringify([filemd5]),
        method:'post'
    };

    var url='http://pan.baidu.com/api/create?a=commit&channel=chunlei&clienttype=0&web=1';
    var headers={
        'X-Requested-With':'XMLHttpRequest',
        'Referer':'http://pan.baidu.com/disk/home'
    };
    var options={
        form:payload,
        headers:headers
    }
    request.post(url,options,function(err,res,body){
        if(err)return logger.error(err);
        if(res.statusCode!=200)return logger.warn(body);
        var rtn=JSON.parse(body);
        if(rtn.errno==0){
            logger.info('[baidu.upload]success ==> %s',filename);
        }else{
            logger.warn(body);
        }
    });
};
Site.prototype.upload=function(filepath,BDUSS){
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var url='http://pcs.baidu.com/rest/2.0/pcs/file?method=upload&type=tmpfile&app_id=250528&BDUSS='+BDUSS;
    var payload={
        Filename:filename,
        Filedata:{path:filepath},
        Upload:'Submit Query'
    }
    var self=this;
    var task=new httptask.Task(filepath,filesize,2,function(){
        upload(filepath);
    });
    var req=multipart.post(url,payload,{'User-Agent':'Shockwave Flash'},
        function(err,res){
            if(err){
                //task.status=-3;
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
        ,function(data){ task.update(data.length);}
    );
    task.on('abort',function(){req.abort();});
    //task.resumable=false;
};
function upload(filepath){
    var info=ut.ini.param('pan.baidu.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var site=new Site(info.name,info.pass);
    site.login();
    site.on('login',function(bduss){
        if(bduss){
            site.upload(filepath,bduss);
        }else{
            logger.warn('BDUSS not found in cookie, have logined?');
        }
    });
}
exports.upload=upload;
if(false){
    console.log(__filename);
    ut.ini.load();
    upload(__filename);
}
