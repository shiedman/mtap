/*
 ** shiedman (shiedman@gmail.com)
 **
 ** wallproxy wsgi.py 1.10.1
 **
 */

var http = require('http')
, https= require('https')
, util  = require('util')
, fs   = require('fs')
, path = require('path')
, urlparse  = require('url').parse
, zlib = require('zlib');

var proxy=require('./proxy.js');

function decode_request(data,callback){
    zlib.inflate(new Buffer(data,'base64'),function(err,buffer){
        if(err){callback(err,null,null);return;}
        var request={};
        buffer.toString().split('&').filter(function(e){
            return e.trim().length>0;
        }).forEach(function(e){
            var parts=e.split('='),k=parts[0],v=parts[1]||'';
            if(v!='')v=new Buffer(v,'hex').toString();
            request[k]=v.trim();
        });
        var headers={};
        request.headers.split(/\r*\n/).forEach(function(e){
            //e.length==0?
            var i=e.indexOf(':'); if(i<0)return;
            var k=e.substring(0,i),v=e.substring(i+1);
            headers[k.toLowerCase()]=v.trim();
        });
        request['headers']=headers;
        callback(err,request);
    });
}


exports.serve=function(request, response) {
    var req_caches=[],bytesReaded=0,request_ended=false;
    request.on('data', function(chunk) {
        req_caches.push(chunk);
        bytesReaded+=chunk.length;
    });

    request.on('end', function parseRequest() {
        request_ended=true;
        var payload=Buffer.concat(req_caches,bytesReaded);

        var cookie=request.headers['cookie'];
        if(typeof(cookie)!='string'){
            response.statusCode=500;
            return response.end('proxy data malformat');
        }
        decode_request(cookie,function(err,_request){
            request.url=_request.url;
            request.method=_request.method;
            request.headers=_request.headers;
            if (request.method == 'CONNECT'){
                response.statusCode=405;
                return response.end('CONNECT method not supported');
            }
            console.info('%s %s - -',request.method,request.url);
            proxy.handle(request,response,payload);
        });
    });
    request.on('close',function(){
        if(!request_ended){
            console.warn('[wallproxy]client request aborted');
        }
    });

};

if(false){
    console.log(__filename);
    var cookie='eNqlk01u3DAMhW+TtURSpLyYw9gjGVm0KJC29+9HzUwyaBF0ERuW9UM+vkdSv9++XbyH8ZZQ3eWUM9TVryoyQmPz6cqzsZ6ctJBw3zxnKtOHn7GzvvJW1uqnDzmVOd/pG9YzupqHd04B8+rmFrvmmBGICGpRj37HBxXPCEsEGLjDa2FnnOYaxv4Jsr68zn3Mt58Xq66LVsFtGHRwjGj8wxvSCkS7DGymJMjUI6oOLVBtZZT9L4TmNzm2KEQigIfYKHJlbmB4yobMzT+tJ+8TweV1sAMqsSv2mZJ/4i1+4ERfohlJwlUSvURJLyzrA5Ui9Xebg/n/bDl/UrvBP0u9P+31ZNTarcSoX1kjwYuZUfKQpRe0LK86PukneRq93VvlUXrtj3MtrISvMBojfcao2VCZQyIecD2jrJz01Q63fHy5EZemAvNUQ/ZXNSbNlF2Q2e/vlbuvUL6qyIWQbLdPPWo0WCdbITf7R75XvogIR9jhXVtvO33YzJqAVblt8LWhQl6PtjRryb/RiS6qNtGr2HNJ2t667SouCKX33FRbXTdJqddmwzDkP2Fx6NL88n3+ev0xLkRqzf4AjRfxIA==';
    decode_request(cookie,function(err,req){
        console.log(req);
    });
}
