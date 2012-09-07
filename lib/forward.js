var http=require('http');
var util=require('util');
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
var forward_port=process.env.PORT_PROXY||8080;
function forward(req,res,next){
    var url=req.url;
    if(req.method=='GET'){
        if(url=='/_file')redirect('localhost',forward_port,'/',req,res);
        else if(url=='_miru')redirect('miru-yame.dotcloud.com',35721,'/',req,res);
        else if(/^\/_upload\//.test(url))redirect('localhost',forward_port,req.url,req,res);
        else next();
    }else if(req.method=='POST'){
        if(url=='/goagent')redirect('localhost',forward_port,'/goagent',req,res);
        else next();
    }else{
        next();
    }
//app.get(/^\/_upload\//,function(req,res){
        //redirect('localhost',process.env.PORT_PROXY,req.url,req,res);
        //});

//app.get('/_file',function(req,res){
    //redirect('localhost',process.env.PORT_PROXY,'/',req,res);
//});
//app.get('/_miru',function(req,res){
    //redirect('miru-yame.dotcloud.com',35721,'/',req,res);
//});
//app.post('/',function(req,res){
    //redirect('localhost',process.env.PORT_PROXY,'/goagent',req,res);
//});


}
module.exports=function(host,port,path){
    return function(req,res){
        redirect(host,port,path||(req.originalUrl||req.url),req,res);
    };
};
