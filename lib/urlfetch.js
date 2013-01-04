var http=require('http'),
    https=require('https'),
    path=require('path'),
    fs=require('fs'),
    zlib=require('zlib'),
    util=require('util'),
    urlparse=require('url').parse;

var toughCookie=require('tough-cookie'),
    Cookie=toughCookie.Cookie,
    cookiejar=new toughCookie.CookieJar();

var Iconv=null;
try{Iconv=require('iconv').Iconv;}catch(err){console.warn('[iconv] %s',err);}

function decode(buffer,charset){
    if(!buffer)return '';
    if(charset.match(/^utf-?8$/i))return buffer.toString();
    if(!Iconv)return buffer.toString('binary');
    var s='';
    try{
        var convert = new Iconv(charset, "UTF-8//TRANSLIT//IGNORE");
        s = convert.convert(buffer).toString();
    }catch(err){
        console.error(err);
        s=buffer.toString('binary');
    }
    return s;
}

function nullcb(){}

function HttpClient(newCookie){
    this.cookiejar=newCookie?new toughCookie.CookieJar():cookiejar;
    this.referer='';
    this.encoding=null;
    this.follow_redirects=3;
}

HttpClient.prototype.build_header=function(method,url,_headers,payload,callback){
    var headers={
        'User-Agent':'Mozilla/5.0 (Windows NT 5.1; rv:16.0) Gecko/20100101 Firefox/16.0',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        //'Referer':'http://f.xunlei.com/channel',
        'Accept-Encoding':'gzip, deflate' //deflate sucks,some servers send raw compressed data plus header while others don't
    };
    if(method=='POST')headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';
    if(this.referer){headers['Referer']=this.referer;}
    if(_headers){
        for(var k in _headers){headers[k]=_headers[k];}
    }
    if(payload){
        headers['Content-Length']=payload.length;
    }else if (method=='POST'){
        headers['Content-Length']=0;
    }
    this.cookiejar.getCookies(url,function(err,cookies){
        if(cookies.length){
            var _cookies=cookies.map(function(c){return c.cookieString();}).join('; ');
            if('Cookie' in headers){
                _cookies=headers['Cookie']+'; '+_cookies;
            }
            headers['Cookie']=_cookies;
        }
        callback(headers);
    });
}
HttpClient.prototype.request=function(method,url,payload,_headers,callback){
    if(_headers instanceof Function){
        callback=_headers;_headers=null;
    }
    if(!callback)callback=nullcb;
    var self=this;
    self.build_header(method,url,_headers,payload,function(headers){
        self._request(method,url,payload,headers,function(err,res){
            if(err){return callback(err,null);}
            //---------------decode response text-------------
            var content_type = _parseContentType(res.headers['content-type']);
            var charset=content_type.charset;
            if(content_type.mimeType&& charset){
                res.content=decode(res.content,charset);
            }else if (self.encoding){
                res.content=decode(res.content,self.encoding);
            }
            //---------------set referer---------------------
            var mark=url.indexOf('?');
            self.referer=mark>0?url.substring(0,mark):url;
            //---------------parse cookie-------------------
            res.cookie={};
            var setcookies=res.headers['set-cookie'];
            if(setcookies){
                if(!Array.isArray(setcookies)){
                    setcookies=[setcookies];
                }
                setcookies.forEach(function(e){
                    var _cookie=Cookie.parse(e);
                    self.cookiejar.setCookie(_cookie,url,nullcb);
                    res.cookie[_cookie.key]=_cookie.value;
                });
            }
            //------------callback-------------------
            if(res.statusCode==302 && res.headers['location'] && self.follow_redirects>0){
                self.follow_redirects--;
                self.request('GET',res.headers['location'],null,null,callback);
            }else{
                callback(null,res);
            }

        });
    });
};
HttpClient.prototype._request=function(method,requestURL,payload,headers,callback){
    url=urlparse(requestURL);
    var options={
        method:method,
        hostname:url.hostname,
        path:url.path,
        headers:headers
    }
    if(url.port)options['port']=url.port;
    var conn=requestURL.indexOf('https')==0?https:http;
    var follow_redirects=this.follow_redirects
    var req=conn.request(options,function(res){
        if(res.statusCode==302&&follow_redirects>0)return callback(null,res);//redirect
        var caches=[],buffLen=0,
        receive = function(chunk){
            caches.push(chunk);
            buffLen+=chunk.length;
        },
        error = function(e){
            req.emit("error", e);
        },
        end = function(){
            if(callback){
                res.content=Buffer.concat(caches,buffLen);
                callback(null,res);
                callback=null;
            }
        },
        close=function(){
            if(callback){
                callback(new Error('server closed unexpectedly'),res);
                callback=null;
            }
        },

        unpack = function(type, res){
            var z = zlib["create"+type]();
            z.on("data", receive);
            z.on("error", error);
            z.on("end", end);
            z.on("close", close);
            res.pipe(z);
        };
        
        if(res.headers['content-encoding']){
            switch(res.headers['content-encoding'].toLowerCase().trim()){
                case "gzip":
                    return unpack("Gunzip", res);
                case "deflate":
                    return unpack("Inflate", res);
                    //return unpack("InflateRaw", res); //some server send compressed data without header
            }
        }
        res.on('data',receive);
        res.on('end',end);
        res.on('close',close);
    });
    req.on('error',function(err){
        if(callback){
            callback(err,null);
            callback=null;
        }
    });
    req.end(payload);
};


