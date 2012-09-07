//reference:http://www.faqs.org/rfcs/rfc1928.html

var fs = require('fs');
var net = require('net');
var util=require('util');
var timeout = 30000;
var PORT=process.env.PORT_PROXY||8080;

var HTTP_METHODS=['HEAD','GET','POST','PUT','DELETE','TRACE','OPTTIONS','CONNECT','PATCH'];
function _xor(buf){
	for (var i = 0 ; i < buf.length ; i++) {
		buf[i] = buf[i]^0x88
    }
}
function inetNtoa(buf) {
    return buf[0] + '.' + buf[1] + '.' + buf[2] + '.' + buf[3];
}

function inetAton(ipStr) {
    var parts = ipStr.split('.');
    if (parts.length != 4) {
        return null;
    } else {
        var buf = new Buffer(4);
        for (var i = 0; i < 4; i++)
            buf[i] = +parts[i];
        return buf;
    }
}

function forward(connection,firstChunk,reverse){
    function _xor_(chunk){if(reverse)_xor(chunk);}
    var connected=false
    var remote = net.connect(process.env.PORT_WWW,function () {
        connected=true;
        _xor_(firstChunk); remote.write(firstChunk);
    });
    remote.on('data', function (chunk) { _xor_(chunk);connection.write(chunk); });
    remote.on('end', function () { connection.end(); });
    remote.on('error', function (err) {
        if (!connected) {
            console.warn('[server]remote connection refused:'+err.message);
            connection.destroy();
        }else{
            console.warn('[server]remote error:'+err.message);
            connection.end();
        }
    });
    connection.on('data',function(chunk){ _xor_(chunk);remote.write(chunk); });
    connection.on('end', function () {
        if (remote) { remote.destroy();}
    });
    connection.on('error', function () {
        if (remote) { remote.destroy(); }
    });
}


