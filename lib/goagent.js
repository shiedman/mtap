/*
 ** shiedman (shiedman@gmail.com)
 **
 ** goagent 2.0+ paas implement by node.js.
 **
 */

var http = require('http')
, https= require('https')
, util  = require('util')
, fs   = require('fs')
, path = require('path')
, urlparse  = require('url').parse
, zlib = require('zlib');

var downloader=require('./downloader.js'),
    ut=require('./utility.js');
var TIMEOUT=30000;
function decode_request(request,callback){
    zlib.inflate(new Buffer(request,'base64'),function(err,buffer){
        if(err){callback(err,null,null);return;}
        console.log(buffer.toString());
        var lines=buffer.toString().split(/\r*\n/);
        var headers={},kwargs={};
        for(var i in lines){
            if(lines[i].length==0)continue;
            var j=lines[i].indexOf(':');
            var k='',v='';
            if(j<0)k=lines[i];
            else{k=lines[i].substring(0,j);v=lines[i].substring(j+1);}
            if (k.indexOf('X-Goa-')==0){
                kwargs[k.substring(6).toLowerCase()]=v.strip();
            }else{
                //headers.push([k.title(),v.strip()]);
                headers[k.title()]=v.strip();
            }
        }
        callback(err,headers,kwargs);
    });
}

function combine(buffers){
    if(!buffers||buffers.length==0)return null;
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
    request.on('data', function(chunk) {
        req_caches.push(chunk);
    });

    request.on('end', function parseRequest() {
        var payload=combine(req_caches);

        var cookie=request.headers['cookie'];
        if(typeof(cookie)!='string'){
            response.statusCode=500;
            return response.end('proxy data malformat');
        }
        decode_request(cookie,function(err,headers,kwargs){
            var method=kwargs['method'];
            var url=kwargs['url'];
            var remoteIP=request.connection.remoteAddress;
            console.info('%s %s %s %s" - -',remoteIP,method,url,'HTTP/1.1');
            //skip password checking
            //if(__password__ && __password__!=kawargs['password'])
            if (method == 'CONNECT'){
                response.statusCode=405;
                return response.end('CONNECT method not supported');
            }
            headers['Connection']='close';
            reqURL=urlparse(url);
            request.url=url;
            var options={
                host:reqURL['host'],
                path:reqURL['path'],
                method:method,
                headers:headers,
                url:url
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
            var buf=downloader.handle(proxyRequest,proxyResponse);
            var headers=ut.capitalize(proxyResponse.headers);
            if(buf){
                //headers['Content-Type']='text/plain;charset=utf-8';
            if(proxyResponse.filename){
                var userAgent=options.headers['User-Agent'];
                if(userAgent)userAgent=userAgent.toLowerCase();
                if(userAgent.indexOf('msie')>=0){
                headers['Content-Disposition']='attachment; filename='+encodeURIComponent(proxyResponse.filename+'.log');
                }else if(userAgent.indexOf('firefox')>=0){
                headers['Content-Disposition']='attachment; filename*="utf8\'\''+encodeURIComponent(proxyResponse.filename+'.log')+'"';
                }
            }
                headers['Content-Length']=buf.length;
                headers['Cache-Control']='no-cache';
                response.writeHead(proxyResponse.statusCode, headers);
                response.end(buf);
            }else{
                headers['Connection']='close';
                delete headers['Transfer-Encoding'];
                response.writeHead(proxyResponse.statusCode, headers);
                //util.log(request.method+': '+request.url);
                proxyResponse.pipe(response);
            }
        });
        proxyRequest.setTimeout(TIMEOUT,function(){
            proxyRequest.abort();
            response.end();
            util.error('[timeout:30s]'+request.url);
        });
        proxyRequest.on('socket',function(socket){
            socket.on('error',function(err){
                if(err && err.done)return;
                util.error('ERROR: '+request.url);
                util.error('     [SOCKET]:'+err.message);
                if (proxyRequest.rawdata)util.error(proxyRequest.rawdata.toString());
                proxyRequest.abort();
                if (err.message=='Parse Error')
                    request.connection.end(proxyRequest.rawdata);
                else
                    response.end();
            });
            socket.on('data',function(chunk){
                proxyRequest.rawdata=chunk;
                downloader.detectFileName(proxyRequest,chunk);
            });
        });
        proxyRequest.on('error',function(err){
            console.error('    [REQUEST]:'+err.message);
            if (err.message=='Parse Error')return;
            err.done=true;
            var msg='server error:\n'+err;
            var headers={'content-type':'text/plain','content-length':msg.length};
            response.writeHead(500,headers);
            response.end(msg);
        });
        if(payload)proxyRequest.write(payload);
        proxyRequest.end();
    });

};

