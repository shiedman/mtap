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

var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){}

var downloader=require('./downloader.js'),
    ut=require('./utility.js'),
    logger=ut.logger;

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
/**
 * request: http.ServerRequest
 * response: http.ServerResponse
 * payload : wallproxy/goagent payload data
 * xorchar : goagent only
 */
exports.handle=function(request, response ,payload,xorchar) {
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
    //truncate "X" prefix header
    for(var k in request.headers){
        if(k.indexOf('x-forwarded')>=0||k.indexOf('x-heroku')>=0){
            delete request.headers[k];
        }
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
        //transfer-encoding: chunk , should remove it
        delete proxy_response.headers['transfer-encoding'];
        //release request's socket listener
        if(req_socket){
            req_socket.removeListener('data',on_socket_data);
            req_socket=null;
        }
        var length=parseInt(proxy_response.headers['content-length'])||-1;
        var info={};
        if (ut.env.PORT_WWW&&response.statusCode==200 && 
            (length>=DOWNLOAD_SIZE||exrapidinfo(request,response))){
            info=downloader.handle(proxy_request,proxy_response,options,attachment_filename);
        }
        if(info.filename){
            if(xorchar){
                info.headers['X-Status']=proxy_response.statusCode;
                xorchar=xorchar.charCodeAt();
                if(xorchar>0){
                    for(var i=0;i<info.msg.length;i++)info.msg[i]=info.msg[i]^xorchar;
                }
            }
            response.writeHead(proxy_response.statusCode, info.headers);
            response.end(info.msg);
        }else{
            var headers=ut.capitalize(proxy_response.headers);
            if('Content-Disposition' in headers){
                //非ascii字符直接写入headers会乱码(http.ServerResponse的默认编码为ascii而非utf-8??)
                var fname=headers['Content-Disposition'];
                if(fname&&fname.length>0){
                    headers['Content-Disposition']=new Buffer(fname).toString('binary');
                }
            }
            if(xorchar){
                headers['X-Status']=proxy_response.statusCode;
                xorchar=xorchar.charCodeAt();
            }
            response.writeHead(proxy_response.statusCode, headers);
            proxy_response.on('data',function(chunk){
                if(xorchar){
                    for(var i=chunk.length-1;i>=0;i--)chunk[i]=chunk[i]^xorchar;
                }
                if(!response.write(chunk))proxy_response.pause();
            });
            proxy_response.on('drain',function(){
                proxy_response.resume();
            });
            proxy_response.on('end',function(){
                response.end();
                response=null;
            });
            proxy_response.on('close',function(had_error){
                if(response)response.end();
            });
        }

    });
    if(typeof payload =='undefined'){
        request.pipe(proxy_request);
    }else{
        //payload existed ,pass in by wallproxy/goagent, maybe null though
        if(payload){
            proxy_request.end(payload);
        }else{
            proxy_request.end();
        }
    }
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
    var req_socket=null,attachment_filename=null;
    var on_socket_data=function(chunk){
        //proxy_request.rawdata=chunk;
        attachment_filename=parse_content_disposition(chunk);
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

//dirty work to guest filename,thanks for the sucks charset of content-disposition
function parse_content_disposition(chunk){
    //chunk starts with:HTTP/
    var ishttp=(chunk && chunk.length>5
    //var ishttp=(ut.env.PORT_WWW && chunk && chunk.length>5
            && chunk[0]==0x48
            && chunk[1]==0x54
            && chunk[2]==0x54
            && chunk[3]==0x50
            && chunk[4]==0x2F);
    if(!ishttp)return;
    for (var i=0;i<chunk.length-3;i++){
        //find http response head ends with \r\n\r\n
        if(chunk[i]==0x0d && chunk[i+1]==0x0a&&chunk[i+2]==0x0d&&chunk[i+3]==0x0a)break;
    }
    if(i>=chunk.length-3)return;
    var head=chunk.toString('binary',0,i+2);
    var s='filename',i=head.indexOf(s);
    if(i<0)return;
    i+=s.length;
    var encoding='utf-8',filename=null;
    if(head[i]=='='){
        var j=head.indexOf('\n',i),filename=head.substring(i+1,j);
        filename=filename.trim();
        filename=filename.replace(/^"|[";]+$/g,'');
        //rfc2047
        //filename==?UTF-8?B?dG90cmIucGFydDIucmFy?=
        var m=filename.match(/=\?(.+)\?B\?(.+)\?=/);
        if(m){
            encoding=m[1].toLowerCase();
            filename=new Buffer(m[2],'base64').toString('binary');
        }
    }else if(head[i]=='*'&&head[i+1]=='='){
        var j=head.indexOf('\n',i),filename=head.substring(i+2,j);
        filename=filename.trim();
        filename=filename.replace(/^"|[";]+$/g,'');
        //rfc6266
        var m=filename.match(/utf-8'[^']*'(.+)/i);
        if(m){ filename=m[1]; }
    }else{
        return;
    }
    if(Iconv){
        var buf= new Buffer(filename,'binary');
        try{
            var iconv = new Iconv(encoding, 'utf-8');
            filename=iconv.convert(buf).toString();
        }catch(err){
            logger.info('convert from %s to utf-8, error:%s\r\n%s',encoding,filename,err);
            try{
                iconv=new Iconv('gb18030','utf-8');
                filename=iconv.convert(buf).toString();
            }catch(err){
                logger.info('convert from gb18030 to utf-8, error:%s\r\n%s',filename,err);

                iconv = new Iconv(encoding, 'utf-8//TRANSLIT//IGNORE');
                filename=iconv.convert(buf).toString();
            }
        }
    }else{
        //iconv not installed, use default utf-8 decoding
        filename=new Buffer(filename,'binary').toString();
    }
    try{filename=decodeURIComponent(filename);}catch(err){}
    return filename;
    //proxy_request.filename=filename;
}
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
