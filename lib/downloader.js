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
    logger=ut.logger;

var DOWNLOAD_DIR=ut.env.DOWNLOAD_DIR;

exports.handle=function(request,response,options,filename){
    var headers=response.headers;
    var fileSize=parseInt(headers['content-length'])
    var url=urlparse(options.url);
    if(!filename){
        var __pathname=url.pathname.replace(/\/$/,'');
        filename=__pathname.split('/').pop();
        try{filename=decodeURIComponent(filename);}catch(err){}
    }
    var filepath=path.join(DOWNLOAD_DIR,filename);
    if(httptask.isPending(filepath))return {};
    var file=fs.createWriteStream(filepath);
    var task=new httptask.Task(options,filepath,fileSize);
    //task.resumable=('bytes'==headers['accept-ranges']);not all sites send this header
    task.status=1;
    if(url.hostname.indexOf('.xunlei.')>0){
        //resources from xunlei is really **sucks**
        task.retries=50;
    }

    task.on('abort',function(){request.abort();});
    response.on('data', function(chunk) {
        file.write(chunk);
        task.update(chunk.length);
    });
    response.on('end', function() {
        task.end();
        file.end();file=null;
        logger.log('download ended: %s',url.href);
    });
    response.on('close',function(err){
        if(file){file.end();file=null;}
        logger.error('remote server closed: %s',url.href);
        if (err) logger.error('REASEON: %s',err.message);
    });

    logger.log('download started: %s',url.href);
    var msg=url.href+'\r\n';
    msg+='  out='+filename+'\r\n';
    for(var k in options.headers){
        msg+='  header='+k+': '+options.headers[k]+'\r\n';
    }
    var _buf=new Buffer(msg+'\r\n\r\n');

    var headers=ut.capitalize(response.headers);
    //headers['Content-Type']='text/plain;charset=utf-8';
    var userAgent=(options.headers['User-Agent']||'').toLowerCase();
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
};
function verify(options,downloaded,filePath,callback){
    if(downloaded<1024)return callback(null,0);
    var start=downloaded-1024;
    var fd=fs.openSync(filePath,'r');
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
function download(href,headers,filePath,httptask){
    var _headers={};
    for(var k in headers){_headers[k]=headers[k];}
    headers=_headers;
    var fsize=0,file_flags='w';
    if(fs.existsSync(filePath)){
        var fstat=fs.statSync(filePath);
        if(!fstat.isFile()){
            return console.info('%s is not file',filePath);
        }
        fsize=fstat.size;
        file_flags='r+';
    }
    var url=urlparse(href);
    var options={
        hostname:url['hostname'],
        path:url['path'],
        method:'GET',
        headers:ut.capitalize(headers),
    };
    if(url['port'])options.port=url['port'];
    verify(options,fsize,filePath,function(err,start){
        delete options.headers['Range'];
        if(err){
            console.info('http range verify failed');
            return console.info(err);
        }
        if(start>0){
            options.headers['Range']='bytes='+start+'-';
        }
        var req=http.request(options,function(res){
            if((start==0&&res.statusCode==200)||(start>0&&res.statusCode==206)){
                console.log('download start');
            }else{
                 console.info('bad response');
                 return req.abort();
            }
            var fstream=fs.createWriteStream(filePath,{flags:file_flags,start:start});
            if(httptask){
                httptask.status=1;
                httptask.downloaded=start;
                httptask.info.time=Date.now();
                httptask.on('abort',function(){req.abort();});
            }
            res.on('data', function(chunk) {
                fstream.write(chunk);
                if(httptask)httptask.update(chunk.length);
            });
            res.on('end', function() {
                console.log('download finished');
                if(httptask)httptask.end();
                fstream.end();fstream=null;
            });
            res.on('close',function(err){
                console.log('download aborted');
                if(fstream){fstream.end();}
                if (err) console.error('REASEON: %s',err.message);
            });
        });
        req.end();
    });
}
exports.download=download;
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
    download(url,headers,filepath);
}
