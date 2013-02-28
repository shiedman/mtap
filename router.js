/**
 * forward http proxy request to express.js server
 * or act as socks5 proxy
 */
var net = require('net');
var socks5=require('./socks5.js');
var PORT=process.env.PORT_WWW;

var HTTP_METHODS=['HEAD','GET','POST','PUT','DELETE','TRACE','OPTTIONS','CONNECT','PATCH'];
function _xor(buf){
	for (var i = 0 ; i < buf.length ; i++) {
		buf[i] = buf[i]^0x88
    }
}

function forwardHttp(client,firstChunk,reverse){
    if(!PORT){
        console.warn('[router] PORT_WWW not defined');
        client.end('HTTP/1.1 503 Proxy Service Unavailable\r\nServer: MTAP-ROUTER\r\n\r\n');
        return;
    }
    var connected=false
    var remote = net.connect(PORT,function () {
        connected=true;
        remote.write(firstChunk);
        remote.on('data', function (chunk) {
            if(reverse)_xor(chunk);
            if(!client.write(chunk))remote.pause();
        });
        remote.on('end', function () { 
            client.end(); 
            remote=null; 
        });
    });
    remote.on('error', function (err) {
        if (!connected) {
            console.warn('[router] connection to port:%s refused:\n\t%j',PORT,err);
            client.end('HTTP/1.1 503 Proxy Service Unavailable\r\nServer: MTAP-ROUTER\r\n\r\n');
        }else{
            console.warn('[router]remote error:\n\t%j',err);
            client.end();
        }
        remote=null;
    });
    client.on('data',function(chunk){
        if(reverse)_xor(chunk);
        remote.write(chunk); 
    });
    client.on('drain',function(){
        remote.resume();
    });
    client.on('end', function () {
        if (remote) { remote.destroy();}
    });
    client.on('error', function () {
        if (remote) { remote.destroy(); }
    });
}

/** socket server connection listener **/
function handshake(socket) { //'connection' listener
    socket.once('data',function _handshake(chunk){
        //connection.removeListener('data',_handshake);
        //is sock5 request?
        if(chunk[0]==0x05 && chunk.length==3){
            // i starts on 1, since we've read chunk 0 & 1 already
            for(var i=2,nmethods=chunk[1],methods=[];i<nmethods+2;i++){
                if(chunk[i]==0||chunk[i]==2){//only support noauth and user&pass auth
                    methods.push(chunk[i]);
                }
            }
            //valid socks5 handshake message
            if(methods.length==nmethods){
                socks5.handshake(socket,chunk);
                return;
            }
        }
        //is http request?
        for (var i=0;i<chunk.length-1;i++){
            //find first line
            if (chunk[i]==0x0d && chunk[i+1]==0x0a){
                var line=chunk.toString('utf-8',0,i);
                var parts=line.split(' ');
                var cmd=parts[0],path=parts[1],http_ver=parts[2];
                if (cmd && HTTP_METHODS.indexOf(cmd)>=0)
                    return forwardHttp(socket,chunk,false);
            }
        }
        //encrypted http request?
        _xor(chunk);
        for (var i=0;i<chunk.length-1;i++){
            //find first line
            if (chunk[i]==0x0d && chunk[i+1]==0x0a){
                var line=chunk.toString('utf-8',0,i);
                var parts=line.split(' ');
                var cmd=parts[0],path=parts[1],http_ver=parts[2];
                if (cmd && HTTP_METHODS.indexOf(cmd)>=0)
                    return forwardHttp(socket,chunk,true);
            }
        }
        //send back failed response of socks5's handshake as default
        socket.end(new Buffer('05FF','hex'));
        socket.destroy();
    });

}
function listen(port){
    var server = net.createServer(handshake);
    //var PORT=process.env.PORT_PROXY||8080;
    server.listen(port, function () {
        console.log('forwarder server listening at port ' + port);
    });
    server.on('error', function (err) {
        console.error(err);
    });
}

exports.listen=listen;
