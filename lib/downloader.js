/*
 ** shiedman (shiedman@gmail.com)
 ** download file
 */
var http = require('http'),
    fs   = require('fs'),
    path=require('path'),
    urlparse  = require('url').parse;

var httptask=require('./httptask.js'),
    ut=require('./utility.js'),
    logger=ut.logger,
    aria2=ut.aria2;

var DOWNLOAD_DIR=ut.env.DOWNLOAD_DIR;
function handle(request,response,href,reqHeaders,filename){
    var resHeaders=response.headers;
    var fileSize=parseInt(resHeaders['content-length'])
    var url=urlparse(href);
    if(!filename){
        var __pathname=url.pathname.replace(/\/$/,'');
        filename=__pathname.split('/').pop();
        try{filename=decodeURIComponent(filename);}catch(err){}
    }
    var filepath=path.join(DOWNLOAD_DIR,filename);
    if(httptask.isdownloading(filepath))return {};
    var file=fs.createWriteStream(filepath);
    var retries=url.hostname.indexOf('.xunlei.')>0?50:5;
    var task=new httptask.Task(filepath,fileSize,1,resume(href,reqHeaders,filepath),retries);
    //task.resumable=('bytes'==headers['accept-ranges']);not all of server send such
    task.status=1;

    task.on('abort',function(){ request.abort(); });
    response.on('data', function(chunk) {
        file.write(chunk);
        task.update(chunk.length);
    });
    response.on('end', function() {
        task.end();
        file.end();file=null;
        logger.info('download ended: %s',url.href);
        request.removeAllListeners();
        response.removeAllListeners();
    });
    response.on('close',function(err){
        if(file){file.end();}
        logger.error('remote server closed: %s\n\t%s',url.href,err||'');
        request.removeAllListeners();
        response.removeAllListeners();
    });

    logger.log('download started: %s',url.href);
    var msg=url.href+'\r\n';
    msg+='  out='+filename+'\r\n';
    for(var k in reqHeaders){
        msg+='  header='+k+': '+reqHeaders[k]+'\r\n';
    }
    var _buf=new Buffer(msg+'\r\n\r\n');

    var headers=ut.capitalize(response.headers);
    //headers['Content-Type']='text/plain;charset=utf-8';
    var userAgent=(reqHeaders['user-agent']||'').toLowerCase();
    if(userAgent.indexOf('msie')>=0 || userAgent.indexOf('chrome')>=0){
        headers['Content-Disposition']='attachment; filename='+encodeURIComponent(filename+'.log');
    }else if(userAgent.indexOf('mozilla')>=0){
        headers['Content-Disposition']='attachment; filename*="utf8\'\''+encodeURIComponent(filename+'.log')+'"';
    } else{
        headers['Content-Disposition']='attachment; filename='+(filename+'.log');
    }
    headers['Content-Length']=_buf.length;
    headers['Cache-Control']='no-cache';

    fs.appendFile('download.log',_buf,function(err){if(err)console.error(err);});
    return {headers:headers,msg:_buf,filename:filename};
}
function resume(href,reqHeaders,filepath){
    return function(){
        logger.info('[task:%s][retry:%s]download:%s',this.id,this.retries,this.file.name);
        if(true)return download(href,reqHeaders,filepath,this);
        /*
        if(!process.env.PORT_PROXY)return download(href,reqHeaders,filepath,this);
        var arr=[]
        for(var k in reqHeaders){
            arr.push(k+': '+reqHeaders[k]);
        }
        aria2.addUri([href],{ 'out':this.file.name,'header':arr },function(err,res){
            if(err||res.error){
                logger.error('failed to add url to aria2: %s\n\t%j',href,err||res.error);
                download(href,reqHeaders,filepath,this);
            } else{
                logger.info('aria2c start download: %s',href);
                this.status=-2;
            }
        }.bind(this));
        */
    };
}
function download(href,headers,filepath,task){
    var _headers={};
    for(var k in headers){_headers[k]=headers[k];}
    headers=_headers;
    var fsize=0;
    if(fs.existsSync(filepath)){
        var fstat=fs.statSync(filepath);
        if(!fstat.isFile()){ return logger.info('%s is not file',filepath); }
        fsize=fstat.size;
    }
    var url=urlparse(href);
    var options={
        hostname:url['hostname'],
        path:url['path'],
        method:'GET',
        headers:ut.capitalize(headers),
    };
    if(url['port'])options.port=url['port'];
    verify(options,fsize,filepath,function(err,start){
        if(task){ task.status=1;}
        delete options.headers['Range'];
        if(err){
            return logger.info('http range verify failed:%j',err);
        }
        if(start>0){ options.headers['Range']='bytes='+start+'-'; }
        var req=http.request(options,function(res){
            if((start==0&&res.statusCode==200)||(start>0&&res.statusCode==206)){
                 logger.log('download start:%s',filepath);
            }else{
                 logger.info('bad response');
                 return req.abort();
            }
            var file_flags=start>0?'r+':'w';
            var fstream=fs.createWriteStream(filepath,{flags:file_flags,start:start});
            if(task){
                task.status=1;
                task.downloaded=start;
                task.info.time=Date.now();
                task.on('abort',function(){req.abort();});
            }
            res.on('data', function(chunk) {
                fstream.write(chunk);
                if(task)task.update(chunk.length);
            });
            res.on('end', function() {
                logger.log('download finished: %s',filepath);
                if(task)task.end();
                fstream.end();fstream=null;
                req.removeAllListeners();
                res.removeAllListeners();
            });
            res.on('close',function(){
                logger.log('download aborted: %s',filepath);
                if(fstream){fstream.end();}
                req.removeAllListeners();
                res.removeAllListeners();
            });
        });
        req.end();
    });
}
function verify(options,downloaded,filepath,callback){
    logger.log('verify:%s',filepath);
    if(downloaded<1024)return callback(null,0);
    var start=downloaded-1024;
    var fd=fs.openSync(filepath,'r');
    var verifyBuf=new Buffer(1024);
    var bytesRead=fs.readSync(fd,verifyBuf,0,1024,start);
    if(bytesRead!=1024){
        return callback('bytes readed less than 1024');
    }
    fs.close(fd);
    options.headers['Range']='bytes='+start+'-'+(start+1024-1);
    var req=http.request(options,function(res){
        var length=res.headers['content-length'];
        if(res.statusCode!=206){
            return callback('http status code must be 206, but server response with '+res.statusCode);
        }
        if(!length||parseInt(length)!=1024){
            return callback('content-length not match 1024');
        }
        var buflist=[];
        res.on('data',function(chunk){
            buflist.push(chunk);
        });
        res.on('end',function(){
            var buf=Buffer.concat(buflist);
            if(buf.length!=1024){
                return callback("buffer's length not match 1024");
            }
            for(var i = 0 ; i < buf.length ; i++){
                if(buf[i]!=verifyBuf[i]){
                    break;
                }
            }
            if (i==buf.length){
                callback(null,downloaded);
            }else{
                callback('file binary data not match the last download');
            }
            callback=null;
        });
        res.on('close',function(err){
            if(err){
                if(callback)callback(err);
            }
        });
    });
    req.end();
}
exports.handle=handle;
exports.download=download;
//exports.download=download;
if(false){
    var filepath='d:\\downloads\\demo.bin';
    var url='http://nodejs.org/dist/v0.8.20/node-v0.8.20.tar.gz';
    var headers={
'User-Agent': 'Mozilla/5.0 (Windows NT 5.1; rv:19.0) Gecko/20100101 Firefox/19.0',
Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
'Accept-Language': 'zh-cn,en;q=0.5',
'Accept-Encoding': 'gzip, deflate',
Referer: 'http://nodejs.org/download/'
    };
    //download(url,headers,filepath);
    logger.warn('err msg:%j',{a:1,b:2});
}