var server = net.createServer(function (connection) { //'connection' listener
    connection.on('data',function check_prot(chunk){
        connection.removeListener('data',check_prot);
        //sock5
        if(chunk[0]==5&&chunk[1]==1&&chunk[2]==0){
            //socks5
            connection.write('\x05\x00','binary');
            socks5(connection);
            return;
        }
        //http get post put
        var tmp=chunk;
        for (var i=0;i<tmp.length-1;i++){
            //find first line
            if (tmp[i]==0x0d && tmp[i+1]==0x0a){
            var line=tmp.toString('utf-8',0,i);
            var parts=line.split(' ');
            var cmd=parts[0],path=parts[1],http_ver=parts[2];
            if (cmd && HTTP_METHODS.indexOf(cmd)>=0) forward(connection,chunk,false);
            return;
            }
        }
        var tmp=new Buffer(chunk);
        _xor(tmp);
        for (var i=0;i<tmp.length-1;i++){
            //find first line
            if (tmp[i]==0x0d && tmp[i+1]==0x0a){
            var line=tmp.toString('utf-8',0,i);
            var parts=line.split(' ');
            var cmd=parts[0],path=parts[1],http_ver=parts[2];
            if (cmd && HTTP_METHODS.indexOf(cmd)>=0) forward(connection,chunk,true);
            return;
            }
        }
        connection.end();
        connection.destroy();

        //TODO:check if http connect
    });

});
function socks5(connection){

    var stage = 1, headerLength = 0, remote = null, cachedPieces = [],
        addrLen = 0, remoteAddr = null, remotePort = null, addrToSend = '';
    connection.on('data', function (data) {
        if(stage==5){
            if(!remote.write(data)){util.log('pause client');connection.pause();}return;
        }
        if (stage == 1) { // note this must be if, not else if!
            try {
                /**
				client's request:
				 +----+-----+-------+------+----------+----------+
                 |VER | CMD | RSV | ATYP | DST.ADDR | DST.PORT |
                 +----+-----+-------+------+----------+----------+
                 | 1 | 1 | X'00' | 1 | Variable | 2 |
                 +----+-----+-------+------+----------+----------+
				 */
                // cmd and addrtype
                var cmd = data[1];
                var addrtype = data[3];
                if (cmd != 1) {
                    console.warn('unsupported cmd: ' + cmd);
                    var reply = new Buffer('\x05\x07\x00\x01', 'binary');
                    connection.end(reply);
                    return;
                }
                if (addrtype == 3) {//ip4 address
                    addrLen = data[4];
                } else if (addrtype != 1) {//ip6 address
                    console.warn('unsupported addrtype: ' + addrtype);
                    connection.end();
                    return;
                }
                addrToSend = data.slice(3, 4).toString('binary');
                // read address and port
                if (addrtype == 1) {
                    remoteAddr = inetNtoa(data.slice(4, 8));
                    remotePort = data.readUInt16BE(8);
                    headerLength = 10;
                } else {
                    remoteAddr = data.slice(5, 5 + addrLen).toString('binary');
                    remotePort = data.readUInt16BE(5 + addrLen);
                    headerLength = 5 + addrLen + 2;
                }
				/**
				server's respone:
				+----+-----+-------+------+----------+----------+
				|VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
				+----+-----+-------+------+----------+----------+
				| 1  |  1  | X'00' |  1   | Variable |    2     |
				+----+-----+-------+------+----------+----------+
				BND.ADDR and BND.PORT 只用于UDP
		        */
                var buf = new Buffer(10);
                buf.write('\x05\x00\x00\x01', 0, 4, 'binary');
                buf.write('\x00\x00\x00\x00', 4, 4, 'binary');
                buf.writeInt16BE(remotePort, 8);
                connection.write(buf);
                // connect remote server
                remote = net.connect(remotePort, remoteAddr, function () {
                    util.log('[server]connecting ' + remoteAddr );
                    for (var i = 0; i < cachedPieces.length; i++) {
                        var piece = cachedPieces[i];
                        remote.write(piece);
                    }
                    cachedPieces = null; // save memory
                    stage = 5;
                });
                remote.on('data', function (data) {
                    if (!connection.write(data)) {
                        util.log('pause remote');
                        remote.pause();
                    }
                });
                remote.on('end', function () {
                    util.log('[server]disconnected:',remoteAddr);
                    connection.end();
                    console.log('[server]concurrent connections: ' + server.connections);
                });
                remote.on('error', function (err) {
                    connection.end();
                    connection.destroy();
                    console.warn('[server]remote error:'+err.message);
                    console.log('[server]concurrent connections: ' + server.connections);
                });
                remote.on('drain', function () { connection.resume(); });
                remote.setTimeout(timeout, function () {
                    connection.end();
                    remote.destroy();
                });
                if (data.length > headerLength) {
                    // make sure no data is lost
                    var buf = new Buffer(data.length - headerLength);
                    data.copy(buf, 0, headerLength);
                    cachedPieces.push(buf);
                    buf = null;
                }
                stage = 4;
            } catch (e) {
                // may encouter index out of range
                console.warn(e);
                connection.destroy();
                if (remote) {
                    remote.destroy();
                }
            }
        } else if (stage == 4) { // note this must be else if, not if!
            // remote server not connected
            // cache received data , make sure no data is lost
            cachedPieces.push(data);
        }
    });
    connection.on('end', function () {
        if (remote) { remote.destroy();}
    });
    connection.on('error', function () {
        if (remote) { remote.destroy(); }
    });
    connection.on('drain', function () {
        // calling resume() when remote not is connected will crash node.js
        if (remote && stage == 5) {
            remote.resume();
        }
    });
    connection.setTimeout(timeout, function () {
        if (remote) { remote.destroy(); }
        connection.destroy();
    })

}

server.listen(PORT, function () {
    console.log('server listening at port ' + PORT);
});
server.on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
        console.warn('Address in use, aborting');
    }
});
