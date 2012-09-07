var http=require('http'),
    fs=require('fs'),
    path=require('path'),
    util=require('util'),
    urlparse=require('url').parse;

var ut=require('./utilize.js');
var boundary='----------cH2ae0GI3cH2Ef1cH2Ij5cH2gL6Ij5'
function F(key,value){
    return util.format('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n', boundary,key,value);
}

function request(url,data,headers,res_callback,data_callback){
    var url=urlparse(url);
    var buf=new Buffer(4000);
    var i=0;
    var part1,part2,filepath,filename;
    for (var k in data){
        var value=data[k];
        if(value.name && value.filepath){
            filepath=path.normalize(value.filepath);
            filename=path.basename(filepath);
            i+=buf.write('--'+boundary+'\r\n',i);
            i+=buf.write(util.format('Content-Disposition: form-data; name="%s"; filename="%s"\r\n',value.name,filename),i);
            i+=buf.write('Content-Type: application/octet-stream\r\n\r\n',i);
            part1=new Buffer(buf.slice(0,i));i=0;
            i+=buf.write('\r\n',i);
        }else{
            i+=buf.write(F(k,data[k]),i);
        }
    }
    i+=buf.write('--'+boundary+'--',i);
    part2=buf.slice(0,i);
    var fstat=fs.statSync(filepath);
    headers['content-length']=part1.length+fstat.size+part2.length;
    headers['content-type']='multipart/form-data; boundary='+boundary;
    headers['host']=url.host;
    //headers['connection']='close';
    var options={
        hostname:url.hostname,
        port:url.port||80,
        method:'POST',
        path:url.path,
        headers:ut.capitalize(headers)
    }
    var req=http.request(options,function(res){
        if(res.statusCode>=500){
            req.abort();
            util.error('[upload]failed:'+filename);
            util.error('\nHTTP/1.1 '+res.statusCode+'\n'+util.inspect(res.headers))
            res_callback(new Error('[500]Server Error',null));
        }else{
            res_callback(null,res);
        }
    });
    var file=fs.createReadStream(filepath);
    req.write(part1);
    var uploading=true;
    file.on('data',function(data){
        if(!req.write(data)){file.pause();}
        if(data_callback)data_callback(data);
    });
    file.on('end',function(){
        uploading=false;
        //req.end(part2+'\r\n');
        req.end(part2);
        console.log('[upload]ended: '+filename);
    });
    file.on('error',function(err){
        if(uploading){
            res_callback(err);
            req.abort();
            file.destroy();
            uploading=false;
        }
    });
    req.on('close',function(){
        if(uploading){
            file.destroy();
            res_callback(new Error('server closed'));
            uploading=false;
        }
    });
    req.on('error',function(err){
        if(uploading){
            res_callback(err);
            req.abort();
            file.destroy();
            uploading=false;
        }
    });
    req.on('drain',function(){ file.resume(); });
    return req;
}
exports.post=request;
