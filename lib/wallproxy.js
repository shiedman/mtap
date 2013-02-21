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
var DOWNLOAD_SIZE=10*1024*1024;

function decode_request(request,callback){
    zlib.inflate(new Buffer(request,'base64'),function(err,buffer){
        if(err){callback(err,null,null);return;}
        var parts=buffer.toString().split('&');
        var kwargs={};
        for(var i in parts){
            if(parts[i].length==0)continue;
            var j=parts[i].indexOf('=');
            var k='',v='';
            if(j<0){
                k=parts[i];
            }else{
                k=parts[i].substring(0,j);
                v=new Buffer(parts[i].substring(j+1),'hex').toString();
            }
            kwargs[k]=v;

        }
        var headers={};
        var lines=kwargs['headers'].split(/\r*\n/);
        for(var i in lines){
            if(lines[i].length==0)continue;
            var j=lines[i].indexOf(':');
            var k='',v='';
            if(j<0)k=lines[i];
            else{k=lines[i].substring(0,j);v=lines[i].substring(j+1);}
            headers[k.title()]=v.trim();
        }
        delete kwargs['headers'];
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
            //console.log(url);
            request.url=url;
            var reqURL=urlparse(url);
            var options={
                hostname:reqURL['hostname'],
                port:reqURL['port']||80,
                path:reqURL['path'],
                method:method,
                headers:headers,
                url:url
            };
            if(url.indexOf('https')==0){ options.port=reqURL['port']||443; }
            request.emit('proxyFetch',options,payload);
        });
    });
    request.on('close',function(err){
        if(err)util.error(err+'\n    '+request.url);
        req_caches=[];
    });
    request.on('proxyFetch',function fetch(options,payload){
        var conn=(options.url.indexOf('https')==0)?https:http;
        //fs.appendFile('options.txt',JSON.stringify(options),'utf-8');
        var proxyRequest = conn.request(options,function(proxyResponse){
            var length=parseInt(proxyResponse.headers['content-length'])||-1;
            var buf=null;
            if (response.statusCode==200 && length>=DOWNLOAD_SIZE)
                buf=downloader.handle(proxyRequest,proxyResponse,options);
            if(buf){
                //headers['Content-Type']='text/plain;charset=utf-8';
                var headers=ut.capitalize(proxyResponse.headers);
                if(proxyResponse.filename){
                    var userAgent=options.headers['User-Agent'];
                    if(userAgent)userAgent=userAgent.toLowerCase();
                    if(userAgent.indexOf('msie')>=0 || userAgent.indexOf('chrome')>=0){
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
                response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                response.headout=true;
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
            if(!err)return;
            if (err.message=='Parse Error')return;
            console.error('ERROR: '+request.url);
            console.error('    [REQUEST]:'+err.message);
            console.error(err.stack);
            err.done=true;
            if(response.headout){return response.end();}
            var msg='server error:\n'+err;
            var headers={'content-type':'text/plain','content-length':msg.length};
            response.writeHead(500,headers);
            response.end(msg);
        });
        if(payload){ proxyRequest.write(payload); }
        /*
         *if(conn==https){
         *    console.log(Date.now());
         *    if(payload)console.log(payload.toString());
         *}
         */
        proxyRequest.end();
    });

};

if(false){
    console.log(__filename);
    var cookie='eNqlk01u3DAMhW+TtURSpLyYw9gjGVm0KJC29+9HzUwyaBF0ERuW9UM+vkdSv9++XbyH8ZZQ3eWUM9TVryoyQmPz6cqzsZ6ctJBw3zxnKtOHn7GzvvJW1uqnDzmVOd/pG9YzupqHd04B8+rmFrvmmBGICGpRj37HBxXPCEsEGLjDa2FnnOYaxv4Jsr68zn3Mt58Xq66LVsFtGHRwjGj8wxvSCkS7DGymJMjUI6oOLVBtZZT9L4TmNzm2KEQigIfYKHJlbmB4yobMzT+tJ+8TweV1sAMqsSv2mZJ/4i1+4ERfohlJwlUSvURJLyzrA5Ui9Xebg/n/bDl/UrvBP0u9P+31ZNTarcSoX1kjwYuZUfKQpRe0LK86PukneRq93VvlUXrtj3MtrISvMBojfcao2VCZQyIecD2jrJz01Q63fHy5EZemAvNUQ/ZXNSbNlF2Q2e/vlbuvUL6qyIWQbLdPPWo0WCdbITf7R75XvogIR9jhXVtvO33YzJqAVblt8LWhQl6PtjRryb/RiS6qNtGr2HNJ2t667SouCKX33FRbXTdJqddmwzDkP2Fx6NL88n3+ev0xLkRqzf4AjRfxIA==';
    decode_request(cookie,function(err,headers,kwargs){
        console.dir(headers);
        console.dir(kwargs);
    });
}
