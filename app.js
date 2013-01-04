/**
 * shiedman (shiedman@gmail.com)
 * main module
 */

var express = require('express')
  , http = require('http')
  , net = require('net')
  , fs = require('fs')
  , path = require('path')
  , wrench = require('wrench')
  , urlparse = require('url').parse;

var ut=require('./lib/utility.js')
  , logger=ut.logger
  , dir=require('./lib/directory')
  , httptask = require('./lib/httptask')
  , goagent = require('./lib/goagent')
  , wallproxy = require('./lib/wallproxy')
  , proxy = require('./lib/proxy')
  , _9gal = require('./lib/9gal.js') 
  , _115 = require('./lib/115.js') 
  , xunlei = require('./lib/xunlei')
  , vdisk = require('./lib/vdisk')
  , weibo = require('./lib/weibo_wap.js') 
  , uptobox = require('./lib/uptobox.js') 
  , baidu = require('./lib/baidu.js') 
  , ctdisk = require('./lib/ctdisk.js') 
  , forward = require('./lib/forward');

ut.ini.load();
ut.cookie.load();

var logLevel='dev' , PORT=80 , ROOT='d:/home';
var SERVER=process.env.PORT_WWW;
if(SERVER){
    logLevel='tiny',PORT=SERVER, ROOT='/home/dotcloud/data';
//process.on('SIGINT', function () { console.log(' Press Control-D to exit.'); }); 
    process.on('SIGTERM',function(){
    //process.on('exit',function(){
        logger.warn('Server is exiting....');
        ut.ini.write();
        process.exit(1);//if return 0,supervisor won't respawn proccess
    });
    fs.watchFile(ut.ini.file,function(cur,prev){
        if(ut.ini.writed>0){
            ut.ini.writed--;
        }else{
            logger.info('[iniconfig]changed: %s',ut.ini.file);
            ut.ini.load();
        }
    });
    //execute every 30mins
    setInterval(function(){
        ut.ini.write();
        ut.cookie.save();
    },1800000);

    //execute every 5mins
    if(process.env['CHECK_IN']){
        logger.info('check in every 5 mins');
        setInterval(function(){ _9gal.checkin(); _115.checkin();weibo.checkin(); },300000);
    }

    //execute every 30s
    setInterval(function(){ httptask.updateTask();},30000);
}


var app = express();
var admin={user:'',pass:''};
app.configure(function(){
  app.set('views', path.join(__dirname,'views'));
  app.set('view engine', 'jade');
  app.enable('trust proxy');
  app.locals.pretty=true; //##remove##

//http://www.senchalabs.org/connect/middleware-logger.html
  //app.use(express.logger(logLevel));

  //http proxy request
  app.use(function(req,res,next){
      if(req.url.substring(0,4)=='http'){proxy.handle(req,res); }
      else if(req.url.substring(0,6)=='/http_'){
          req.url=req.url.replace('/http_','http:/');
          proxy.handle(req,res);
      }
      else{ next();}
  });
  //aria2 jsonrpc request
  app.use('/jsonrpc_',function (req,res,next){
      forward('localhost',6800,'/jsonrpc'+req.url.substring(1))(req,res);
  });
  //aria2 rpc request
  app.use('/rpc_',function (req,res,next){
      forward('localhost',6800,'/rpc')(req,res);
  });
  app.use(express.favicon());
  app.use(express.bodyParser());
  //app.use(express.methodOverride());
  //app.use(express.cookieParser('nosecret'));
  //app.use(express.cookieSession());
  //app.use(express.session());

  //if(SERVER)app.use(express.compress());
  app.use(express.static(path.join(__dirname, 'bootstrap')));

  var adminFile=path.join(__dirname,'admin.info');
  var adminExist=fs.existsSync(adminFile);
  if(adminExist){ fs.readFile(adminFile,'utf-8',function(err,data){admin=JSON.parse(data);});}
  app.use(function(req,res,next){
      if(req.method=='POST'&&req.path=='/admin'){
          user=req.body.user0;if(user)user=user.trim();
          pass1=req.body.pass1;if(pass1)pass1=pass1.trim();
          pass2=req.body.pass2;if(pass2)pass2=pass2.trim();
          if(pass1!=pass2){
              return res.render('admin',{admin:admin,error:'password not matched !!!'});
          }
          admin.user=user;
          admin.pass=pass1;
          //console.log('user=%s,pass=%s',user,pass);
          fs.writeFile(adminFile,JSON.stringify(admin));
          adminExist=true;
          return res.redirect('/info');
      }
      //if(admin.user)req.user=admin.user;
      //setup admin user and pass
      if(!adminExist){
          res.render('admin',{admin:admin});
      }else{
          next();
      }
  });
  var auth=express.basicAuth(function(user,pass){
      return user==admin.user&&pass==admin.pass;
  },'y2proxy');
  app.use(function(req,res,next){
      var i=req.path.indexOf('/',1);
      if(i<0)i=req.path.length;
      var prefix=req.path.substring(0,i);
      if(['/info','/faq','/aria2','/admin','/tty','/delete'].indexOf(prefix)>=0 ){
          auth(req,res,next);
      }else{
          next();
      } 
  });

  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'static')));
  app.use(express.static(ROOT));

  //file listing
  app.use(dir.directory(ROOT));

});

