#!/opt/node/bin/node
var http=require('http');
var path=require('path');
var urlparse=require('url').parse;

var PORT=process.env.PORT_NODEJS||(process.env.PORT_WWW||80);

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


//var SERVER=['baidu','xunlei'];
//var upload_url='http://otaku-yaru.dotcloud.com/__jsonrpc';
var upload_url='http://localhost:'+PORT+'/__jsonrpc';
function upload(filepath,method){
    if(!filepath)throw('filepath is emty');
    //if(SERVER.indexOf(type)<0)throw('not support upload type:'+type);
    var params={file:filepath};
    jsonRPC(upload_url,method,params,function(err,json){
        if(err){console.error('failed to invoke remote jsonrpc:'+err.message);return;}
        if(json.error){
            console.error('upload failed:'+json.error.message);
        }else{
            console.info('uploading file:'+filepath);
        }
    });
}
function deleteTask(id){
    jsonRPC(upload_url,'httptask.deleteTask',{taskid:id},function(err,json){
        if(err){console.error('failed to invoke remote jsonrpc:'+err.message);return;}
        if(json.error){
            console.error('delete failed:'+json.error.message);
        }else{
            console.info('deleted task:'+id);
        }
    });
}
function abortTask(id){
    jsonRPC(upload_url,'httptask.abortTask',{taskid:id},function(err,json){
        if(err){console.error('failed to invoke remote jsonrpc:'+err.message);return;}
        if(json.error){
            console.error('abort failed:'+json.error.message);
        }else{
            console.info('abort task:'+id);
        }
    });
}
function listTask(stype){
    jsonRPC(upload_url,'httptask.listTask',{type:stype},function(err,json){
        if(err){console.error('failed to invoke remote jsonrpc:'+err.message);return;}
        if(json.error){
            console.error('abort failed:'+json.error.message);
        }else{
            var list=json.result.data;
            console.log('*********************************************');
            if(!list||list.length==0){
                console.log('currently no active tasks');
            }
            for(var i=0;i<list.length;i++){
                console.log(list[i]);
                console.log('==============================================');
            }
        }
    });
}

//deleteTask(1);
var len=process.argv.length;
var action=process.argv[2];
var params=process.argv[3];
if(len<4 && 'ls'!=action){console.log('need more params');return;}
if('del'==action){
    deleteTask(parseInt(params));
}else if('abort'==action){
    abortTask(parseInt(params));
}else if('ls'==action){
    if(!params)params='0';
    listTask(parseInt(params));
}else if(/\.upload$/.test(action)){
    var file=path.resolve(process.argv[3]);
    upload(file,action);
}else{
    console.log('unknow parameters');
}