HttpClient.prototype.get=function(url,headers,callback){
    this.request('GET',url,null,headers,callback);
};
HttpClient.prototype.post=function(url,payload,headers,callback){
    this.request('POST',url,payload,headers,callback);
};

var cookieStore={
    file:path.join(__dirname,'cookies.json'),
    get:function(url,options,callback){
        cookiejar.getCookies(url,options,callback);
    },
    trace:function(){
        console.log(util.inspect(cookiejar.store.idx));
    },
    remove:function(domain){
        //cookiejar.store.removeCookies(domain,null,nullcb);
        delete cookiejar.store.idx[domain];
    },
    save:function(file){
        var cookies=cookiejar.store.idx;
        /*
         *for(var domain in cookies){
         *    for (var path in cookies[domain]){
         *        for(var key in cookies[domain][path]){
         *            var c=cookies[domain][path][key];
         *            cookies[domain][path][key]=new Buffer(JSON.stringify(c)).toString('base64');
         *        }
         *    }
         *}
         */
        if(!file)file=this.file;
        fs.writeFileSync(file,JSON.stringify(cookies,null,2));
        console.log('%s - [cookie]saved: %s',datetime(),file);
    },
    load:function(file){
        if(!file)file=this.file;
        if(!fs.existsSync(file)){console.info('%s - [cookie]file not exists:%s',datetime(),file);return;}
        this.file=file;
        fs.readFile(file,'utf-8',function(err,data){
            try{
            var cookies=JSON.parse(data);
            for(var domain in cookies){
                for (var path in cookies[domain]){
                    for(var key in cookies[domain][path]){
                        var c=cookies[domain][path][key];
                        cookies[domain][path][key]=Cookie.fromJSON(JSON.stringify(c));
                        //cookies[domain][path][key]=Cookie.fromJSON(new Buffer(c,'base64').toString());
                        //=Cookie.parse(cookies[domain][path][key]);
                    }
                }
            }
            cookiejar.store.idx=cookies;
            console.log('%s - [cookie]loaded: %s',datetime(),file);
            }catch(err){
            console.info('%s - [cookie]load failed: %s',datetime(),file);
            console.info(err);
            }
        });
    },
};

function _parseContentType(str){
    if(!str){
        return {};
    }
    var parts = str.split(";"),
        mimeType = parts.shift(),
        charset, chparts;

    for(var i=0, len = parts.length; i<len; i++){
        chparts = parts[i].split("=");
        if(chparts.length>1){
            if(chparts[0].trim().toLowerCase() == "charset"){
                charset = chparts[1];
            }
        }
    }

    return {
        mimeType: (mimeType || "").trim().toLowerCase(),
        charset: (charset || "").trim().toLowerCase() 
    }
}
exports.HttpClient=HttpClient;
exports.cookieStore=cookieStore;
exports.cookiejar=cookiejar;

if(false){
    var sess=new HttpClient(true);
    sess.get('http://www.example.com',function(err,res){
        if(err){return console.error(err);}
        console.log(res.headers);
        console.log('content length:%s',res.content.length);
        console.log('content type:%s',typeof res.content);
        //console.log(res.content);
    });
}
function _2n(n){return ('0'+n).slice(-2);}
function datetime(){
    //var d=new Date(Date.now()+28800000);//+8 hours
    var d=new Date();//+8 hours
    return d.getFullYear()+'-'+_2n(d.getMonth()+1)+'-'+_2n(d.getDate())+' '+_2n(d.getHours())+':'+_2n(d.getMinutes())+':'+_2n(d.getSeconds());
}
