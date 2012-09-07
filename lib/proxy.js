/*
 ** shiedman (shiedman@gmail.com)
 ** start point for transfer.js
 */
var http = require('http'),
    fs   = require('fs'),
    urlparse  = require('url').parse,
    util  = require('util'),
    net  = require('net');
var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){}
var downloader=require('./downloader.js'),
    ut=require('./utilize.js'),
    block=require('./block.js');

//var request_handlers=[kuai.logRequest,kuai.upload,httptask.viewTasks,block.filter];
//var fetch_handlers=[transfer.download];

//var httpserver=http.createServer(function(request, response) {
exports.handle=function(request, response) {
    var ip = request.connection.remoteAddress;
    if ('proxy-connection' in request.headers){
        request.headers['connection']=request.headers['proxy-connection'];
        delete request.headers['proxy-connection'];
    }
    if(block.filter(request,response))return;
    /**
    var n=0
    var handle_request=function(i){
        if(i<0 || i>=request_handlers.length)return;
        request_handlers[i](request,response,function(err){
            if(err){
                console.err(err);
            }else{
                n++; handle_request(i+1);
            }
        });
    };
    handle_request(n);
    if(n<request_handlers.length)return;
    */

	var url=urlparse(request.url);
    var options={
        hostname:url['hostname'],
        port:url['port']||80,
        path:url['path'],
        method:request.method,
        headers:ut.capitalize(request.headers),
        url:request.url //add url for next use
    };

    //var m=0;
    var proxy_request = http.request(options,function(proxy_response){
        proxy_request.options=options;
        var buf=downloader.handle(proxy_request,proxy_response);
        if(buf){
            var headers=ut.capitalize(proxy_response.headers);
            headers['Content-Type']='text/plain;charset=utf-8';
            headers['Content-Length']=buf.length;
            response.writeHead(proxy_response.statusCode, headers);
            response.end(buf);
        }else{
            response.sending=true;
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
            //util.log(request.method+': '+request.url);
            proxy_response.pipe(response);
        }
        /*
        var handle_fetch=function(i){
            if(i<0 || i>=fetch_handlers.length)return;
            fetch_handlers[i](proxy_request,proxy_response,function(buf){
                if(buf){
                    var headers=ut.capitalize(proxy_response.headers);
                    headers['Content-Type']='text/plain;charset=utf-8';
                    headers['Content-Length']=buf.length;
                    response.writeHead(proxy_response.statusCode, headers);
                    response.end(buf);
                }else{
                    m++;handle_fetch(i+1);
                }
            });
        };
        handle_fetch(m);
        if(m<fetch_handlers.length){return;}
        */

    });
    request.pipe(proxy_request);
    proxy_request.setTimeout(30000,function(){
        proxy_request.abort();
        if(response.sending){
            response.end();
        }else{
            response.writeHead(408,{'Connection':'close','Content-Type':'text/plain'});
            response.end('request time out:'+request.url);
        }
        util.error('[timeout]'+request.url);
    });
    proxy_request.on('error',function(err){
        util.error('ERROR: '+request.url);
        util.error('    [REQUEST]:'+err.message);
        if (err.message=='Parse Error')return;
        err.done=true;
        response.statusCode=500;
        response.end();
    });
    proxy_request.on('socket',function(socket){
        //if content-length = 0 or 1,error fired and crashed!!!
        socket.setMaxListeners(25);
        socket.on('error',function(err){
            if(err && err.done)return;
            util.error('ERROR: '+request.url);
            util.error('     [SOCKET]:'+err.message);
            if (proxy_request.rawdata)util.error(proxy_request.rawdata.toString());
            proxy_request.abort();
            if (err.message=='Parse Error')
                request.connection.end(proxy_request.rawdata);
            else
                response.end();
        });
        //var readHead=false;
        socket.on('data',function(chunk){
            proxy_request.rawdata=chunk;
            //chunk starts with:HTTP<space>
           if(process.env.SERVER && chunk && chunk.length>5
                && chunk[0]==0x48
                && chunk[1]==0x54
                && chunk[2]==0x54
                && chunk[3]==0x50
                && chunk[4]==0x2F){
                for (var i=0;i<chunk.length-3;i++){
                    //find http response head ends with \r\n\r\n
                    if (chunk[i]==0x0d && chunk[i+1]==0x0a&&chunk[i+2]==0x0d&&chunk[i+3]==0x0a){
                        proxy_request.filename=null;
                        var head=chunk.toString('binary',0,i);
                        //console.log('head:',head);
                        var m=head.indexOf('filename=');
                        if(m<0)return;
                        m+='filename='.length;
                        if(head[m]=='"')m++;
                        var n=head.indexOf('\r\n',m);
                        if(n<0||n==m)return;
                        var filename=head.substring(m,n);
                        //console.log('**filename=',filename);
                        filename=filename.replace(/[";\s]+$/,'');
                        if(Iconv){
                        try{
                            var iconv=new Iconv('GB18030','UTF-8');
                            var buf= new Buffer(filename,'binary');
                            filename=iconv.convert(buf).toString();
                        }catch(err){
                            console.error(err);
                            filename=buf.toString();
                        }
                        }
                        try{filename=decodeURIComponent(filename);}catch(err){}
                        proxy_request.filename=filename;
                    }
                }

            }
        });
    });
    
};
/**
httpserver.on('connect', function(req, cltSocket, head) {
    var srvUrl = urlparse('http://' + req.url);
    util.log('CONNECT: '+req.url);
    var srvSocket = net.connect(srvUrl.port, srvUrl.hostname, function() {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Node-Proxy\r\n\r\n');
        if(head)srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
        srvSocket.on('error',function (err){
            console.error(err);
        });
    });
});
httpserver.on('connection',function(socket){
    var request_count=0;
    socket.on('data',function __callback(data){
        request_count++;
        if (request_count==1){
            //check if data reversed
            var tmp=new Buffer(data);
            _xor(tmp);
            var i=0;
            for (;i<tmp.length-1;i++){
                //find first line
                if (tmp[i]==0x0d && tmp[i+1]==0x0a)break;
            }
            if (i==tmp.length-1){socket.removeListener('data',__callback);return;}
            var line=tmp.toString('utf-8',0,i);
            var arr=line.split(' ');
            var cmd=arr[0],path=arr[1],http_ver=arr[2];
            if (cmd && HTTP_METHODS.indexOf(cmd)>=0){
                socket.orig_write=socket.write;
                socket.write=function (chunk,encoding,callback){
                    if (!Buffer.isBuffer(chunk)){chunk=new Buffer(chunk);}
                    _xor(chunk);
                    return this.orig_write(chunk,encoding,callback);
                }
            }else{
                socket.removeListener('data',__callback);
                return;
            }
        }
        _xor(data);
    });
});
**/
/*
httpserver.on('clientError',function(err){
    util.log('clientError: '+err.message);
});
httpserver.listen(PORT);
if(SERVER_PORT){
    setInterval(httptask.updateTask,30000);
process.on('SIGTERM',function(){
    console.warn(Date.now()+':proxyServer is exiting....');
    process.exit(0);
});
}
*/
