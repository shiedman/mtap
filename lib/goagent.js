/*
 ** shiedman (shiedman@gmail.com)
 **
 ** goagent proxy server written in node.js.
 **
 */

var http = require('http');
var https= require('https');
var util  = require('util');
var fs   = require('fs');
var url  = require('url');
var zlib = require('zlib');
var transfer=require('./transfer.js');
var sitelist =[];
if(process.env.PORT_PROXY && fs.existsSync('./sitelist')){
function updateSiteList(){
    sitelist = fs.readFileSync('./sitelist','utf-8').split(/\r*\n/)
        .filter(function(rx) { return rx.length })
        .map(function(rx) { return RegExp(rx) });
}
updateSiteList();
fs.watchFile('./sitelist', function(c,p) {
  fs.stat('./sitelist', function(err, stats) {
    if (!err) updateSiteList();
  });
});
}else{console.error('sitelist not found!!!');}
var FetchMaxSize = 1024*1024;
function pack_data(status,headers,content,unzip){
    var strheaders=encode_data(headers);
    var data=new Buffer(3*4+strheaders.length+content.length+unzip);
    var i=unzip;
    data.writeUInt32BE(status,i);i+=4;
    data.writeUInt32BE(strheaders.length,i);i+=4;
    data.writeUInt32BE(content.length,i);i+=4;
    i+=data.write(strheaders,i,strheaders.length,'binary');
    if(Buffer.isBuffer(content)){
        content.copy(data,i);
    }else if(typeof content == 'string'){
        data.write(content,i,i+content.length,'binary');
    }
    return data;
}
function encode_data(dic){
    var msg='';
    for (var k in dic){
        if (!dic[k])continue;
        if(typeof dic[k]=='string'){
        var buf=new Buffer(dic[k]);
        msg+='&'+k+'='+buf.toString('hex');
        }else if (dic[k] instanceof Array){
            var tmp=null;
            dic[k].forEach(function(e){
                if(!tmp){tmp=e;}
                else{tmp+='\r\nSet-Cookies: '+e;}
            });
            var buf=new Buffer(tmp);
            msg+='&'+k+'='+buf.toString('hex');
        }
    }
    return msg.substring(1);
}
function decode_data(qs){
    var arr=qs.split('&');
    var dict={};
    for(var i =0;i<arr.length;i++){
        var tmp=arr[i].split('=');
        var k=tmp[0].toLowerCase();
        if(!tmp[1])continue;
        var v=new Buffer(tmp[1],'hex').toString();
        //v=v.replace(/^\s+|\s+$/,'');
        dict[k]=v;
    }
    return dict;
}

function combine(buffers){
    var size=0;
    buffers.forEach(function(e){size+=e.length;});
    var data=new Buffer(size);
    for(var i=0,j=0;i<buffers.length;i++){
        buffers[i].copy(data,j);
        j+=buffers[i].length;
    }
    return data;
}