app.post('/__jsonrpc',function(req,res){
    var method=req.body.method;
    var params=req.body.params;
    try{
        if(params.file){
            filepath=path.normalize(params.file);
            if(!fs.existsSync(filepath)) throw new Error('file not exists: '+filepath);
            var stat=fs.statSync(filepath);
            if(!stat.isFile())throw new Error('not a File: '+filepath);
        }
        var rtn=0;
        switch (method) {
            case 'xunlei.upload':
                httptask.queue(xunlei.upload,[params.file]);
                break;
            case 'vdisk.upload':
                httptask.queue(vdisk.upload,[params.file]);
                break;
            case '115.upload':
                httptask.queue(_115.upload,[params.file]);
                break;
            case 'uptobox.upload':
                httptask.queue(uptobox.upload,[params.file]);
                break;
            case 'baidu.upload':
                httptask.queue(baidu.upload,[params.file]);
                break;
            case 'ctdisk.upload':
                httptask.queue(ctdisk.upload,[params.file]);
                break;
            case 'httptask.deleteTask':
                rtn=httptask.deleteTask(params.taskid);
                break;
            case 'httptask.abortTask':
                rtn=httptask.abortTask(params.taskid);
                break;
            case 'httptask.listTask':
                var tasks=httptask.listTask(params.status);
                return res.json({jsonrpc:'2.0',id:1,result:{'data':tasks}});
            default:
                throw new Error('method:'+method+' not exists');
        }
        if(rtn<0)throw  new Error(params.taskid+' not exists');
        res.json({jsonrpc:'2.0',id:1,result:'success'});
    }catch(err){
        console.warn(err.message);
        console.warn(err.stack);
        res.json({jsonrpc:'2.0',id:1,error:{message:err.message}});
    }
});

app.configure('development', function(){
    app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
    //app.get('/dotcloud',dotcloud.get);//##remove##
    //app.post('/dotcloud',dotcloud.post);//##remove##
});
app.configure('production', function(){
    app.use(express.errorHandler());
});


app.get('/tasks',httptask.viewTasks);
app.post('/agentfetch',goagent.serve);
app.post('/wallfetch',wallproxy.serve);
app.get('/admin',function(req,res){
    res.render('admin',{admin:admin}); 
});

app.get('/faq',function(req,res){
    var ssh_host=process.env.DOTCLOUD_WWW_SSH_HOST||'demo-nana.dotcloud.com';
    var i = ssh_host.indexOf('.');
    var name=ssh_host.substring(0,i);
    var _info={'ssh_host':ssh_host,ssh_port:process.env.DOTCLOUD_WWW_SSH_PORT,appname:name};
    res.render('faq',{info:_info});
});

