/*
 ** shiedman (shiedman@gmail.com)
 **
 ** goagent wsgi.py 2.1.12
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
    zlib.inflateRaw(data,function(err,buffer){
        if(err){callback(err,null,null);return;}
        //console.log(buffer.toString());
        var request={},headers={};
        buffer.toString().trim().split(/\r*\n/).forEach(function(e){
            //don't use split method, ":" maybe not occurs only one time
            var i=e.indexOf(':'); if(i<0)return;
            var k=e.substring(0,i),v=e.substring(i+1);
            if (k.substring(0,2)=='G-'){
                request[k.substring(2).toLowerCase()]=v.trim();
            }else{
                headers[k.toLowerCase()]=v.trim();
            }
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
        var buf=Buffer.concat(req_caches,bytesReaded);
        if(buf.length<3){
            response.statusCode=500;
            return response.end('proxy data malformat');
        }

        var metadata_length=buf.readUInt16BE(0);

        decode_request(buf.slice(2,2+metadata_length),function(err,_request){
            if(err){
                console.warn(err);
                return response.end('decompresss error');
            }
            request.url=_request.url;
            request.method=_request.method;
            request.headers=_request.headers;
            var xorchar=_request.xorchar || '\x00';
            if (request.method == 'CONNECT'){
                response.statusCode=405;
                return response.end('CONNECT method not supported');
            }
            console.info('%s %s - -',request.method,request.url);
            //skip password checking
            //if(__password__ && __password__!=req['password'])
            var payload=null;
            if( 'content-length' in request.headers && 2+metadata_length<buf.length){
                payload=buf.slice(2+metadata_length);
            }
            if(payload && 'deflate'==request.headers['content-encoding']){
                zlib.inflateRaw(payload,function(err,buffer){
                    if(err){
                        console.warn(err);
                        response.statusCode=400;//bad request
                        response.end("can't decompresss payload data");
                        return;
                    }else{
                        request.headers['content-length']=buffer.length;
                        delete request.headers['content-encoding'];
                        proxy.handle(request,response,buffer,xorchar);
                    }
                });
            }else{
                proxy.handle(request,response,payload,xorchar);
            }
        });
    });
    request.on('close',function(){
        if(!request_ended){
            console.warn('[goagent]client request aborted');
        }
    });

};
function dump(request,response,payload,xorchar){
    console.log(request);
    console.log(payload);
    console.log(new Buffer(xorchar));
}
if(false){
    proxy.handle=dump;
    var fstream=fs.createReadStream('../test/goagent_test_data.bin');
    exports.serve(fstream,{});
}
