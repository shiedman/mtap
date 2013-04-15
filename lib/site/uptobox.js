var fs=require('fs'),
    path=require('path'),
    qs=require('querystring'),
    util=require('util');

var httptask=require('../httptask.js'),
    multipart=require('../multipart.js'),
    request=require('../myrequest.js'),
    ut=require('../utility.js'),
    logger=ut.logger;
request=request.defaults({
    encoding:'utf-8',
    followAllRedirects:true, //follow redirect even if POST
    headers:{'Referer':'http://uptobox.com/'}
});
function Site(username,password){
    this.username=username;
    this.password=password;
    if(!this.password){ throw('No password setted'); }
}
util.inherits(Site,require('events').EventEmitter);
Site.prototype.login=function(){
    var username=this.username,password=this.password;
    var url='http://uptobox.com/';
    var self=this;
    request(url,function(err,res,data){
        if(err)return logger.warn(err);
        if(data&&data.search(/name="sess_id"\s+value="[^"]+"/)>0){
            return self.emit('login',data);
        }
        var form={ 
            op:'login', redirect:'http://uptobox.com/',
            login:username, password:password,
            x:1, y:15
        }
        request.post(url,{form:form},function(err,res,data){
            if(err)return logger.warn(err);
            if(data&&data.search(/name="sess_id"\s+value="[^"]+"/)>0){
                return self.emit('login',data);
            }else{
                logger.warn('[uptobox]%s login failed',username);
            }
        });
    });
};
Site.prototype.file_upload=function(filename,html){
    var self=this;
    jquery(html,function($){
        var action=$('#div_file>form').attr('action');
        var cfg={};
        $('#div_file input').each(function(){
            if(this.name){cfg[this.name]=this.value;}
        });
        var UID='';
        for(var i=0;i<12;i++) UID+=''+Math.floor(Math.random() * 10);
        var url = cfg['srv_tmp_url']+'/status.html?'+UID+'='+encodeURIComponent(filename)+'=uptobox.com/';
        request(url,function(err,res){
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
Site.prototype.remote_url_upload=function(filecode,html){
    var self=this;
    jquery(html,function($){
        var action=$('#div_url>form').attr('action');
        var cfg={};
        $('#div_url input').each(function(){ if(this.name){cfg[this.name]=this.value;} });
        var UID='';
        for(var i=0;i<12;i++) UID+=''+Math.floor(Math.random() * 10);
        var tmp_url = cfg['srv_tmp_url']+'/status.html?'+UID+'='+encodeURIComponent(filecode)+'=uptobox.com/';
        var upload_url=action+UID+'&js_on=1&utype=reg&upload_type=url';
        self.emit('ready',tmp_url,upload_url,cfg);
    });
}
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
        file_0:{path:filepath},
        file_0_descr:'', tos:1, submit_btn:''
    }
    var task=new httptask.Task(filepath,filesize,2,function(){
        upload(filepath);
    });
    var req=multipart.post(cfg.upload_url,payload,headers,
        function(err,res){
            if(err){
                return logger.error('[upload]error:%s',err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){ task.update(data.length);}
    );
    task.on('abort',function(){req.abort();});
    //task.resumable=false;
};
var jsdom;
function jquery(html,callback){
    if(!jsdom)jsdom=require('jsdom');
    jsdom.env(html,["http://code.jquery.com/jquery.min.js"],function(err,window){
        if(err){
            logger.error('jquery error:%j',err);
        }else{
            callback(window.$);
        }
    });
}
function download(url){
    var request=require('../myrequest').defaults({
        encoding:'utf-8',
        headers:{'Referer':url}
    });
    var evt=new (require('events').EventEmitter)();
    request(url,function(err,res,body){
        process.nextTick(function(){
            jquery(body,function($){
                var form={};
                $('form input').each(function(){
                    if(this.name)form[this.name]=this.value;
                });
                delete form['method_premium'];
                evt.emit('step1',form);
            });
        });
    });
    evt.once('step1',function(form){
        //click free download button
        request.post(url,{form:form},function(err,res,body){
            jquery(body,function($){
                fs.writeFile('download1.html',body);
                //wait x seconds
                var counter=parseInt($('#countdown_str span').text().trim());
                if(!counter){
                    var msg=$('form div.middle-content').text();
                    return logger.error('counter not found:%s',msg);
                }
                //server generated code
                var codes=[];
                //<tr>  <td><div> spans </div></td>  <td><input class='captcha_code'></td> </tr>
                $('input.captcha_code').closest('td').prev().children().children().each(function(){
                    codes.push({pos:parseInt($(this).css('paddingLeft')),num:$(this).text().trim()});
                });
                if(codes.length==0){
                    return logger.error('code not found');
                }
                codes.sort(function(a,b){return a.pos-b.pos});
                var code='';
                codes.forEach(function(c){code+=c.num;});
                var payload={};
                $('form input').each(function(){
                    if(this.name)payload[this.name]=this.value;
                });
                payload['code']=code;
                delete payload['method_free'];
                payload=qs.stringify(payload);
                payload+='&method_free=Free+Download';
                if(counter>300){return logger.warn('give up download %s, wait %ss',url,counter);}
                logger.info('waiting for %ss',counter);
                setTimeout(function(){
                    evt.emit('step2',payload);
                },(counter+5)*1000);
            });
        });
    });
    evt.once('step2',function(payload){
        //enter generated code
        request.post(url,{body:payload},function(err,res,body){
            //got download link
            fs.writeFile('download2.html',body);
            logger.log('step2 payload:%s',payload);
            jquery(body,function($){
                var download_link=$('a:contains("download")')[0];//.href
                if(download_link){
                    evt.emit('final',download_link.href);
                }else{
                    logger.error('download link not found');
                }
            });
        }).headers['Content-Type']='application/x-www-form-urlencoded';
    });
    evt.once('final',function(download_link){
        logger.info('[uptobox]begin to download : %s',download_link);
        require('../proxy.js').download(download_link);
    });
}

function upload(filepath){
    var info=ut.ini.param('uptobox.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Site(info.name,info.pass);
    up.login();
    up.on('login',function(html){
        up.file_upload(path.basename(filepath),html);
    });
    up.on('ready',function(cfg){
        if(!cfg){return logger.warn('cfg is empty');}
        cfg['filepath']=filepath;
        up.upload(cfg);
    });
}

function remote_download(url){
    var info=ut.ini.param('uptobox.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    if(!url||!url.match(/^http:\/\/uptobox\.com\/[a-z0-9]+$/))throw new Error('not a uptobox download link:'+url);
    var m=url.match(/[a-z0-9]+$/);
    var filecode=m[0];
    var up=new Site(info.name,info.pass);
    up.login();
    up.on('login',function(html){
        up.remote_url_upload(filecode,html);
    });
    up.on('ready',function(tmp_url,upload_url,cfg){
        logger.info('tmp_url:%s',tmp_url);
        logger.info('upload_url:%s',upload_url);
        logger.info('form:%j',cfg);
        cfg['url_mass']=url;
        var r=request.post(upload_url,function(err,res,body){
            jquery(body,function($){
                if($('textarea[name=st]').text().trim()=='OK'){
                    var fn=$('textarea[name=fn]').text().trim();
                    if(fn==filecode){return logger.warn('upload failed:%s',body);}
                    up.emit('rename',fn);
                }else{
                    logger.warn('upload failed:%s',body);
                }
            });
        });
        var form=r.form();
        for(var k in cfg){form.append(k,cfg[k]);}
        r.setHeader('Content-Length',form.getLengthSync());

        request(tmp_url,function(err,res,body){
            if(err){return logger.warn(err);}
            if(res.statusCode==200 && body.indexOf('convertSeconds')>0){
                logger.info('upload status: ready');
            }else{
                logger.warn('failed:%s',tmp_url);
            }
        });
    });
    up.on('rename',function(fn){
        request(url,function(err,res,body){
            jquery(body,function($){
                var title=$('div.page-top').text();
                var filename=title.replace('Download File','').trim();
                if(filename.length==Buffer.byteLength(filename))return;
                //filename contains non-ascii chars
                var rename_url='http://uptobox.com/?op=file_edit&file_code='+fn;
                var payload={
                    op:'file_edit',file_code:fn,
                    file_name:filename,file_descr:'', file_password:'',
                    save:' Submit '
                };
                logger.log(rename_url);
                logger.log(payload);
                request.post(rename_url,{form:payload},function(err,res,body){
                    if(body.indexOf(filename.substring(0,40))>0){
                        logger.info('rename success: %s',filename);
                    }else{
                        logger.warn('rename failed: %s',filename);
                    }
                });
            });
        });
    });
}

exports.upload=upload;
exports.remote_download=remote_download;
exports.download=download;
if(0){
    console.log(__filename);
    ut.ini.load();
    //upload(__filename);
    remote_download('http://uptobox.com/a91rf3c8pl2q');
    //urlupload('http://uptobox.com/8yv2yoeanrou');
    //download('http://uptobox.com/lvyqnkifm06g');
}
