/*
 ** shiedman (shiedman@gmail.com)
 ** http proxy server
 */
var http=require('http'),
    https=require('https'),
    net=require('net'),
    fs=require('fs'),
    path=require('path'),
    urlparse  = require('url').parse;

var downloader=require('./downloader.js'),
    ut=require('./utility.js');

var HTTP_METHODS=['HEAD','GET','POST','PUT','DELETE','TRACE','OPTTIONS','CONNECT','PATCH'];
var DOWNLOAD_SIZE=10*1024*1024;
/*
 * http://www.exrapidleech.info/,save output to ~/data/download/index.php
 */
function exrapidinfo(request,response){
    if(request.method=='POST'
            &&request.url=='http://www.exrapidleech.info/index.php'){
        return parseInt(request.headers['content-length'])>500;
    }else{
        return false;
    }
}

exports.handle=function(request, response) {
    //var ip = request.connection.remoteAddress;
	var url=urlparse(request.url);
    if ('proxy-connection' in request.headers){
        request.headers['connection']=request.headers['proxy-connection'];
        delete request.headers['proxy-connection'];
    }
    request.headers['host']=url['host'];
    if ('x-real-host' in request.headers){
        request.headers['host']=request.headers['x-real-host'];
        delete request.headers['x-real-host'];
    }
    var user_agent=request.headers['user-agent'];
    if(user_agent){
        //when the request forwarded by appengine server,strip it
        var i=user_agent.indexOf('AppEngine');
        if(i>0){
            request.headers['user-agent']=user_agent.substring(0,i).trim();
        }
    }

    console.log('%s\t%s',request.method,request.url);
    var options={
        hostname:url['hostname'],
        path:url['path'],
        method:request.method,
        headers:ut.capitalize(request.headers),
        url:request.url //add url for helper  
    };
    if(url['port'])options.port=url['port'];

    var conn=url.protocol=='https:'?https:http;
    var proxy_request = conn.request(options,function(proxy_response){
        //release request's socket listener
        if(req_socket){
            req_socket.removeListener('data',on_socket_data);
            req_socket=null;
        }
        var length=parseInt(proxy_response.headers['content-length'])||-1;
        var buf=null;
        if (ut.env.PORT_WWW&&response.statusCode==200 && 
            (length>=DOWNLOAD_SIZE||exrapidinfo(request,response))){
            buf=downloader.handle(proxy_request,proxy_response,options);
        }
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
            if('content-disposition' in proxy_response.headers){
                //非ascii字符直接写入headers会乱码(http.ServerResponse的默认编码为ascii而非utf-8??)
                var fname=proxy_response.headers['content-disposition'];
                if(fname&&fname.length>0){
                    proxy_response.headers['content-disposition']=new Buffer(fname).toString('binary');
                }
            }
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
    /**
    proxy_request.setTimeout(30000,function(){
        proxy_request.abort();
        response.end();
        console.info('[timeout:30s]'+request.url);
    });
    */
    proxy_request.on('error',function(err){
        console.error('ERROR: '+request.url);
        console.error('    [REQUEST]:'+err.message);
        //if (err.message=='Parse Error')return;
        //err.done=true;
        response.statusCode=500;
        response.end();
        if(req_socket){
            req_socket.removeListener('data',on_socket_data);
            req_socket=null;
        }
    });
    /**
     * since node-v0.8.16,parse error buble to http.ClientRequest,no need hack
    var on_socket_error=function(err){
        if(err && err.done)return;
        console.error('ERROR: '+request.url);
        console.error('     [SOCKET]:'+err.message);
        if (proxy_request.rawdata)console.error(proxy_request.rawdata.toString());
        proxy_request.abort();
        if (err.message=='Parse Error')
            request.connection.end(proxy_request.rawdata);
        else
            response.end();
    };
    */
    var req_socket=null;
    var on_socket_data=function(chunk){
        //proxy_request.rawdata=chunk;
        downloader.detectFileName(proxy_request,chunk);
    };
    proxy_request.on('socket',function(socket){
        //if content-length = 0 or 1,error fired and crashed!!!
        //socket.setMaxListeners(25);
        req_socket=socket;
        //socket.on('error',on_socket_error);
        //work around for gbk attachment filename
        socket.on('data',on_socket_data);
    });
    
};

/**
string contentDisposition;
if (Request.Browser.Browser == "IE" && (Request.Browser.Version == "7.0" || Request.Browser.Version == "8.0"))
    contentDisposition = "attachment; filename=" + Uri.EscapeDataString(fileName);
else if (Request.Browser.Browser == "Safari")
    contentDisposition = "attachment; filename=" + fileName;
else
    contentDisposition = "attachment; filename*=UTF-8''" + Uri.EscapeDataString(fileName);
Response.AddHeader("Content-Disposition", contentDisposition);

 */

