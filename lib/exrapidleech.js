/*
 ** shiedman (shiedman@gmail.com)
 ** http://www.exrapidleech.info
 */
var http=require('http'),
    fs=require('fs'),
    urlparse  = require('url').parse;

var ut=require('./utility.js');

exports.handle=function(request, response) {
    if ('proxy-connection' in request.headers){
        request.headers['connection']=request.headers['proxy-connection'];
        delete request.headers['proxy-connection'];
    }
    var length=request.headers['content-length']||0;

	var url=urlparse(request.url);
    var options={
        hostname:url['hostname'],
        port:url['port']||80,
        path:url['path'],
        method:request.method,
        headers:ut.capitalize(request.headers),
    };

    var proxy_request = http.request(options,function(proxy_response){
        if(proxy_response.statusCode!=200 || length<500){
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
            proxy_response.pipe(response);
        }else{
            var filepath='/home/dotcloud/data/exrapidleech.html';
            var file=fs.createWriteStream(filepath);
            proxy_response.pipe(file);
            var msg='exrapidleech is downloading file, waiting .....';
            response.writeHead(200,{'Content-Type':'text/plain','Content-Length':msg.length});
            response.end(msg);
        }
    });
    request.pipe(proxy_request);
    proxy_request.setTimeout(30000,function(){
        proxy_request.abort();
        response.end();
        console.info('[timeout:30s]'+request.url);
    });
    proxy_request.on('error',function(err){
        console.error('ERROR: '+request.url);
        console.error('    [REQUEST]:'+err.message);
        response.statusCode=500;
        response.end();
    });
    
};
