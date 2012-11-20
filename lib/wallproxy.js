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
                hostname:reqURL['host'],
                port:reqURL['port']||80,
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
                //headers['Content-Type']='text/plain;charset=utf-8';
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
    console.log(__filename);
    var cookie='eNqFVMtu3DAM/JucJT6lw36MbEnIoUWBtP3/Dulks9sG6GptyxI54gxJ/377drPmglF40KZtp21z67ZoOcfTKi1jrM58LtrO2IGtFyfTJ48CtMIbqwuY5J2nzUTpRpclGfwV66oiw7oOZVUuMkVEmWTCS20YMXHhCXvCedUOl0TbJmQWKycG4cl28ASKyKGbKzNr3ksiFDa85/3ldY253n7eJJzYFBSEppwAWeaueLoppCg+rNFMwmfQ4cMrTy60WMssQ4P89uYd/iHPwlBjF1DFW2DYgRWcAZwItrtZ+j6eHnYU0o9EVY91AmZGEjKGhYA2IupJudJmRRwFnk1TehPsuzMslwqV3K98gAe58cDc0qPDInAhWaQwBaopUtwrdg1xRlot2NH+8My4m0XyM6L/F0ryuZA0EJ3S76ncoAj0gv8BlIgrymTfcXaeGvONePuVGWXpsqQC5pQthNkZmfkcsAN/aA5TDAKHhqJZWQaCwnCcisxghTCrqOfwClsopqpbRUmZ61e4bPCIody431El1oyzQjosDEyCvWAtUWUr8fT8ITpPVg4d9UG3BiXOe6ucmUGz4aGMOKMdZqJ3RB7n0juPKPfQB1pz6BgdQpnxhVlDucUfTC3UoIxXA91Ob7gIOYnMzkQSeMQZggszRaQfkUT9PVl25kRERNDxGTHy/ImIiLIp/bKDIicK8RGHsnFL2kDbrFtUCnYGLMa73WWFXHAwQ61nFtB6yfgrNM0cjX8iLnmKX0pIxecrOrNBw6e8R70AOThEDThm0StX5lt+qFLdzDzyjUoivCPSv7sdfY2ezmxL9oxnT3j0Nr4TJ+aSHRMqy/W1ePm+fr3+mDfICcn+AOvvU5Y=';
    decode_request(cookie,function(err,headers,kwargs){
        console.dir(headers);
        console.dir(kwargs);
    });
}
