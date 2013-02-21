var http=require('http'),
    util=require('util');
function redirect(host,port,path,request,response){
    //delete request.headers['host'];
    var options={host:host,port:port,path:path,method:request.method,headers:request.headers};
    var proxy_request = http.request(options,function(proxy_response){
        response.writeHead(proxy_response.statusCode, proxy_response.headers    );
        proxy_response.pipe(response);
    });
    proxy_request.on('error',function(err){
        util.error('ERROR: '+request.url);
        util.error('    [REQUEST]:'+err.message);
        err.done=true;
        response.statusCode=500;
        response.end();
    });
    request.pipe(proxy_request);
}
module.exports=function(host,port,path){
    return function(req,res){
        redirect(host,port,path||(req.originalUrl||req.url),req,res);
    };
};
