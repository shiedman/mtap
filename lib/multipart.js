var http=require('http'),
    fs=require('fs'),
    path=require('path'),
    util=require('util'),
    mime=require('mime'),
    urlparse=require('url').parse;

var ut=require('./utility.js');
var boundary='----------cH2ae0GI3cH2Ef1cH2Ij5cH2gL6Ij5'
function F(key,value){
    return util.format('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n', boundary,key,value);
}
function nullcb(){}
function post(url,form,headers,res_callback,data_callback){
    if(typeof data_callback!='function')data_callback=nullcb
    var cache=[],buf=new Buffer(4000),i=0;
    for (var k in form){
        var value=form[k];
        if(value.path){
            var filename=path.basename(value.path);
            value.length=value.length||fs.statSync(value.path).size;
            i+=buf.write('--'+boundary+'\r\n',i);
            i+=buf.write(util.format('Content-Disposition: form-data; name="%s"; filename="%s"\r\n',k,filename),i);

            i+=buf.write(util.format('Content-Type: %s\r\n\r\n',mime.lookup(value.path)),i);
            cache.push(new Buffer(buf.slice(0,i)));
            cache.push(value);
            buf=new Buffer(400);
            i=0;
            i+=buf.write('\r\n',i);
        }else{
            i+=buf.write(F(k,form[k]),i);
        }
    }
    i+=buf.write('--'+boundary+'--',i);
    cache.push(buf.slice(0,i));

    headers=headers?ut.capitalize(headers):{}
    var totalLength=0;
    cache.forEach(function(e){totalLength+=e.length});
    headers['Content-Length']=totalLength;
    headers['Content-Type']='multipart/form-data; boundary='+boundary;
    if(!headers['Accept'])headers['Accept']='*/*';
    //headers['Connection']='close';
    var url=urlparse(url);
    var options={
        agent:false,
        hostname:url.hostname,
        method:'POST',
        path:url.path,
        headers:headers
    }
    if(url.port)options['port']=url.port;
    var req=http.request(options,function(res){
        if(res.statusCode>=500){
            util.error('[upload]failed');
            util.error('\nHTTP/1.1 '+res.statusCode+'\n'+util.inspect(res.headers))
            res_callback(new Error('[500]Server Error',null));
        }else{
            res_callback(null,res);
        }
    });
    var uploading=true,file;
    function send(value){
        if(value===undefined){req.end();uploading=false;return;}
        if(Buffer.isBuffer(value)){
            req.write(value);
            return send(cache.shift());
        }
        file=fs.createReadStream(value.path,{start:value.start||0});
        var paused=false;
        file.on('data',function(chunk){
            /** greatly reduce memory usage by converting to binary string**/
            if(!req.write(chunk.toString('binary'),'binary')){
                file.pause(); paused=true;
            }
            //if(!req.write(chunk)){ file.pause(); paused=true; }
            data_callback(chunk);
        });
        file.on('end',function(){
            console.log('file upload ended: '+filename);
            file.removeAllListeners();
            req.removeAllListeners('drain');
            file=null;
            send(cache.shift());
        });
        file.on('error',function(err){
            file.removeAllListeners();
            if(uploading){
                uploading=false;
                res_callback(err);
                req.removeAllListeners('drain');
                req.abort();
                file.destroy();
                file=null;
            }
        });
        req.on('drain',function(){ if(paused){ file.resume(); paused=false;}});
    }
    req.on('close',function(){
        if(uploading){
            uploading=false;
            res_callback(new Error('server closed unexpectly'));
        }
        if(file){file.destroy(); file.removeAllListeners();}
        req.removeAllListeners();
        data_callback=null;
        res_callback=null;
    });
    req.on('error',function(err){
        if(uploading){
            uploading=false;
            if(file){file.destroy(); file.removeAllListeners();}
            res_callback(err);
        }
    });
    send(cache.shift());
    return req;
}
exports.post=post;
