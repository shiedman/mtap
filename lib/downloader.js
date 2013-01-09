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

var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){}

var DOWNLOAD_DIR=ut.env.DOWNLOAD_DIR;

exports.handle=function(request,response,options){
    var headers=response.headers;
    var fileSize=parseInt(headers['content-length'])
    var url=urlparse(options.url);
    var filename=request.filename;
    if(!filename){
        var __pathname=url.pathname.replace(/\/$/,'');
        filename=__pathname.split('/').pop();
        try{filename=decodeURIComponent(filename);}catch(err){}
    }
    response.filename=filename;
    var filepath=path.join(DOWNLOAD_DIR,filename);
    if(httptask.isPending(filepath))return false;
    var file=fs.createWriteStream(filepath);
    var task=new httptask.Task(options,filepath,fileSize);
    //task.resumable=('bytes'==headers['accept-ranges']);not all sites send this header
    task.status=1;

    task.on('abort',function(){request.abort();});
    response.on('data', function(chunk) {
        file.write(chunk);
        task.update(chunk.length);
    });
    response.on('end', function() {
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
    fs.appendFile('download.log',_buf,function(err){if(err)console.error(err);});
    return _buf;
};
//dirty work to guest filename,thanks for the sucks charset of content-disposition
exports.detectFileName=function(proxy_request,chunk){
    //chunk starts with:HTTP/
    //var ishttp=(chunk && chunk.length>5
    var ishttp=(ut.env.PORT_WWW && chunk && chunk.length>5
            && chunk[0]==0x48
            && chunk[1]==0x54
            && chunk[2]==0x54
            && chunk[3]==0x50
            && chunk[4]==0x2F);
    if(!ishttp)return;
    for (var i=0;i<chunk.length-3;i++){
        //find http response head ends with \r\n\r\n
        if(chunk[i]==0x0d && chunk[i+1]==0x0a&&chunk[i+2]==0x0d&&chunk[i+3]==0x0a)break;
    }
    if(i>=chunk.length-3)return;
    proxy_request.filename=null;
    var head=chunk.toString('binary',0,i+2);
    var s='filename',i=head.indexOf(s);
    if(i<0)return;
    i+=s.length;
    var encoding=null,filename=null;
    if(head[i]=='='){
        var j=head.indexOf('\n',i),filename=head.substring(i+1,j);
        filename=filename.trim();
        filename=filename.replace(/^"|[";]+$/g,'');
        //rfc2047
        //filename==?UTF-8?B?dG90cmIucGFydDIucmFy?=
        var m=filename.match(/=\?(.+)\?B\?(.+)\?=/);
        if(m){
            encoding=m[1].toLowerCase();
            filename=new Buffer(m[2],'base64').toString('binary');
        }else{
            encoding='gb2312';//default encoding
        }
    }else if(head[i]=='*'&&head[i+1]=='='){
        var j=head.indexOf('\n',i),filename=head.substring(i+2,j);
        filename=filename.trim();
        filename=filename.replace(/^"|[";]+$/g,'');
        //rfc6266
        var m=filename.match(/utf-8'[^']*'(.+)/i);
        if(m){
            encoding='utf-8',filename=m[1];
        }
    }else{
        return;
    }
    if(encoding=='utf-8'){
        filename=new Buffer(filename,'binary').toString();
    }else if(encoding&&Iconv){
        try{
            var iconv = new Iconv(encoding, 'utf-8');
            var buf= new Buffer(filename,'binary');
            filename=iconv.convert(buf).toString();
        }catch(err){
            console.error('convert from %s to utf-8, error:%s\r\n%s',encoding,filename,err);
            filename=buf.toString();
        }
    }
    try{filename=decodeURIComponent(filename);}catch(err){}
    proxy_request.filename=filename;
}

