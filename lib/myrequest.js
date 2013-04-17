var zlib=require('zlib'),
    request=require('request');

request.jar().__proto__.getCookie=function(url,name){
//defaultCookieJar.getCookie=function(url,name){
    var cookies=this.get({url:url});
    for (var i = 0, l = cookies.length; i < l; i ++) {
        var c = cookies[i];
        if(c.name==name)return c;
    }
}
/** charset decode settting **/
var iconv=null;
try{
    var _Iconv=require('iconv').Iconv;
    iconv={
        decode:function(buf,charset){
            var _convert = new _Iconv(charset, "UTF-8//TRANSLIT//IGNORE");
            return _convert.convert(buf).toString();
        }
    }
}catch(err){
    try{
        iconv=require('iconv-lite');
    }catch(err){
        console.warn('charset decode disabled');
    }
}
var defaultHeaders={
    'User-Agent':'Mozilla/5.0 (Ubuntu; rv:10.0) Gecko/20100101 Firefox/10.0',
    'Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    //'Referer':'http://www.google.com',
    'Accept-Encoding':'gzip' 
} 
/** the max running instance of request **/
var running=0,max=4,errors=0,pending=[];
function queue(uri,options,callback){
    if(running<max){
        running++;
        var params = request.initParams(uri, options, callback)
        params.callback=createRunner(params.options,params.callback);
        request.get(params.options,params.callback);
    }else{
        pending.push({uri:uri,options:options,callback:callback});
    }
}
function createRunner(options,callback){
    return function(err,res,body){
        running--;
        if(running<max){
            var next=pending.shift();
            if(next)queue(next.uri,next.options,next.callback);
        }
        if(err){
            errors++;
            if(errors>100){ pending=[]; }
            options.failed=options.failed||0;
            if(options.failed<3){
                options.failed++;
                console.log('[myrequest] - [%s] failed :%s',options.uri,options.failed);
                return queue(options.uri,options,callback);
            }
        }
        if(running==0){
            if(errors>100){
                console.error('[myrequest] - queue jobs broken, two many errors:%s',errors);
            }else{
                console.info('[myrequest] - all queue job done, errors:%s',errors);
            }
            errors=0;
        }
        if(callback)callback(err,res,body);
    }
}
function decodeResponse(callback,encoding){
    return function _decode(err,res,body){
        if (err && !Buffer.isBuffer(body))return callback(err,res,body);
        if (res.headers['content-encoding']){
            if(res.headers['content-encoding'].toLowerCase().trim()=='gzip'){
                return zlib.gunzip(body,function(zerr,buffer){
                    if(zerr)return _decode(zerr,res,buffer);
                    delete res.headers['content-encoding'];
                    _decode(null,res,buffer);
                });
            }
        }
        if(encoding!==null){
            var contentType = parseContentType(res.headers['content-type']);
            var charset=contentType.charset;
            if(contentType.mimeType && charset){
                body=decodeBuffer(body,charset);
            }else if (encoding!==undefined){
                body=decodeBuffer(body,encoding);
            }else if (contentType.mimeType && contentType.mimeType.match(/text|javascript|xml|json/)){
                body=body.toString();
            }
        }
        callback(err,res,body);
    };
}

function decodeBuffer(buffer,charset){
    if(!buffer)return '';
    if(charset.match(/utf-?8|ascii|utf16le|ucs2|binary$/i))return buffer.toString(charset);
    if(!iconv)return buffer.toString('binary');
    try{
        return iconv.decode(buffer,charset);
    }catch(err){
        console.error(err);
        return buffer.toString('binary');
    }
}

function parseContentType(str){
    if(!str)return {};
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
//var myrequest=request.defaults(defaultOptions,requester);
function defaults(options) {
  options=options||{};
  var cookiejar=options.jar||request.jar();
  if(!options.jar)options.jar=cookiejar;
  var def = function (method) {
    var d = function (uri, opts, callback) {
      var params = request.initParams(uri, opts, callback)
      for (var i in options) {
        if (params.options[i] === undefined) params.options[i] = options[i]
      }
      for (var i in defaultOptions) {
        if (params.options[i] === undefined) params.options[i] = defaultOptions[i]
      }
      if(!params.options.headers){
        params.options.headers=defaultHeaders;
      }else{
        var headers=params.options.headers;
        for(var i in defaultHeaders){
          if (headers[i] === undefined) headers[i] = defaultHeaders[i]
        }
      }
      if(params.callback){
        params.callback=decodeResponse(params.callback,params.options.encoding);
        params.options.encoding=null;
      }
      return method(params.options, params.callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.patch = def(request.patch)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  de.del = def(request.del)
  de.cookie = def(request.cookie)
  de.jar=request.jar
  de.defaultJar=function(){return cookiejar;}
  de.queue=def(queue)
  de.running=function(){return running;}
  return de
}

var myrequest=defaults();//, defaultCookieJar=myrequest.jar();
var defaultOptions={ }
//myrequest.defaultJar=function(){return defaultCookieJar;}
myrequest.defaults=defaults;
module.exports=myrequest;