app.get('/info',function(req,res){
    var env={http_url:'http://localhost/',ssh_url:'localhost',proxy_url:'localhost'};
    if(SERVER){
        env={
            http_url:process.env.DOTCLOUD_WWW_HTTP_URL,
            ssh_url:process.env.DOTCLOUD_WWW_SSH_URL.replace('ssh://dotcloud@',''),
            proxy_url:process.env.DOTCLOUD_WWW_PROXY_URL.replace('tcp://','')
        }
    }
    env['ini']=ut.ini.serialize()
    res.render('info',{conf:env});
});
app.post('/info',function(req,res){
    var content=req.body.ini;
    if(content&&content.length>0){
        try{
            fs.writeFile(ut.ini.file,content);
            //ut.mergeIni(content);
        }catch(err){
            console.error(err);
        }
    }
    res.redirect('/info');

});
app.get(/^\/delete\/(.+)$/,function(req,res){
    try{
        var filename=req.params[0];
        var filepath=path.join(ROOT,filename);
        var fstat=fs.lstatSync(filepath);
        var href='/';
        if(fstat.isDirectory()){
            //fs.rmdirSync(filepath);
            if(filepath=='/home/dotcloud/data/downloads'){
                logger.warn("path is used for download service, can't be delete:/home/dotcloud/data/downloads");
                
                var _msg="'/home/dotcloud/data/downloads' is used for download service, not permit to delete it.";
                res.writeHead(500,{'Content-Type':'text/plain'});
                return res.end(_msg);
            }
            wrench.rmdirSyncRecursive(filepath);
            //href=path.join('/'+filename,'..');
            href=path.dirname('/'+filename);
            logger.info('delete dir: %s',filepath);
        }else if(fstat.isFile()){
            fs.unlinkSync(filepath);
            href=path.dirname('/'+filename);
            logger.info('delete file: %s',filepath);
        }
        res.redirect(encodeURI(href));
    }catch(err){
        logger.error(err);
        var msg='delete faild: '+err.message;
        res.writeHead(500,{'Content-Type':'text/plain;charset=utf-8','Content-Length':msg.length});
        res.end(msg);
    }
});

/*
app.get('/y2proxy_ini',function(req,res){
    var headers={};
    var proxy_response={filename:'y2proxy'};
    var userAgent=req.headers['user-agent'];
    if(userAgent)userAgent=userAgent.toLowerCase();
    if(userAgent.indexOf('msie')>=0 || userAgent.indexOf('chrome')>=0){
        headers['Content-Disposition']='attachment; filename='+encodeURIComponent(proxy_response.filename+'.ini');
    }else if(userAgent.indexOf('firefox')>=0){
        headers['Content-Disposition']='attachment; filename*="utf8\'\''+encodeURIComponent(proxy_response.filename+'.ini')+'"';
    } else{
        headers['Content-Disposition']='attachment; filename='+(proxy_response.filename+'.ini');
    }
    var s='[115]\r\nbober@163.com=121345\r\n\r\n[9gal]\r\nbaka=983jdka\r\n\r\n[xunlei]\r\nnh3@163.com=uh3dade\r\n\r\n[vdisk]\r\nyuri@163.com=jkea212cjkd\r\n'
    headers['Content-Length']=s.length;
    res.writeHead(200,headers);
    res.end(s);
});
*/

/** boot server **/
var httpserver=http.createServer(app);
httpserver.on('connect', function(req, cltSocket, head) {
    var srvUrl = urlparse('http://' + req.url);
    console.log('CONNECT: %s',req.url);
    var srvSocket = net.connect(srvUrl.port, srvUrl.hostname, function() {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: y2proxy\r\n\r\n');
        if(head&&head.length>0)srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
    });
    srvSocket.on('error',function (err){
        console.error(err);
    });
});
httpserver.on('clientError',function(err){
    console.error('clientError: %s',err.message);
});

if(SERVER){
    var tty=require('./tty/tty.js');
    var ttyapp=tty.createServer({
        app:app,
        server:httpserver,
        shell:'bash',
        port: PORT,
        cwd: '/home/dotcloud/data/downloads'
    });
    ttyapp.listen();
}else{
    httpserver.listen(PORT, function(){
      console.log("Express server listening on port %s",PORT);
    });
}

