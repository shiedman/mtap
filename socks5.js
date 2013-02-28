/**
 * references: 
 * https://gist.github.com/telamon/1127459
 * http://www.ietf.org/rfc/rfc1928.txt
 *
 * test:
 * curl http://www.google.se/ --socks5 1080 --proxy-user foo:bar
 */


var net = require('net');

var States = {
    CONNECTED:0,
    VERIFYING:1,
    READY:2,
    PROXY: 3
};
/*
* Authentication methods
************************
* o X'00' NO AUTHENTICATION REQUIRED
* o X'01' GSSAPI
* o X'02' USERNAME/PASSWORD
* o X'03' to X'7F' IANA ASSIGNED
* o X'80' to X'FE' RESERVED FOR PRIVATE METHODS
* o X'FF' NO ACCEPTABLE METHODS
*/
var AUTHENTICATION = {
    NOAUTH: 0x00,
    GSSAPI: 0x01,
    USERPASS: 0x02,
    NONE: 0xFF
};
/*
 * o  command type
 *    o  CONNECT X'01'
 *    o  BIND X'02'
 *    o  UDP ASSOCIATE X'03'
 */
var COMMAND_TYPE ={
    CONNECT: 0x01,
    BIND: 0x02,
    UDP_ASSOCIATE: 0x03
}
//var log = function() { console.log.apply(null,arguments); },
var log = function() {},
    SOCKS_VERSION = 5;
function handshake(socket,chunk){
        //SOCKS Version
    if(chunk[0]!= SOCKS_VERSION){
        console.error('handshake: wrong socks version: %d', chunk[0]);
        socket.end();
    }
    // Number of authentication methods
    var method_count= chunk[1];

    socket.auth_methods=[];
    // i starts on 1, since we've read chunk 0 & 1 already
    for(var i=2;i<method_count+2;i++){
        socket.auth_methods.push(chunk[i]);
    }
    log('Supported auth methods: %j', socket.auth_methods);

    var resp = new Buffer(2);
    resp[0] = SOCKS_VERSION;
    if(socket.auth_methods.indexOf(AUTHENTICATION.USERPASS)>=0){
        //socket.authUSERPASS = authUSERPASS.bind(socket);
        //socket.on('data',socket.authUSERPASS);
        socket.once('data',authUSERPASS.bind(socket));
        socket.pstate=States.VERIFYING;
        resp[1] = AUTHENTICATION.USERPASS;
        socket.write(resp);
    }else if(socket.auth_methods.indexOf(AUTHENTICATION.NOAUTH)>=0){
        //socket.handleRequest=handleRequest.bind(socket);
        //socket.on('data',socket.handleRequest);
        socket.once('data',handleRequest.bind(socket));
        socket.pstate=States.READY;
        resp[1] = AUTHENTICATION.NOAUTH;
        socket.write(resp);
    }else{
        resp[1]=AUTHENTICATION.NONE;
        socket.end(resp);
    }
}
/*
 *
 *    REQUEST:
 *       +----+------+----------+------+----------+
 *       |VER | ULEN | UNAME    | PLEN | PASSWD   |
 *       +----+------+----------+------+----------+
 *       | 1  | 1    | 1 to 255 | 1    | 1 to 255 |
 *       +----+------+----------+------+----------+
 *    REPLY:
 *       +----+--------+
 *       |VER | STATUS |
 *       +----+--------+
 *       | 1  | 1      |
 *       +----+--------+
 */
function authUSERPASS(chunk){
    //this.removeListener('data',this.authUSERPASS);
    // the current version of the subnegotiation of socks5
    var subnegotiation_ver=0x01;

    var resp = new Buffer(2);
    resp[0]=subnegotiation_ver;
    if(chunk[0] != subnegotiation_ver){
        this.end(resp); // Wrong auth version, closing connection.
        return;
    }
    var nameLength= chunk[1];
    var username= chunk.toString('utf8',2,2+nameLength);

    var passLength=chunk[2+nameLength];
    var password= chunk.toString('utf8',3+nameLength,3+nameLength+passLength);
    log('Authorizing: %s/%s',username,password);
    if(authorize(username,password)){
        this.pstate=States.READY;
        this.once('data',handleRequest.bind(this));
        //this.handleRequest=handleRequest.bind(this);
        //this.on('data',this.handleRequest);
        //0x00 indicates success
        resp[1]=0x00;
        this.write(resp);
        log('Accepted');
    }else{
        //status other than 0x00 indicates failure
        resp[1]=0xff;
        this.end(resp);
        log('Denied');
    }

}
function authorize(username,password){
    return true;
}
/*
 *
 *    REQUEST:
 *        +----+-----+-------+------+----------+----------+
 *        |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
 *        +----+-----+-------+------+----------+----------+
 *        | 1  |  1  | X'00' |  1   | Variable |    2     |
 *        +----+-----+-------+------+----------+----------+
 *          o  VER    protocol version: X'05'
 *          o  CMD
 *             o  CONNECT X'01'
 *             o  BIND X'02'
 *             o  UDP ASSOCIATE X'03'
 *          o  RSV    RESERVED
 *          o  ATYP   address type of following address
 *             o  IP V4 address: X'01'
 *             o  DOMAINNAME: X'03'
 *             o  IP V6 address: X'04'
 *          o  DST.ADDR       desired destination address
 *          o  DST.PORT desired destination port in network octet order
 *
 *    REPLY:
 *        +----+-----+-------+------+----------+----------+
 *        |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
 *        +----+-----+-------+------+----------+----------+
 *        | 1  |  1  | X'00' |  1   | Variable |    2     |
 *        +----+-----+-------+------+----------+----------+
 *          o  VER    protocol version: X'05'
 *          o  REP    Reply field:
 *             o  X'00' succeeded
 *             o  X'01' general SOCKS server failure
 *             o  X'02' connection not allowed by ruleset
 *             o  X'03' Network unreachable
 *             o  X'04' Host unreachable
 *             o  X'05' Connection refused
 *             o  X'06' TTL expired
 *             o  X'07' Command not supported
 *             o  X'08' Address type not supported
 *             o  X'09' to X'FF' unassigned
 *          o  RSV    RESERVED
 *          o  ATYP   address type of following address
 *
 *             o  IP V4 address: X'01'
 *             o  DOMAINNAME: X'03'
 *             o  IP V6 address: X'04'
 *          o  BND.ADDR       server bound address
 *          o  BND.PORT       server bound port in network octet order
 *
 */
