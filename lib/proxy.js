/*
 ** shiedman (shiedman@gmail.com)
 ** http proxy server
 */
var http=require('http'),
    urlparse  = require('url').parse;

var downloader=require('./downloader.js'),
    exp=require('./exrapidleech.js'),
    ut=require('./utility.js');


exports.handle=function(request, response) {
    //var ip = request.connection.remoteAddress;
    if(request.method=='POST'&&request.url=='http://www.exrapidleech.info/index.php'){
        return exp.handle(request,response);
}
    if ('proxy-connection' in request.headers){
        request.headers['connection']=request.headers['proxy-connection'];
        delete request.headers['proxy-connection'];
    }
    if ('x-real-host' in request.headers){
        request.headers['host']=request.headers['x-real-host'];
        delete request.headers['x-real-host'];
    }

    console.log('%s %s',request.method,request.url);
	var url=urlparse(request.url);
    var options={
        hostname:url['hostname'],
        port:url['port']||80,
        path:url['path'],
        method:request.method,
        headers:ut.capitalize(request.headers),
        url:request.url //add url for next use
    };

    var proxy_request = http.request(options,function(proxy_response){
        proxy_request.options=options;
        var buf=downloader.handle(proxy_request,proxy_response);
        if(buf){
            var headers=ut.capitalize(proxy_response.headers);
            //headers['Content-Type']='text/plain;charset=utf-8';
            if(proxy_response.filename){
                var userAgent=options.headers['User-Agent'];
                if(userAgent)userAgent=userAgent.toLowerCase();
                if(userAgent.indexOf('msie')>=0 || userAgent.indexOf('chrome')>=0){
                headers['Content-Disposition']='attachment; filename='+encodeURIComponent(proxy_response.filename+'.log');
                }else if(userAgent.indexOf('mozilla')>=0){
                headers['Content-Disposition']='attachment; filename*="utf8\'\''+encodeURIComponent(proxy_response.filename+'.log')+'"';
                }
                //else{
                //headers['Content-Disposition']='attachment; filename='+(proxy_response.filename+'.log');
                //}
            }
            headers['Content-Length']=buf.length;
            headers['Cache-Control']='no-cache';
            response.writeHead(proxy_response.statusCode, headers);
            response.end(buf);
        }else{
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
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
        response.end();
        console.info('[timeout:30s]'+request.url);
    });
    proxy_request.on('error',function(err){
        console.error('ERROR: '+request.url);
        console.error('    [REQUEST]:'+err.message);
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
            console.error('ERROR: '+request.url);
            console.error('     [SOCKET]:'+err.message);
            if (proxy_request.rawdata)console.error(proxy_request.rawdata.toString());
            proxy_request.abort();
            if (err.message=='Parse Error')
                request.connection.end(proxy_request.rawdata);
            else
                response.end();
        });
        //work around for gbk attachment filename
        socket.on('data',function(chunk){
            proxy_request.rawdata=chunk;
            downloader.detectFileName(proxy_request,chunk);
        });
    });
    
};
if(false){
    var net=require('net');
    var httpserver=http.createServer();
    function onConnect(req, cltSocket, head) {
        var srvUrl = urlparse('http://' + req.url);
        console.log('CONNECT: %s',req.url);
        var srv = net.connect(srvUrl.port, srvUrl.hostname, function() {
            cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                'Proxy-agent: y2proxy\r\n\r\n');
            if(head&&head.length>0)srv.write(head);
            //srvSocket.pipe(cltSocket);
            cltSocket.pipe(srv);
            var i=0;
            srv.on('data',function(chunk){
                cltSocket.write(chunk);
                i++;
                console.info('[%s]write data:%s',i,chunk.length);
            });
            srv.on('end',function(){
                cltSocket.end();
                console.info('end socket');
            });
            srv.on('close',function(){
                console.info('close socket');
            });
        });
        srv.on('error',function (err){
            console.error(err);
        });
    }
    httpserver.on('clientError',function(err){
        console.error('clientError: %s',err.message);
    });
    httpserver.on('connect', onConnect);
    httpserver.on('request', exports.handle);
    var PORT=process.env.PORT_OTHER||80;
    httpserver.listen(PORT, function(){
        console.log("proxy server listening on port %s",PORT);
    });

}
