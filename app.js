/**
 * shiedman@gmail.com
 * main 
 */

var express = require('express')
  //, user = require('./routes/user')
  , http = require('http')
  , net = require('net')
  , path = require('path')
  , urlparse = require('url').parse
  , util =require('util');

var routes = require('./routes')
  , dir=require('./routes/directory')
  , httptask = require('./lib/httptask')
  , xunlei = require('./lib/xunlei')
  , baidu = require('./lib/baidu')
  , goagent = require('./lib/goagent')
  , proxy = require('./lib/proxy')
  , forward = require('./lib/forward');

var SERVER_PORT=process.env.PORT_NODEJS||process.env.PORT_WWW;
var logLevel='dev'
  , PORT=80
  , ROOT='d:/home';

if(SERVER_PORT){
    logLevel='tiny',PORT=SERVER_PORT;
    ROOT='/home/dotcloud/data';
    process.env.SERVER=SERVER_PORT;
    process.on('SIGTERM',function(){
        console.warn(Date.now()+':proxyServer is exiting....');
        process.exit(0);
    });
}

var app = express();

app.configure(function(){
  app.set('port', PORT);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  
  app.use(function(req,res,next){
      var user_agent=req.headers['user-agent'];
      if(user_agent&&user_agent.indexOf('Firefox')<0){
          res.send(404);res.end();
      }else{
          next();
      }
  });

//http://www.senchalabs.org/connect/middleware-logger.html
  app.use(express.logger(logLevel));

  app.use(xunlei.logRequest);
  app.use(baidu.logRequest);
  app.use(function(req,res,next){
      if(req.url.substring(0,4)=='http')proxy.handle(req,res); else next();
  });
  app.use('/aria2_jsonrpc',function (req,res,next){
      forward('localhost',6800,'/jsonrpc'+req.url.substring(1))(req,res);
  });

  app.use(express.favicon());
  app.use(express.bodyParser());
  //app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'bootstrap')));

  app.use(express.static(ROOT));
  app.use(dir.directory(ROOT));
  app.locals.pretty=true;
  setInterval(httptask.updateTask,30000);
});
//var auth=express.basicAuth('admin','supass');
//app.get('/', routes.index);
app.get('/tasks',httptask.viewTasks);
/**
app.get(/^\/_upload\/(.+)$/,function(req,res){
    try{
        //console.log(req.params[0]);
        var filepath=path.join(ROOT,req.params[0]);
        console.log(filepath);
        kuai.upload(filepath);
        console.log('dispatching to ',req.params[0]);
        res.send('uploading....');
    }catch(err){
        res.send('upload failed:',err.message);
    }
});
*/
app.post('/__jsonrpc',function(req,res){
    var method=req.body.method;
    var params=req.body.params;
    try{
        if(method=='xunlei.upload'){
            xunlei.upload(params.file);
        }else if(method=='baidu.upload'){
            baidu.upload(params.file);
        }else if(method=='httptask.deleteTask'){
            var ret=httptask.deleteTask(params.taskid);
            if(ret<0)throw  new Error(params.taskid+' not exists');
        }else if(method=='httptask.abortTask'){
            var ret=httptask.abortTask(params.taskid);
            if(ret<0)throw  new Error(params.taskid+' not exists');
        }else{
            throw new Error('method:'+method+' not exists');
        }
        res.json({jsonrpc:'2.0',id:1,result:'success'});
    }catch(err){
        res.json({jsonrpc:'2.0',id:1,error:{message:err.message}});
    }
});
app.post('/goagent',goagent.serve);

app.configure('development', function(){
  app.use(express.errorHandler());
});


var httpserver=http.createServer(app);
httpserver.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
httpserver.on('connect', function(req, cltSocket, head) {
    var srvUrl = urlparse('http://' + req.url);
    util.log('CONNECT: '+req.url);
    var srvSocket = net.connect(srvUrl.port, srvUrl.hostname, function() {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Node-Proxy\r\n\r\n');
        if(head&&head.length>0)srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
    });
    srvSocket.on('error',function (err){
        console.error(err);
    });
    //srvSocket.on('timeout',function(){
        //console.error('connection timeout!!!');
    //});
});
httpserver.on('clientError',function(err){
    util.log('clientError: '+err.message);
});
