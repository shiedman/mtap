var fs=require('fs'),
    http=require('http'),
    urlparse=require('url').parse,
    util=require('util'),
    path=require('path');

var multipart=require('./multipart.js'),
    httptask=require('./httptask.js');

var uploadRequest={
    url:null,
    headers:null,
    time:Date.now()
}
var commitRequest={
    url:null,
    headers:null,
    time:Date.now()
}
function logRequest(request,response,next){
    if(request.method!='POST')return next();
    var isUpload=request.url.indexOf('pcs.baidu.com/rest/2.0/pcs/file?method=upload')>=0;
    if(isUpload){
        var headers={};
        for (var k in request.headers){
            headers[k]=request.headers[k];
        }
        delete headers['accept-encoding'];//don't receive gzip,deflate data
        delete headers['proxy-connection'];
        uploadRequest.headers=headers;
        uploadRequest.url=request.url;
        uploadRequest.time=Date.now();
        console.dir(uploadRequest);
        //fs.appendFileSync('baidu_upload.txt',JSON.stringify(uploadRequest));
    }
    var isCommit= request.url.indexOf('pan.baidu.com/api/create?a=commit')>0;
    if(isCommit){
        var headers={};
        for (var k in request.headers){
            headers[k]=request.headers[k];
        }
        delete headers['accept-encoding'];
        delete headers['proxy-connection'];
        commitRequest.headers=headers;
        commitRequest.url=request.url;
        commitRequest.time=Date.now();
        //fs.appendFileSync('baidu_commit.txt',JSON.stringify(commitRequest));
    }
    return next();
}
function upload(filepath){
    filepath=path.normalize(filepath);
    if(!fs.existsSync(filepath)){
        var err=new Error('Not exists:'+filepath);
        console.error(err);
        throw err;
    }
    if(!uploadRequest.headers || !commitRequest.headers){
        var err=new Error('You are not prepared for upload');
        console.error(err);
        throw err;
    }
    if(Date.now()-uploadRequest.time>86400000){
        var err=new Error('Session are out of time');
        console.error(err);
        throw err;
    }
    if(httptask.isPending(filepath)){
        var err=new Error(filepath+' is uploading');
        console.error(err);
        throw err;
    }

    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var task=new httptask.Task(null,filepath,filesize);

    function commit(md5){
        var payload='path=%2F{filename}&isdir=0&size={size}&block_list=%5B%22{md5}%22%5D&method=post'.replace('{filename}',filename).replace('{size}',filesize).replace('{md5}',md5);
        payload=new Buffer(payload);
        var url=urlparse(commitRequest.url);
        var headers=commitRequest.headers;
        headers['content-length']=payload.length;
        headers['connection']='close';
        var options={
            hostname:url.hostname,
            port:url.port||80,
            method:'POST',
            path:url.path,
            headers:headers
        };
        var request=http.request(options,function(res){
            if (res.statusCode>=500){
                console.error('[upload]failed: http status is '+res.statusCode);
                task.status=-3;
            }else{
                util.log('[upload]response: '+res.statusCode+' ==>'+filename);
                res.on('data',function(chunk){
                    console.log('data:'+chunk.toString());
                    var cfg=JSON.parse(chunk.toString());
                    console.log(cfg);
                    if(cfg.errno!=0)task.status=-3;
                });
            }
        });
        request.end(payload);
    }

    var data={
        Filename:filename,
        FILE:{name:'Filedata',filepath:filepath},
        Upload:'Submit Query'
    }
    var req=multipart.post(uploadRequest.url,data,uploadRequest.headers,
        function(err,res){
            if(err){task.status=-3;console.error('[upload]error:'+err.message);return;}
            util.log('[upload]response: '+res.statusCode+' ==>'+filename);
            if(res.statusCode!=200){
                util.log('[upload]error:'+util.inspect(res.headers));
                return;
            }
            res.on('data',function(chunk){
                console.log('data:'+chunk.toString());
                var cfg=JSON.parse(chunk.toString());
                console.log(cfg);
                md5=cfg.md5;
                commit();
            });

        },
        function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
    uploadRequest.time=Date.now();

}
exports.logRequest=logRequest;
exports.upload=upload;
if(false){
    var s=fs.readFileSync('baidu_upload.txt','utf-8');
    uploadRequest=JSON.parse(s);

    //console.log(uploadRequest);
    s=fs.readFileSync('baidu_commit.txt','utf-8');
    commitRequest=JSON.parse(s);
    //console.log(commitRequest);


    //upload('d:/downloads/examples.zip');
    upload('d:/downloads/CDs__魔法少女まどか☆マギカ OP テーマ-コネクト／ClariS__CDImage.cue');
}
