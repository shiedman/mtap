var http=require('http'),
    path=require('path'),
    fs=require('fs'),
    qs=require('querystring'),
    util=require('util'),
    tracer=require('tracer'),
    urlparse=require('url').parse;

var logger=tracer.console({
    format:'{{timestamp}} * {{message}} [{{title}}]({{file}}:{{line}})',
    dateformat:'yyyy-mm-dd HH:MM:ss',
    transport : function(data) { 
        console.log(data.output);
        fs.open(path.join(__dirname,'../proxy.log'), 'a', 0666, function(e, id) {
            fs.write(id, data.output+"\n", null, 'utf-8', function() {
                fs.close(id, function() { });
            });
        });
    }
});
//string helper method---------
String.prototype.title= function(){
    return this.replace( /(^|\s|-)([a-z])/g , function(m,p1,p2){
        return p1+p2.toUpperCase();
    } );
};
String.prototype.format= function(dic){
    var s=this;
    for(var k in dic){
        str='${'+k+'}';
        i=s.indexOf(str);
        while(i>=0){
            s=s.replace(str,dic[k]);
            i=s.indexOf(str);
        }
    }
    return s;
};
//String.prototype.strip=function(){
    //return this.replace(/^\s+|\s+$/g,'');
//}
function capitalize(headers){
    var _headers={};
    for(var k in headers){
        _headers[k.title()]=headers[k];
    }
    return _headers;
}
//querystring,quote ! to %21
qs.__escape=qs.escape;
qs.escape=function(str){
    return this.__escape(str).replace('!','%21');
};


var _aria2={
    url:'http://localhost:6800/jsonrpc',
    addUri:function(downloadURL,options,callback){
        if(options instanceof Function){
            callback=options;options=null;
        }
        var params=[downloadURL];
        if(options)params.push(options);
        jsonRPC(this.url,'aria2.addUri',params,callback);
    },

};

function jsonRPC(endPoint,method,params,callback){
    if(typeof(method) !== 'string') throw("Invalid method supplied for jsonRPC request")
    //TODO:check params valid?
    var payload={'jsonrpc':'2.0','id':1,'method':method};
    if(params)payload['params']=params;
    var url=urlparse(endPoint);
    var buf=new Buffer(JSON.stringify(payload));
    var options={
        hostname:url['hostname'],
        port:url['port']||80,
        path:url['path'],
        method:'POST',
        headers:{
            'Content-Length':buf.length,'Connection':'close',
            'Content-Type':'application/json'
        }
    };

    var req = http.request(options, function(res) {
        var buflist=[];
        res.on('data', function (chunk) {
            buflist.push(chunk);
        });
        res.on('end',function(){
            var buf=Buffer.concat(buflist);
            var data=buf.toString();
            try{
                var js=JSON.parse(data);
                callback(null,js);
            }catch(err){
                callback(err,null);
            }
        });
    });

    req.on('error', function(err) {
        logger.error('[jsonRPC]' + err.message);
        callback(err,null);
    });
    req.end(buf);
}
//caesar
function mask(buf){
    var n=13;
    var skip=4;
    for(var i=skip;i<buf.length;i++){
        val=buf[i];
        if (val>=0x41 && val<=0x5a){//A-Z
            val=0x41+(val-0x41+n)%26;
        }else if (val >=0x61 && val <=0x7a){//a-z
            val=0x61+(val-0x61+n)%26;
        }
        buf[i]=val;
    }
}


function log(msg){
    //var prefix=dateFormat (new Date (Date.now()+_8hours), "%Y-%m-%d %H:%M:%S", true);
    fs.appendFile(path.join(__dirname,'../utility.log'),datetime(28800000)+' - '+msg+'\r\n',function(err){if(err)console.error(err);});
}

function _2n(n){return n<10?'0'+n:''+n;}
function datetime(offset){
    offset=offset||0;
    var d=new Date(Date.now()+offset);
        
    var h=d.getUTCHours(),m=d.getUTCMinutes(),s=d.getUTCSeconds();
    if(h<10)h='0'+h;
    if(m<10)m='0'+m;
    if(s<10)s='0'+s;
    return d.getUTCFullYear()+'-'+_2n(d.getUTCMonth()+1)+'-'+_2n(d.getUTCDate())+' '+_2n(d.getUTCHours())+':'+_2n(d.getUTCMinutes())+':'+_2n(d.getUTCSeconds());
}

var HOME=process.env.HOME||path.join(__dirname,'..');
var env={
    PORT_WWW:process.env.PORT_WWW||process.env.VCAP_APP_PORT||process.env.PORT,
    ROOT_DIR:path.join(HOME,'data'),
    DOWNLOAD_DIR:path.join(HOME,'data/downloads')
};
// ini reader 
var _Config = require('./iniconfig.js').IniConfig;
// initialize
var inifile=path.resolve(path.join(__dirname,'../config.ini'));
exports.ini=new _Config(inifile);
exports.cookie=require('./urlfetch.js').cookieStore;
exports.aria2=_aria2;
exports.capitalize=capitalize;
exports.jsonRPC=jsonRPC;
//exports.mask=mypass;
exports.logger=logger;
exports.log=log;
exports.datetime=datetime;
exports.env=env;

if(false){
    console.log(__filename);
    var _8hours=1000*60*60*8;
}
/**
function mypass(chunk){
    if(typeof(chunk)=='string')chunk=new Buffer(chunk);
    if(!Buffer.isBuffer(chunk)){logger.error('[mypass]%s is not Buffer',chunk);return;}
    var up   =[0x71,0x77,0x65,0x72,0x74,0x79,0x75];
    var down =[0x7a,0x78,0x63,0x76,0x62,0x6e,0x6d];
    for(var i=0;i<chunk.length;i++){
        var c=chunk[i];
        var j=up.indexOf(c);
        if(j>=0){
            c=down[j];
        }else{
            j=down.indexOf(c);
            if(j>=0)c=up[j];
        }
        chunk[i]=c;
    }
    return chunk.toString();
}
function xor(buf){
    for (var i = 0 ; i < buf.length ; i++) { buf[i] = buf[i]^0x88 }
}
function dateFormat (date, fstr, utc) {
  utc = utc ? 'getUTC' : 'get';
  return fstr.replace (/%[YmdHMS]/g, function (m) {
    switch (m) {
    case '%Y': return date[utc + 'FullYear'] (); // no leading zeros required
    case '%m': m = 1 + date[utc + 'Month'] (); break;
    case '%d': m = date[utc + 'Date'] (); break;
    case '%H': m = date[utc + 'Hours'] (); break;
    case '%M': m = date[utc + 'Minutes'] (); break;
    case '%S': m = date[utc + 'Seconds'] (); break;
    default: return m.slice (1); // unknown code, remove %
    }
    // add leading zero if required
    return ('0' + m).slice (-2);
  });
}
*/
