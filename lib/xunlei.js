var http=require('http'),
    util=require('util'),
    fs=require('fs'),
    path=require('path'),
    urlparse=require('url').parse;

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    ut=require('./utilize.js');

function notify(res,msg){
    res.writeHead(500,{'Connection':'close','Content-Type':'text/plain','Content-Length':msg.length});
    res.end(msg);
}
//var uploading=false;
var addFileRequest={
    headers:null,
    payload:null,
    time:Date.now()
};
var webUploadRequest={
    headers:null,
    info:function(transactionid,nodeid,filesize){
        var cookies=this.headers['cookie'];
        var cfg={};
        cookies.split('; ').forEach(function (e){
            var arr=e.split('=');
            if (arr[1])cfg[arr[0]]=arr[1];
        });
        cfg['transactionid']=transactionid;
        cfg['nodeid']=nodeid;
        cfg['size']=filesize;
        var s="userid={userid};sessionid={sessionid};transactionid={transactionid};encrypttype=0;iscompress=0;keytype=0;chunksize_0={size};chunkseq_0=0;nodeid_0={nodeid};filesize_0={size};hash_0=0;";
        return s.format(cfg);
    },
    time:Date.now()
};
// xunlei fangzhou upload
var addfileURL='http://svr.f.xunlei.com/file/addFile?xltime=';
exports.logRequest=function(request,response,next){
    if(request.method!='POST')return next();
    var add=request.url.indexOf(addfileURL)>=0;
    if(add){
        var headers={};
        for (var k in request.headers){
            headers[k]=request.headers[k];
        }
        delete headers['accept-encoding'];//don't receive gzip,deflate data
        delete headers['proxy-connection'];
        addFileRequest.headers=headers;
        request.on('data',function(data){
            addFileRequest.payload=data.toString();
            addFileRequest.time=Date.now();
            //fs.writeFileSync('xunlei_add.txt',JSON.stringify(addFileRequest));
        });
        console.dir(addFileRequest);
    }
    var upload= request.url.indexOf('walkbox.vip.xunlei.com/web_upload')>0;
    if(upload){
        var headers={};
        for (var k in request.headers){
            headers[k]=request.headers[k];
        }
        delete headers['accept-encoding'];
        delete headers['proxy-connection'];
        webUploadRequest.headers=headers;
        webUploadRequest.time=Date.now();
        //fs.writeFileSync('xunlei_upload.txt',JSON.stringify(webUploadRequest));
    }
    return next();

};
exports.upload=function (filepath){
    filepath=path.normalize(filepath);
    if(!fs.existsSync(filepath)){
        var err=new Error('Not exists:'+filepath);
        console.error(err);
        throw err;
    }
    if(!addFileRequest.payload || !webUploadRequest.headers){
        var err=new Error('You are not prepared for upload');
        console.error(err);
        throw err;
    }
    if(Date.now()-webUploadRequest.time>86400000){
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

function uploadFile(cfg){
        var headers=webUploadRequest.headers;
        var data={
            Filename:filename,
            info:webUploadRequest.info(cfg._transaction_id,cfg._nodeid,filesize),
            FILE:{name:'info',filepath:filepath},
            Upload:'Submit Query'
        }
        var task=new httptask.Task(null,filepath,filesize);
        var req=multipart.post(cfg._upload_url,data,headers,
                function(err,res){
                    if(err){task.status=-3;console.error('[upload]error:'+err.message);return;}
                    util.log('[upload]response: '+res.statusCode+' ==>'+filename);

                },
                function(data){ task.update(data.length,2);}
        );
        task.on('abort',function(){req.abort();});
        task.resumable=false;
        webUploadRequest.time=Date.now();
}

    var requestType=Math.floor(Math.random()*10000000);
    var reqBody=addFileRequest.payload.replace(/requestType=\d+/,'requestType='+requestType)
        .replace(/path=%2F([^&]+)%2F[^&]+/,'path=%2F$1%2F'+encodeURIComponent(filename))
        .replace(/size=\d+/,'size='+filesize);
    var url=urlparse(addfileURL+requestType);
    var headers=addFileRequest.headers;
    headers['Content-Length']=reqBody.length;
    var options={
        hostname:url.hostname,
        port:url.port||80,
        method:'POST',
        path:url.path,
        headers:headers
    };
    //console.log(util.inspect(options));console.log(reqBody);return;
    var req=http.request(options,function(res){
        if (res.statusCode>=500){
            console.error('[upload]failed: http status is '+res.statusCode);
            return;
        }//oop!!!
        res.on('data',function addfile_res(buf){
            addFileRequest.time=Date.now();
            var data=decodeURIComponent(buf.toString());
            //util.log('addFile:'+data);
            var m=data.match(/rtnData=(.+)\)$/);
            if (!m){
                console.error('[upload]failed:'+filepath);
                console.error('    cause:'+data);
                return;
            }
            var cfg=JSON.parse(m[1]);
            if (cfg.rtn!=0){
                console.error('[upload]failed:'+filepath);
                console.error('    cause:'+data);
                return;
            }
            res.removeListener('data',addfile_res);
            uploadFile(cfg.data[0]);
        });
    });
    req.on('error',function(err){
        console.error('failed to connect server:'+err.message);
    });
    req.end(reqBody);
};
if(false){
    var s=fs.readFileSync('xunlei_add.txt','utf-8');
    addFileRequest=JSON.parse(s);

    s=fs.readFileSync('xunlei_upload.txt','utf-8');
    var t=JSON.parse(s);
    webUploadRequest.headers=t.headers;
    webUploadRequest.time=t.time;
    //console.log(webUploadRequest);
    //var b=fs.existsSync('[EAC] [120622] 境界線上のホライゾンドラマCD「極東エロゲ甲子園」[第1期Blu-rayアニメイト全巻購入特典CD] (ape+jpg).zip');
    //console.log(b);
    //console.log(util.inspect(addFileRequest));
    //console.log(util.inspect(webUploadRequest));
        //var task=new Task(null,'res.zip',12121);
        //console.log(task);
    exports.upload('d:/downloads/hyou20.avi');
}
