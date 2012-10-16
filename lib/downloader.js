/*
 ** shiedman (shiedman@gmail.com)
 **
 */
var http = require('http');
var events=require('events');
var util  = require('util');
var fs   = require('fs');
var path=require('path');
var urlparse  = require('url').parse;
var httptask=require('./httptask.js');

var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){}

var DOWNLOAD_SIZE=10*1000000;
var DOWNLOAD_DIR='d:/downloads/';
var UPLOAD_DIR='d:/home/doujin/';
if (process.env.PORT_PROXY){
    DOWNLOAD_DIR='/home/dotcloud/data/downloads/';
    UPLOAD_DIR='/home/dotcloud/data/upload/';
    DOWNLOAD_SIZE=10000000;
}

exports.handle=function(request,response){
    var headers=response.headers;
    var fileSize=parseInt(headers['content-length'])||-1;
    if (response.statusCode!=200 || fileSize<DOWNLOAD_SIZE)return false;

    var options=request.options;
    var url=urlparse(options.url);
    var filename=request.filename;
    if(!filename){
        var __pathname=url.pathname.replace(/\/$/,'');
        filename=__pathname.split('/').pop();
        try{filename=decodeURIComponent(filename);}catch(err){}
    }
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
        util.log('END  :'+url.href);
    });
    response.on('close',function(err){
        if(file){file.end();file=null;}
        util.log('CLOSE: '+url.href);
        if (err) util.error('ERROR:',err,'\n',url.href);
    });

    util.log('download:'+url.href);
    var msg=url.href+'\n';
    msg+='  out='+filename+'\n';
    for(var k in options.headers){
        msg+='  header='+k+': '+options.headers[k]+'\n';
    }
    var _buf=new Buffer(msg+'\n\n');
    fs.appendFile('download.log',_buf,function(err){if(err)console.error(err);});
    return _buf;
};

exports.detectFileName=function(proxy_request,chunk){
    //chunk starts with:HTTP/
    var ishttp=(process.env.PORT_PROXY && chunk && chunk.length>5
            && chunk[0]==0x48
            && chunk[1]==0x54
            && chunk[2]==0x54
            && chunk[3]==0x50
            && chunk[4]==0x2F);
    if(!ishttp)return;
    var i=0;
    for (;i<chunk.length-3;i++){
        //find http response head ends with \r\n\r\n
        if(chunk[i]==0x0d && chunk[i+1]==0x0a&&chunk[i+2]==0x0d&&chunk[i+3]==0x0a)break;
    }
    if(i>=chunk.length-3)return;
    proxy_request.filename=null;
    var head=chunk.toString('binary',0,i+2);
    //console.log('head:===========');
    //console.log(head);
    var s='filename=';
    var m=head.indexOf(s);
    if(m<0){s="filename*=\"utf-8''";m=head.indexOf(s);}
    if(m<0)return;
    m+=s.length;
    if(head[m]=='"')m++;
    var n=head.indexOf('\n',m);
    if(n<0||n==m)return;
    var filename=head.substring(m,n);
    //console.log('**filename=',filename);
    filename=filename.replace(/[";\s]+$/,'');
    if(Iconv){
        try{
            var iconv=new Iconv('GB18030','UTF-8');
            var buf= new Buffer(filename,'binary');
            filename=iconv.convert(buf).toString();
        }catch(err){
            console.error(err);
            filename=buf.toString();
        }
    }
    try{filename=decodeURIComponent(filename);}catch(err){}
    filename=filename.replace(/[";]+/g,'');
    //fs.appendFile('header',chunk.slice(0,i+4));
    proxy_request.filename=filename;
}
