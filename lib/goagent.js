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
    zlib.inflateRaw(request,function(err,buffer){
        if(err){callback(err,null,null);return;}
        //console.log(buffer.toString());
        var lines=buffer.toString().split(/\r*\n/);
        var headers={},kwargs={};
        for(var i in lines){
            if(lines[i].length==0)continue;
            var j=lines[i].indexOf(':');
            var k='',v='';
            if(j<0)k=lines[i];
            else{k=lines[i].substring(0,j);v=lines[i].substring(j+1);}
            if (k.indexOf('G-')==0){
                kwargs[k.substring(2).toLowerCase()]=v.strip();
            }else{
                headers[k.title()]=v.strip();
            }
        }
        callback(err,headers,kwargs);
    });
}

function combine(buffers,length){
    if(!buffers||buffers.length==0)return null;
    var size=0;
    buffers.forEach(function(e){size+=e.length;});
    var data=new Buffer(size);
    if(!length)length=buffers.length;
    for(var i=0,j=0;i<length;i++){
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
        var buf=combine(req_caches);

        if(!buf || buf.length<2){
            response.statusCode=500;
            return response.end('proxy data malformat');
        }

        var metadata_length=buf.readInt16BE(0);

        decode_request(buf.slice(2,2+metadata_length),function(err,headers,kwargs){
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
            var reqURL=urlparse(url);
            request.url=url;
            var options={
                hostname:reqURL['hostname'],
                port:reqURL['port']||80,
                path:reqURL['path'],
                method:method,
                headers:headers,
                url:url
            };
            if(url.indexOf('https')==0){ options.port=reqURL['port']||443; }
            var payload=null;
            if( 'Content-Length' in headers && 2+metadata_length<buf.length){
                payload=buf.slice(2+metadata_length);
            }
            if(payload && 'deflate'==headers['Content-Encoding']){
                zlib.inflateRaw(payload,function(err,buffer){
                    if(err){
            request.emit('proxyFetch',options,payload);
                    }else{
                        headers['Content-Length']=buffer.length;
                        delete headers['Content-Encoding'];
            request.emit('proxyFetch',options,buffer);
                    }
                });
            }else{
            request.emit('proxyFetch',options,payload);
            }
        });
    });
    request.on('close',function(err){
        if(err)util.error(err+'\n    '+request.url);
        req_caches=[];
    });
    request.on('proxyFetch',function fetch(options,payload){
        //fs.appendFile('goagent.log',util.inspect(options)+'\n\n');
        var conn=(options.url.indexOf('https')==0)?https:http;
        //var conn=reqURL.protocol=='https:'?https:http;
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
                headers['Cache-Control']='no-cache';
                headers['Content-Encoding']='deflate';
                delete headers['Content-Length'];
                var response_headers='';
                for(k in headers){
                    response_headers+=k+':'+headers[k]+'\n';
                }
                response_headers=response_headers.substring(0,response_headers.length-1);
                zlib.deflateRaw(new Buffer(response_headers),function(err,_header){
                    var _buf=new Buffer(4+_header.length);
                    _buf.writeInt16BE(proxyResponse.statusCode,0);
                    _buf.writeInt16BE(_header.length,2);
                    _header.copy(_buf,4);

                    zlib.deflateRaw(buf,function(err,__buf){
                        response.writeHead(200, {'Content-Type':'image/gif','Content-Length':_buf.length+__buf.length});
                        response.write(_buf);
                        response.end(__buf);
                    });
                });
                //response.writeHead(proxyResponse.statusCode, headers);
                //response.end(buf);
            }else{
                var need_deflate=/text|xml|script|json/.test(headers['Content-Type']);
                if(options.headers['Accept-Encoding'] && options.headers['Accept-Encoding'].indexOf('deflate')<0){
                    need_deflate=false;
                }
                if(headers['Content-Encoding'])need_deflate=false;
                if(need_deflate){
                    headers['Content-Encoding']='deflate';
                    delete headers['Content-Length'];
                }
                var response_headers='';
                for(k in headers){
                    response_headers+=k+':'+headers[k]+'\n';
                }
                response_headers=response_headers.substring(0,response_headers.length-1);
                //console.log(response_headers);
                var output = response;//fs.createWriteStream('izs.me_index.log');
                var res_caches=[],I=0,J=0;
                var ready=false;
                var end=false;
                proxyResponse.on('data',function(chunk){
                    if(ready){
                        if(I<J){
                        for(var i=I;i<J;i++){
                            output.write(res_caches[i]);
                        }
                        I=J;
                        }
                        output.write(chunk);
                    }else{res_caches.push(chunk);J++;}
                });
                proxyResponse.on('end',function(){
                    if(ready) output.end();
                    else end=true;
                    //console.log('end');
                });
                proxyResponse.on('close',function(){
                    if(!end){
                        if(ready) output.end();
                        else end=true;
                    }
                });
                proxyResponse.on('ready',function(chunk){
                    if(response.err){
                        return console.error('connection interrupted: %s',options.url);
                    }
                    response.writeHead(200, {'Content-Type':'image/gif'});
                    //response.headout=true;
                    response.write(chunk);
                    if(need_deflate){
                        var zz=zlib.createDeflateRaw({level:zlib.Z_BEST_SPEED,strategy:zlib.Z_FILTERED});
                        zz.pipe(output);
                        output=zz;
                    }
                    for(var i=I,len=J;i<len;i++){
                        output.write(res_caches[i]);
                    }
                    I=len;
                    ready=true;
                    if(end)output.end();
                });
                zlib.deflateRaw(new Buffer(response_headers),function(err,_header){
                    var _buf=new Buffer(4+_header.length);
                    _buf.writeInt16BE(proxyResponse.statusCode,0);
                    _buf.writeInt16BE(_header.length,2);
                    _header.copy(_buf,4);

                    proxyResponse.emit('ready',_buf);
                });
            }
        });
        proxyRequest.setTimeout(TIMEOUT,function(){
            proxyRequest.abort();
            response.end();
            util.error('[timeout:30s]'+request.url);
        });
        proxyRequest.on('socket',function(socket){
            socket.on('error',function(err){
                if(err && response.err)return;
                response.err=err;
                util.error('ERROR: '+request.url);
                util.error('     [SOCKET]:'+err.message);
                proxyRequest.abort();
                response.end();
            });
            socket.on('data',function(chunk){
                downloader.detectFileName(proxyRequest,chunk);
            });
        });
        proxyRequest.on('error',function(err){
            if(err && response.err)return;
            response.err=err;
            //if(err && err.done)return;
            //err.done=true;
            util.error('ERROR: '+request.url);
            console.error('    [GOAGENT]:'+err.message);
            if(response.headout){return response.end();}
            //var msg='server error:\n'+err;
            //var headers={'content-type':'text/plain','content-length':msg.length};
            //response.writeHead(500,headers);
            proxyRequest.abort();
            response.end();
            //response.end(msg);
        });
        if(payload)proxyRequest.write(payload);
        proxyRequest.end();
    });

};