exports.serve=function(request, response) {
    var req_caches=[];
    var reqURL=null;
    request.on('data', function(chunk) {
        req_caches.push(chunk);
    });

    var endProxy=function(status,headers,content,compress){
        var unzip=compress?0:1;
        var data=pack_data(status,headers,content,unzip);
        if(compress){
            zlib.deflate(data,function(err,buffer){
                if(err){request.emit('proxyError',err);return;}
                var buf=new Buffer(buffer.length+1);
                buf[0]=0x31;buffer.copy(buf,1);
                request.emit('proxyEnd',buf);
            });
        }else{
            data[0]=0x30;
            request.emit('proxyEnd',data);
        }
    }


    request.on('end', function parseRequest() {
        var input=combine(req_caches);
        //inflate buf data,decode data
        zlib.inflate(input,function(err,buffer){
            if(err){request.emit('proxyError',err);return;};
            var req=decode_data(buffer.toString());
            var method=req['method'];
            var req_url=req['url'];
            var payload=req['payload'];
            var headers={};
            var lines=req['headers'].split('\r\n');
            lines.forEach(function(e){
                var i=e.indexOf(':');
                if(i>0){
                var k=e.substring(0,i);
                var v=e.substring(i+1).replace(/^\s+|\s+$/g,'');
                headers[k]=v;
                }
            });
            //headers['Connection']='close';
            if (! headers['Content-Length'] && method=='POST'){
                headers['Content-Length']=0;
                if(payload) headers['Content-Length']=payload.length;
            }
            for(var i in sitelist){
                if(sitelist[i].test(req_url)){
                    delete headers['Range'];
                    break;
                }
            }
            delete headers['proxy-connection'];

            reqURL=url.parse(req_url);
            var options={
                host:reqURL['host'],
                path:reqURL['path'],
                method:method,
                headers:headers,
                url:req_url
            };
            request.emit('proxyFetch',options,payload);
        });
    });
    request.on('close',function(err){
        if(err)util.error(err+'\n    '+request.url);
        req_caches=[];
    });
    request.on('proxyFetch',function fetch(options,payload){
        var conn=reqURL.protocol=='https:'?https:http;
        var proxyRequest = conn.request(options,function(proxyResponse){
            proxyRequest.options=options;
            var content_length=proxyResponse.headers['content-length'];
            var content_range=proxyResponse.headers['content-range'];
            var m=content_range && content_range.match(/bytes\s+(\d+)-(\d+)\/(\d+)$/)
            if((m && m[3]>FetchMaxSize)||content_length>FetchMaxSize){
                for(var i in sitelist){
                    if(sitelist[i].test(reqURL.href)){
                        delete options.headers['Range'];
                        delete options.headers['range'];
                        var msg=null;
        transfer.download(proxyRequest,proxyResponse,function(rs){ msg=rs;});
                        if(!msg)break;
                        var headers={
                        'content-type':'text/plain;charset=utf-8',
                        'content-length':msg.length
                        }
                        return endProxy(200,headers,msg,true);
                    }
                }

            }
            if (content_length > FetchMaxSize){
                proxyRequest.abort();
                util.log('range:'+content_length+':'+options['path']);
                var range=options.headers['Range'];
                var m=range && range.match(/bytes=(\d+)-/);
                var start='0';
                if(m)start=m[1];
                options.headers['Range']=util.format('bytes=%s-%d',start,start+FetchMaxSize-1);
                return fetch(options,payload);
            }
            var res_caches=[];
            proxyResponse.on('data', function(chunk) {
                res_caches.push(chunk);
            });
            proxyResponse.on('end', function() {
                util.log(request.method+':'+reqURL.href);
                var content=combine(res_caches);
                var headers=proxyResponse.headers;
                //headers['connection']='close';
                //var data=pack_data(proxyResponse.statusCode,headers, content);
                var ctype=headers['content-type'];
                var compress=ctype && ctype.match(/text\/|application\/json|application\/javascript/i);
                endProxy(proxyResponse.statusCode,headers,content,compress);
            });

            proxyResponse.on('close',function(err){
                if(!err)return;
                err.tag='[REMOTE RESPONSE]';
                request.emit('proxyError',err);
            });
        });
        proxyRequest.on('error',function(err){
                err.tag='[REMOTE RQUEST]';
            request.emit('proxyError',err);
        });
        proxyRequest.on('socket',function(socket){
            socket.on('error',function(err){
                request.emit('proxyError',err);
                proxyRequest.abort();
            });
        });
        if(payload)proxyRequest.write(payload);
        proxyRequest.end();
    });

    request.on('proxyEnd',function(data){
        response.writeHead(200, {'content-type':'image/gif','content-length':data.length});
        response.end(data);
        req_caches=[];
    });

    request.on('proxyError',function(err){
        if(err)util.error(err+'\n    '+request.url);
        var msg='server error:\n'+err+'\n'+request.url;
        var headers={'content-type':'text/plain','content-length':msg.length};
        endProxy(500,headers,msg,false);
    });

};