function handleRequest(chunk){
    //this.removeListener('data',this.handleRequest);
    if(chunk[0] != SOCKS_VERSION){
        console.error('handshake: wrong socks version: %d', chunk[0]);
        chunk[1] = 0x01;
        this.end(chunk); // Wrong version.
        return;
    }
    var cmd=chunk[1], address=Address.parse(chunk,3);
    log('Request: type: %d -- to: %s:%s', cmd, address.address, address.port);

    if(cmd== COMMAND_TYPE.CONNECT){
        var remote =  net.connect(address.port,address.address,function(){
            remote._connected=true;
            chunk[1]=0x00;
            this.write(chunk);
            remote.pipe(this).pipe(remote);
        }.bind(this));
        remote.on('error',function(err){
            console.error('[socks5.js:212] failed to connect %j:\n\t%j',address,err);
            if(remote._connected){
                this.end();
            }else{
                chunk[1]=0x04;
                this.end(chunk);
            }
        }.bind(this));
        this.on('error',function(err){
            console.error('[%j]client error:\n\t%j',address,err);
        });
    }else{
        //command not suppported
        chunk[1]=0x07;
        this.end(chunk);
        console.warn('not suppport command type: %d',cmd);
    }
}
exports.handshake=handshake;


var Address = {
    IPv4: 0x01,
    DomainName: 0x03,
    IPv6: 0x04,

    parse: function(chunk,n){
        if(chunk[n] == this.IPv4){
            return {
                type:'IPv4',
                address:chunk[n+1]+'.'+chunk[n+2]+'.'+chunk[n+3]+'.'+chunk[n+4],
                port:chunk.readUInt16BE(n+5)
            };
        }else if(chunk[n] == this.DomainName){
            var namelength=chunk[n+1];
            return {
                type:'domainname',
                address:chunk.toString('utf8',n+2,n+2+namelength),
                port:chunk.readUInt16BE(n+2+namelength)
            };
        }else if(chunk[n] == this.IPv6){
            return {
                type:'IPv6',
                address:chunk.toString('hex',n+1, n+3)+':'+chunk.toString('hex',n+3,n+5)+':'+chunk.toString('hex',n+5,n+7)+':'+chunk.toString('hex',n+7,n+9)+':'+chunk.toString('hex',n+9,n+11)+':'+chunk.toString('hex',n+11,n+13)+':'+chunk.toString('hex',n+13,n+15)+':'+chunk.toString('hex',n+15,n+17),
                port:chunk.readUInt16BE(n+1+16)
            }
        }
    }
};
/**
function initProxy(){
    var resp = new Buffer(this.request.length);
    this.request.copy(resp);
    resp[1]=0x00;
    this.write(resp);
    this.proxy.on('data', function(data){
        this.write(data);
    }.bind(this));
    this.proxy.on('end', function(){
        this.end();
    }.bind(this));
    this.proxy.on('close', function(had_error){
        if(had_error)this.destroy();
    }.bind(this));

    this.on('data',function(data){
        this.proxy.write(data);
    }.bind(this));
}

function dump(chunk){
    console.log('dumping:');
    console.log(chunk.toString('utf8'));
}
*/
var clients = [];
function accept(socket){
    clients.push(socket);
    socket.pstate = States.CONNECTED;

    socket.on('end',function(){
        log('client disconnected');
        clients.splice(clients.indexOf(socket),1);
    });
    socket.once('data',function(chunk){
        handshake(socket,chunk);
    });
}
if(false){
var server= net.createServer(accept);
server.listen(process.env.PORT_OTHER||1080);
//var chunk=new Buffer('05010001FF0012FF1233','hex');//IPV4
//var host='www.google.com',chunk=new Buffer('\x05\x01\x00\x03\x00'+host+'\x00\x50'); chunk[4]=host.length;//domainname
//var chunk=new Buffer('0501000420010db885a308d313198a2e037073440050','hex');//IPV6
//var ad=Address.parse(chunk,3);
//log(ad);
//log('isIPV6:%s',net.isIPv6(ad.address));
/*
 *net.createServer(function(s){
 *    s.once('data',function(chunk){
 *        console.log(chunk.toString());
 *        s.write(chunk);
 *    });
 *}).listen(8000);
 */
}
