var crypto=require('crypto'),
    path=require('path'),
    fs=require('fs'),
    http=require('http'),
    urlparse=require('url').parse,
    util=require('util');
var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    ut=require('./utility.js'),
    logger=ut.logger;

URL_GET_TOKEN = 'http://openapi.vdisk.me/?m=auth&a=get_token'
URL_KEEP_TOKEN = 'http://openapi.vdisk.me/?m=user&a=keep_token'

var token=null;
var token_time=Date.now();
var timeout=10*60*1000;
var interval_id;
var keeped=0;

function retrieveToken(callback){
    var cfg=ut.ini.param('vdisk');
    if(!cfg){
        return logger.error('vdisk config is empty');
    }
    var time=Date.now();
    var msg=util.format("account=%s&appkey=%s&password=%s&time=%s",cfg.user,cfg.appkey,cfg.pass,time);
    //console.log('appsecret:%s',cfg.appsecret);
    //console.log('msg:%s',msg);
    var sig=crypto.createHmac('sha256',cfg.appsecret).update(msg).digest('hex');
    var params={
        'account':cfg.user,
        'password':cfg.pass,
        'time':time,
        'appkey':cfg.appkey,
        'app_type':'sinat',
        'signature':sig
    };
    _request(URL_GET_TOKEN,params,function(err,data){
        if(err){ logger.error(err);return; }
        try{

        var rs=JSON.parse(data);
        if(rs && rs['err_code']==0){
            token=rs['data']['token'];
            token_time=Date.now();
            logger.info('got token:%s',token);
            keeped=0;
            interval_id=setInterval(keepToken,timeout-60*1000);
            if(callback)callback();
        }

        }catch(e){console.error(e);}
    });
}

function keepToken(){
    if (!token)return;
    if(keeped>25)return clearInterval(interval_id);
    _request(URL_KEEP_TOKEN,{'token':token},function(err,data){
        if(!err)token_time=Date.now();
        console.log('refresh token: %s',token);
    });
    keeped++;
}

function _request(url,data,callback){
    url=urlparse(url);
    var headers={'Connection':'close','User-Agent':'Mozilla/5.0','Host':url.host};
    var options={
        hostname:url.hostname,
        port:url.port||80,
        path:url.path,
        method:data?'POST':'GET',
        headers:headers
    };
    if(data){
        var value='';
        for(var k in data){
            value+=k+'='+encodeURIComponent(data[k])+'&';
        }
        data=value.substring(0,value.length-1);
        headers['Content-Length']=data.length;
        headers['Content-Type']='application/x-www-form-urlencoded';
    }
    //console.dir(data);
    var req=http.request(options,function(res){
        if(!callback)return;
        var rs='';
        res.on('data',function(chunk){
            rs+=chunk.toString();
        });
        res.on('end',function(){
            callback(null,rs);
        });
    });
    req.on('error',function(err){
        if(callback)callback(err,null);
    });
    if(data)req.write(data);
    req.end();
}

function start_upload(filepath){
    if(!token || Date.now()-token_time>timeout){logger.info('token is invalid');return;}
    var filename=path.basename(filepath);
    var params={
        'token':token,
        'file_name':filename
    }
    multipart.post('http://openapi.vdisk.me/?m=file&a=upload_sign', params,null,function(err,res){
            if(err){
                logger.error(err);
                return;
            }
            if(res.statusCode!=200){
                logger.error('response status is %d',res.statusCode);
                return;
            }
            var rs='';
            res.on('data',function(chunk){
                rs+=chunk.toString();
            });
            res.on('end',function(){
                cfg=JSON.parse(rs);
                upload_file(cfg,filepath);
            });
    });
}

function upload_file(cfg,filepath){
    cfg['err_code']='1';
    cfg['success_action_status']='201';
    cfg['FILE']={'name':'file','filename':'.','filepath':filepath};
    var filesize=fs.statSync(filepath).size;
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post('http://upload.vdisk.me/',cfg,null,
        function(err,res){
            if(err){
                logger.error(err);return;
            }
            if(res.statusCode!=201){
                logger.error('response status is %d',res.statusCode);
                return;
            }
            var rs='';
            res.on('data',function(chunk){
                rs+=chunk.toString();
            });
            res.on('end',function(){
                end_upload(cfg.key,path.basename(filepath));
            }
            );

        },
        function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
}

function end_upload(key,filename){
    var params={
        'token':token,
        'dir_id':0,
        'file_name':filename,
        'key':key,
        'fover':'rename'
    };
    multipart.post('http://openapi.vdisk.me/?m=file&a=upload_back',params,null,function(err,res){
            if(err){
                logger.error(err);return;
            }
            res.on('data',function(chunk){
                console.log(chunk.toString());
                logger.log('upload done: %s',filename);
            });

    });
}
function upload(filepath){
    logger.log('uploading file: %s',filepath); 
    filepath=path.normalize(filepath);
    if(!token || Date.now()-token_time>=timeout){
        retrieveToken(function(){
            keeped=0;
            start_upload(filepath);
        });
    }else{
        keeped=0;
        start_upload(filepath);
    }
}
exports.upload=upload;
if(false){
    console.log(__filename);
    ut.Cookie.load();
    setTimeout(function(){
        console.log('executing...');
        try{
        upload('cookies.txt');
        }catch(err){
            console.log(err);
            console.log(err.stack);
        }
    },2000);
}
