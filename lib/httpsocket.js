/*
 ** shiedman (shiedman@gmail.com)
 ** http proxy server
 */
var http=require('http'),
    net=require('net'),
    util=require('util'),
    urlparse  = require('url').parse;
var sockets={};
var _err={};
function send(res,errcode,msg){
    var msg=util.format('{"errcode":%s,"message":"%s"}',errcode,msg)
    res.writeHead(200,{'Content-Type':'application/json','Content-Length':msg.length});
    res.end(msg);
}
function connectSocket(req, res) {
    //var ip = request.connection.remoteAddress;
    var parts=req.body['target_host'].split(':');
    var host=parts[0],port=parts[1],key=req.headers['socket-key'];
    if(sockets[key]){res.statusCode=200;return res.end('already connected');}
    var sock=net.connect(port,host,function(){
        console.log('connected to %s:%s',host,port);
        send(res,0,util.format('connected to %s:%s',host,port));
        res=null;
        sockets[key]=sock;
        sock.cache=[],sock.current=0,sock.status='connect';
    });
    sock.on('error',function(err){
        var message=util.format('%s - %s',err.message,err.errno);
        console.warn('%s - %s',err.message,err.errno);
        _err[key]=err;
        if(res){
            send(res,1,message);
            res=null;
        }
    });
    sock.on('end',function(){
        sock.status='end';
        console.info('[%s]%s:%s - connection end',key,host,port);
    });
    sock.on('close',function(had_err){
        sockets[key]={'cache':sock.cache,'current':sock.current,'status':'close'};
        console.info('[%s]%s:%s - connection close, is_error:%s',key,host,port,had_err);
    });

    sock.on('data',function(chunk){
        sock.cache.push(chunk);
        if(sock.ondata){sock.ondata(chunk);sock.ondata=null;}
    });
};

function writeSocket(req, res) {
    var key=req.headers['socket-key'];
    var sock=sockets[key];
    //console.log('[write]headers:%s',util.inspect(req.headers));
    if(sock.status=='close'){
        return send(res,2,'socket closed');
    }
    req.on('data',function(chunk){
        sock.write(chunk);
        console.log('[write] %s bytes',chunk.length);
    });
    req.on('end',function(){
        err=_err[key];
        if(err){
            send(res,3,util.inspect(err));
        }else{
            send(res,0,'write success');
        }
    });
}
function readSocket(req, res) {
    var key=req.headers['socket-key'];
    var sock=sockets[key];
    if (sock.current==sock.cache.length){
        //currently no data available
        if(sock.status=='close'){
            res.statusCode=596;
            return res.end('socket closed(readSocket)');
        }
        sock.ondata=function(chunk){
            if(!res){
                //reader is gone,signal appspot to come back
                var url=urlparse(req.headers['callback-url']);
                var appreq=http.request({
                    hostname:url['hostname'],
                    port:url['port']||80,
                    path:url['path'],
                    method:'GET',
                    headers:{'socket-key':key}
                },function(appres){
                    if(appres.statusCode!=200){
                        console.warn('ondata request failed, key = %s',key);
                    }else{
                        console.log('ondata request success, key = %s',key);
                    }
                });
                appreq.end();
                console.warn('[%s]signaled',key);
            }else{
                res.writeHead(200,{'content-length':chunk.length,'content-type':'application/octet-stream'});
                res.end(chunk); res=null;
                sock.current++;
            }
        };
        setTimeout(function(){
            var sock=sockets[key];
            if(sock.status=='end'||sock.status=='close'){
                res.statusCode=597;
                return res.end('socket closed(timeout)');
            }
            if(res){
                //no data received in 5s
                res.statusCode=598;
                res.end('timeout 5s');res=null;
                console.warn('read socket timeout 5s');
            }
        },5000);
    }else{
        //flush available data
        res.writeHead(200,{'content-type':'application/octet-stream'})
        for(var i=sock.current;i<sock.cache.length;i++){
            res.write(sock.cache[i]);
        }
        sock.current=i;
        res.end();
    }
}
exports.handle=function(req,res){
    var method=req.method,key=req.headers['socket-key'];
    if(!key){
        res.statusCode=500;
        return res.end('key missing');
    }
    if (method=='PUT'){
        var host=req.body['target_host'];
        if (!host || host.indexOf(':')<0){
            res.statusCode=500;
            return res.end('connect host missing');
        }
        connectSocket(req,res);
    }else if(method=='GET'){
        readSocket(req,res);
    }else if(method=='POST'){
        writeSocket(req,res);
    }else{
        res.statusCode=500;
        res.end(method+' NOT SUPPORT');
    }
};
var x=0;
if(x==1){

    var headers={'Host':'localhost','socket-key':key,'Socket-Host':'www.google.com.hk:80'};
    var key=Date.now().toString(16)+''+(Math.random()*10).toString(16);
    var req=http.request({host:'localhost',port:80,method:'PUT',path:'/_socket',headers:headers}, function(res){
        console.log(res.headers);
    });
    req.end();
}
if(x==2){
    var chunk=''+
        'GET / HTTP/1.0\r\n'+
        'User-Agent: Wget/1.11.4\r\n'+
        'Accept: */*\r\n'+
        'Host: www.google.com.hk\r\n'+
        'Connection: Keep-Alive\r\n\r\n';
    var headers={'Host':'localhost','socket-key':key,'Content-Length':chunk.length};
    var req=http.request({host:'localhost',port:80,method:'POST',path:'/_socket',headers:headers}, function(res){
        console.log(res.headers);
    });
    req.end(chunk);
}
if(x==3){
    var headers={'Host':'localhost','socket-key':key};
    var req=http.request({host:'localhost',port:80,method:'GET',path:'/_socket',headers:headers}, function(res){
        res.on('data', function (chunk) {
            console.log(chunk.toString());
        });
        res.on('end',function(){
        });

    });
    req.end();
}
/**
    var sock=net.connect(8081,'localhost',function(){
        console.log('connected to server');
    });
    sock.on('error',function(err){
        console.warn('%s - %s',err.message,err.errno);
    });
    sock.on('close',function(had_err){
        console.warn('close - had_err:%s',had_err);
    });
    **/
