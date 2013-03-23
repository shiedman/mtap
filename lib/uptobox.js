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
    self.http.get(url,function(err,res){
        if(err)return logger.warn(err);
        var data=res.content||'';
        if(data.search(/name="sess_id"\s+value="[^"]+"/)>0){
            return self.emit('login',data);
        }
        delete self.http.cookiejar.store.idx['uptobox.com']
        var payload=qs.stringify({ 
            op:'login',
            redirect:'http://uptobox.com/',
            login:username,
            password:password,
            x:1, y:15
        });
        self.http.post(url,payload,{'Referer':'http://uptobox.com/login.html'},function(err,res){
            if(err)return logger.warn(err);
            var data=res.content||'';
            if(data.search(/name="sess_id"\s+value="[^"]+"/)>0){
                return self.emit('login',data);
            }else{
                logger.warn('[uptobox]%s login failed',username);
            }
        });
    });
};
Site.prototype.multi_upload=function(filename,data){
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
    var url = cfg['srv_tmp_url']+'/status.html?'+UID+'='+encodeURIComponent(filename)+'=uptobox.com/';
    var self=this;
    self.http.get(url,function(err,res){
        if(err){return logger.warn(err);}
        if(res.statusCode==200){
            cfg['upload_url']=action+UID+'&js_on=1&utype=reg&upload_type=file';
            self.emit('ready',cfg);
        }else{
            logger.warn('failed:%s',url);
        }
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
    var task=new httptask.Task(filepath,filesize,2,function(){
        upload(filepath);
    });
    var req=multipart.post(cfg.upload_url,payload,headers,
        function(err,res){
            if(err){
                //task.status=-3;//not set status, need to retry upload
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
    var http=new HttpClient(true),evt=new (require('events').EventEmitter)();
    http.encoding='utf-8';
    http.referer=url;
    http.get(url,function(err,res){
        process.nextTick(function(){
            jquery(res.content,function($){
                var payload={};
                $('form input').each(function(){
                    if(this.name)payload[this.name]=this.value;
                });
                delete payload['method_premium'];
                evt.emit('step1',qs.stringify(payload));
            });
        });
    });
    evt.once('step1',function(payload){
        //click free download button
        http.post(url,payload,function(err,res){
            jquery(res.content,function($){
                fs.writeFile('download1.html',res.content);
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
        http.post(url,payload,function(err,res){
            //got download link
            //http.cookiejar.getCookies(url,function(err,cookies){
                //if(err)return logger.warn(err);
                //console.log(cookies);
            //});
            fs.writeFile('download2.html',res.content);
            console.log('step2 payload:%s',payload);
            jquery(res.content,function($){
                var download_link=$('a:contains("download")')[0];//.href
                if(download_link){
                    evt.emit('final',download_link.href);
                }else{
                    logger.error('download link not found');
                }
            });
        });
    });
    evt.once('final',function(download_link){
        logger.info('[uptobox]begin to download : %s',download_link);
        require('./proxy.js').download({url:download_link});
    });
}

function upload(filepath){
    var info=ut.ini.param('uptobox.com');
    if(!info.name||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Site(info.name,info.pass);
    up.on('login',function(html){
        up.multi_upload(path.basename(filepath),html);
    });
    up.on('ready',function(cfg){
        if(!cfg){return logger.warn('cfg is empty');}
        cfg['filepath']=filepath;
        up.upload(cfg);
    });
    up.login();

}

exports.upload=upload;
exports.download=download;
if(false){
    console.log(__filename);
    //ut.ini.load();
    //upload('uptobox.js');
    download('http://uptobox.com/lvyqnkifm06g');
}
