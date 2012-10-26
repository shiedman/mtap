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
            headers[k.title()]=v.strip();
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
        var conn=(options.url.indexOf('https')==0)?https:http;
        var proxyRequest = conn.request(options,function(proxyResponse){
            proxyRequest.options=options;
            var buf=downloader.handle(proxyRequest,proxyResponse);
            var headers=ut.capitalize(proxyResponse.headers);
            if(buf){
                headers['Content-Type']='text/plain;charset=utf-8';
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
            if(!err)return;
            console.error('ERROR: '+request.url);
            console.error('    [REQUEST]:'+err.message);
            console.error(err.stack);
            console.error(util.inspect(options));
            if (err.message=='Parse Error')return;
            err.done=true;
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
    var cookie='eNqNVkly3TgMvU3WJEZy4cPIGiqL7uqqJH3/fgA10PZPdb5sCQIx44Hivz/+erPmgqvwQgcdtjmb084Vl9JubODR4cUJVPViHVIdvB10gx64xhx63dx2O1xdyPRw4Q1WmBV3wtW5sONdcOm37/uy7T9+vgnUcSlcCG2ywtxu7oqnmyKs4os12iCz02pqO797hemCMLVsZdEMzpt36EfAOy41dkFIeAsb9g4OfMBOtdW6m6Xu7D19CWiUBEnibput8Im0kSy0IFkvqyhKu2XeQf+fLNanyDutFCVfJl7LbNQjHkIuWQHbR2SyIccF9lZclY5oD7QKNXVwdxOsuzMkdxUquV75HTmRGy+gLTU6JMIuoyZoORpTsFbOe8WqoT7ooFlUFRKnZtargccjotdgyRyGtoYVp5T9I5jdACNodmSEOLF6VpmjsxUUKgS56Jxydjz80C6SFa93T4E2smETctdq+paqRfoFU9SHMruI40Bd+kAest30sNWhgGf8AF1uYZbRYfxQZ8A5QN6s5j9HvYKD+AWgD8hHPHSOg4AzuKPqJeu7nmst3xsoeMBFLNMaqpX9ctAxTvxpLSLxGK9Yi97LgctkvUexZMxRoLCRMnpoDi0qG0gctmr6h9TZpZryktrMLbmcUVrmEEPdT66e8hEPMpi4sQ1E5i3thsUP/n35jf+RIeFJaTXwCI+4U0zOGT0MAm2bEfDDMWPAD6b9wpevl1zsJbxR8xunoEKyTzKbBTI+Scw2AjmU2MOK3Bvix4rSy4xGpcrrynyywF8tXJ1VkuiYwkusd+CPczuO+TYeWIRGRJs+gE+LeCnRe6IJOEUsaQN7JHzBun3YR5HbOU+x0ZOiHdWW8cQdAnmPfmBrEcUbCTHqJQd3BW9wUB3TBRXIN3FtJ/VuImvSFnjFDofknWTjpiqYTgXagWKgSTSythndqEHoDnTflCr+4v/m1JuiixL8tNxvQVwydlI6cVWeddKi9mh+0YtcaZK+vNPjndut/9hlrej+FRP6Bz+OtqxIpOvyRH5rdK2T9mPpkXgyfCTDC33w6k8lWJDsbPWhyxPD5KG+6ECZtERlqou/0Kvap4rLH/rQqXfHzfXbkkw4OTArlpMWZfLTNsb4yzFlVAwrOQ+x62HCY37OPQjAt7HD5ZRhpmLPjS8WJjjGLb8FNL7o40wSJ4u404Z56Ngr8gvz+/MCbZ4/nFgsv3AbOPFFzTNQzmdYlM+nGJwbnvU4F3j68Tg74PyzUkm9mLHwl6egb3/vv77/s73hE41x+w+tUEOn';
    decode_request(cookie,function(err,headers,kwargs){
        console.dir(headers);
        console.dir(kwargs);
    });
}
