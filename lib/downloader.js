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


var DOWNLOAD_SIZE=10*1000000;
var DOWNLOAD_DIR='d:/downloads/';
var UPLOAD_DIR='d:/home/doujin/';
if (process.env.PORT_PROXY){
    DOWNLOAD_DIR='/home/dotcloud/data/tmp/';
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
    msg+='  --out='+filename+'\n';
    for(var k in options.headers){
        msg+='  --header='+k+': '+options.headers[k]+'\n';
    }
    var _buf=new Buffer(msg+'\n\n');
    fs.appendFile('download.log',_buf,function(err){console.error(err);});
    return _buf;
};

