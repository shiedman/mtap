var http=require('http'),
    urlparse=require('url').parse;

var PORT_RPC=process.env.PORT_RPC;
var aria2=function(url){
    this.url=url;
    if(!this.url){
        this.url='http://localhost:6800/jsonrpc';
        //this.url='http://tori-shiedman.dotcloud.com:10731/jsonrpc';
        //if (process.env.PORT_RPC)this.url='http://localhost:'+process.env.PORT_RPC+'/jsonrpc';
    }
    this.addUri=function(urls,options,callback){
        if(options&&!callback){
            callback=options;
            options=null;
        }
        var params=[urls];
        if(options)params.push(options);
        //var jsObject={'jsonrpc':'2.0','id':1,'method':'aria2.addUri', 'params':params};
        //var jsString=JSON.stringify(jsObject);
        jsonRPC(this.url,'aria2.addUri',params,callback);
    };

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
        res.on('data', function (chunk) {
            var data=chunk.toString();
            try{
                var js=JSON.parse(data);
                callback(null,js);
            }catch(err){
                callback(err,null);
            }
            req.abort();
        });
    });

    req.on('error', function(err) {
        console.log('problem with request: ' + err.message);
        callback(err,null);
    });
    req.end(buf);
}
String.prototype.title= function(){
    return this.replace( /(^|\s|-)([a-z])/g , function(m,p1,p2){
        return p1+p2.toUpperCase();
    } );
};
String.prototype.format= function(dic){
    var s=this;
    for(var k in dic){
        str='{'+k+'}';
        while(s.indexOf(str)>=0)
            s=s.replace(str,dic[k]);
    }
    return s;
};
String.prototype.strip=function(){
    return this.replace(/^\s+|\s+$/g,'');
}
function capitalize(headers){
    var _headers={};
    for(var k in headers){
        _headers[k.title()]=headers[k];
    }
    return _headers;
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
function _xor(buf){
    for (var i = 0 ; i < buf.length ; i++) { buf[i] = buf[i]^0x88 }
}

var _up   =[0x71,0x77,0x65,0x72,0x74,0x79,0x75];
var _down =[0x7a,0x78,0x63,0x76,0x62,0x6e,0x6d];
function mypass(chunk){
    if(typeof(chunk)=='string')chunk=new Buffer(chunk);
    if(!Buffer.isBuffer(chunk)){console.error('%s is not Buffer',chunk);return;}
    for(var i=0;i<chunk.length;i++){
        var c=chunk[i];
        var j=_up.indexOf(c);
        if(j>=0){
            c=_down[j];
        }else{
            j=_down.indexOf(c);
            if(j>=0)c=_up[j];
        }
        chunk[i]=c;
    }
    return chunk.toString();
}


exports.aria2=aria2;
exports.capitalize=capitalize;
exports.jsonRPC=jsonRPC;
exports.mask=mypass;
