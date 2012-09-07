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


//var aria2=new (require('./aria2.js').aria2)();
var ENDING='\r\n--%s\r\n'+
'Content-Disposition: form-data; name="Upload"\r\n\r\n'+
'Submit Query\r\n--%s--';

var DOWNLOAD_SIZE=10*1000000;
var DOWNLOAD_DIR='d:/downloads/';
var UPLOAD_DIR='d:/home/doujin/';
if (process.env.PORT_PROXY){
    DOWNLOAD_DIR='/home/dotcloud/data/tmp/';
    UPLOAD_DIR='/home/dotcloud/data/upload/';
    DOWNLOAD_SIZE=10000000;
}


exports.version='0.1';
var uploading=false;

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
    //task.resumable=('bytes'==headers['accept-ranges']);
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
    var msg='#'+filename+'\n';
    msg+=url.href+'\n';
    for(var k in headers){
        msg+='  --header='+k+':'+headers[k]+'\n';
    }
    return new Buffer(msg);
};

// xunlei fangzhou upload deprecated
/**
exports.upload=function(request,response,next){
    if(request.method!='POST')return next();
    //var commitFile=request.url.indexOf('svr.f.xunlei.com/file/commit')>0;
    if(uploading&&request.url.indexOf('xunlei.com')>0){
        request.pause();
        setTimeout(function(){request.connection.destroy();},10000);
        util.log('[uploading]block any action sending to xunlei:'+request.url);
        return;
    }
    var addFile=request.url.indexOf('svr.f.xunlei.com/file/addFile')>0;
    if(addFile){
    var data=null;
    request.on('data', function(chunk) {
            data=chunk.toString();
            var m=data.match(/&path=([^&]+)/);
            if(!m)return false;
            var filename=decodeURIComponent(m[1]).split('/').pop();
            var stat=fs.statSync(UPLOAD_DIR+filename);
            data=data.replace(/&size=\d+/,'&size='+stat.size);
            data=new Buffer(data);
    });
	var reqURL=urlparse(request.url);
    var options={
        hostname:reqURL['hostname'],
        port:reqURL['port']||80,
        path:reqURL['path'],
        method:request.method,
        headers:request.headers
    };
    request.on('end', function() {
        request.headers['content-length']=data.length;
        var proxy_request = http.request(options,function(proxy_response){
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
            proxy_response.pipe(response);
        });
        proxy_request.end(data);

    });
    return;
    }
    var upload= request.url.indexOf('walkbox.vip.xunlei.com/web_upload')>0;
    if(!upload)return next();
    
    var reqURL=urlparse(request.url);
    var options={
        hostname:reqURL['hostname'],
        port:reqURL['port']||80,
        path:reqURL['path'],
        method:request.method,
        headers:request.headers
    };
    request.on('data', function upload_data(buf) {
        //after received first chunk,destroy connection caz no use of it
        request.pause();
        setTimeout(function(){request.connection.destroy();},10000);
        //parse data
        var chunk=buf.toString('binary');
        var i=chunk.indexOf('/octet-stream\r\n\r\n');
        if(i<0)return;//!!!!!!
        var part1=chunk.substring(0,i+'/octet-stream\r\n\r\n'.length);
        var m=part1.match(/"Filename"\r\n\r\n(.+)\r\n--/i);
        var filename=new Buffer(m[1],'binary').toString();
        var stat=fs.statSync(UPLOAD_DIR+filename);

        part1=part1.replace(/size_0=\d+/g,'size_0='+stat.size);
        var content_type=request.headers['content-type'];
        m=content_type.match(/boundary=(.+)$/);
        var part2=util.format(ENDING,m[1],m[1]);

        request.headers['content-length']=part1.length+stat.size+part2.length
        util.log('[upload]start: '+filename);
        uploading=true;
        var xreq = http.request(options,function(xres){
            uploading=false;
            if(xres.statusCode==200){
                util.log('[upload]success:'+filename);
            }else{
                task.status=-2;
                util.error('[upload]failed:'+filename);
                util.error('\nHTTP/1.1 '+xres.statusCode
                    +'\n'+util.inspect(xres.headers))
            }
        });
        var task=new httptask.Task(null,UPLOAD_DIR+filename,stat.size);
        task.resumable=false;
        task.getStatus=function(){
            var msg='finish';
            if(this.status<0)msg='abort';if(this.status>0)msg='upload';
            if(this.status==-2)msg='failed';
            return msg;
        };
        //tasklist.push(task);
        var file=fs.createReadStream(UPLOAD_DIR+filename);
        xreq.write(part1);
        file.on('data',function(data){
            if(!xreq.write(data)){file.pause();}
            task.update(data.length);
        });
        file.on('end',function(){
            xreq.end(part2);
            console.log('[upload]ended: '+filename);
            uploading=false;
        });
        file.on('error',function(err){
            util.error('[upload]error:'+filename+'\n    '+err);
            xreq.abort();
            uploading=false;
        });
        xreq.on('drain',function(){ file.resume(); });
        request.removeListener('data',upload_data);
    });

};
*/
