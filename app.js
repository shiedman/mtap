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
  , site = require('./lib/site.js').site
  , forward = require('./lib/forward');

ut.ini.load();
/** create $HOME/data/download if not exists **/
fs.exists(ut.env.ROOT_DIR,function(exists){
    if(!exists){ fs.mkdir(ut.env.ROOT_DIR); }
});
fs.exists(ut.env.DOWNLOAD_DIR,function(exists){
    if(!exists){ setTimeout(function(){fs.mkdir(ut.env.DOWNLOAD_DIR);},3000);}
});
var PORT=80 , ROOT=ut.env.ROOT_DIR;
//dotcloud or appfog or heroku
var SERVER_PORT=ut.env.PORT_WWW;
if(SERVER_PORT){
    PORT=SERVER_PORT;
    //process.on('SIGINT', function () { console.log(' Press Control-D to exit.'); }); 
    process.on('SIGTERM',function(){
        logger.warn('Server is exiting....');
        ut.ini.write();
        process.exit(1);//if return 0,supervisor won't respawn proccess
    });
    /** watch config file: config.ini **/
    fs.watchFile(ut.ini.file,function(cur,prev){
        if(ut.ini.writed>0){
            //interval save, no reload file content
            ut.ini.writed--;
        }else{
            logger.info('[iniconfig]changed: %s',ut.ini.file);
            ut.ini.load();
            admin=ut.ini.param('system');
        }
    });
    /** save config.ini  every 30mins **/
    setInterval(function(){
        ut.ini.write();
        //ut.cookie.save();
    },600000);

    /** interval check in **/
    if(ut.ini.param('system')['auto_checkin']=='yes'){
        logger.info('auto check in every 10 mins');
        setInterval(function(){ site.checkin(); },600000);
    }

    /** monitor download/upload httptask status every 30s **/
    setInterval(function(){ httptask.updateTask();},30000);
}


var admin=ut.ini.param('system');
var app = express();
app.configure(function(){
    /** view template settings **/
    app.set('views', path.join(__dirname,'views'));
    app.set('view engine', 'jade');
    /** sits behind proxy which forward http request **/
    app.enable('trust proxy');

    /** 
     * logger level : dev,tiny
     * http://www.senchalabs.org/connect/middleware-logger.html 
     * **/
    if(process.env.NODE_ENV=='debug') app.use(express.logger('tiny'));

    /** 
     * http proxy request ,for example
     * http://www.example.com/index.html
     * https://www.example.com/index.html
     * /http_/www.example.com/index.html
     * /https_/www.example.com/index.html
     **/
    app.use(function(req,res,next){
        var path=req.url,prefix1=path.substring(0,7),prefix2=path.substring(0,8);
        if(prefix1=='http://' || prefix2=='https://'){
            proxy.handle(req,res);
        } else if(prefix1=='/http_/'){
            req.url='http://'+path.substring(prefix1.length);
            proxy.handle(req,res);
        } else if(prefix2=='/https_/'){
            req.url='https://'+path.substring(prefix2.length);
            proxy.handle(req,res);
        } else { 
            next();
        }
    });
    /** forward jsonrpc request to aria2c **/
    app.use('/jsonrpc_',function (req,res,next){
        forward('localhost',6800,'/jsonrpc'+req.url.substring(1))(req,res);
    });
    /** forward rpc request to aria2c **/
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

    /** server boostrap static css/img/javascript files **/
    app.use(express.static(path.join(__dirname, 'bootstrap')));

    /** setup admin user and pass when first access the site**/
    app.use(function(req,res,next){
        if(req.method=='POST'&&req.path=='/admin'){
            user=req.body.user0;if(user)user=user.trim();
            pass1=req.body.pass1;if(pass1)pass1=pass1.trim();
            pass2=req.body.pass2;if(pass2)pass2=pass2.trim();
            if(pass1!=pass2){
                return res.render('admin',{admin:admin,error:'password not matched !!!'});
            }
            admin=ut.ini.param('system');
            admin.user=user;
            admin.pass=pass1;
            ut.ini.write();
            return res.redirect('/info');
        }
        if(req.method=='GET'&&req.path=='/admin'){
            return res.render('admin',{admin:admin}); 
        }
        if(admin.user && admin.pass){
            next();
        }else{
            res.render('admin',{admin:admin});
        }
    });
    /** basic authen user **/
    var auth=express.basicAuth(function(user,pass){
        return user==admin.user&&pass==admin.pass;
    },'more than another proxy');
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
    /** server static files **/
    app.use(express.static(path.join(__dirname, 'static')));
    app.use(express.static(ROOT));

    /** file listing **/
    app.use(dir.directory(ROOT));

});

app.post('/API/JSONRPC',function(req,res){
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
        if(method=='httptask.deleteTask'){
            rtn=httptask.deleteTask(params.taskid);
        }else if(method=='httptask.abortTask'){
            rtn=httptask.abortTask(params.taskid);
        }else if(method=='httptask.listTask'){
            var tasks=httptask.listTask(params.status);
            return res.json({jsonrpc:'2.0',id:1,result:{'data':tasks}});
        }else if(method.search(/\.upload$/)>0){
            var func=site[method];
            if(typeof func!='function') throw new Error('upload:'+method+' not exists');
            httptask.queue(func,[params.file]);
        }else{
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
});
app.configure('production', function(){
    app.use(express.errorHandler());
});

/** goagent request **/
app.post('/agentfetch',goagent.serve);
/** wallproxy request **/
app.post('/wallfetch',wallproxy.serve);
/** download/upload task listing **/
app.get('/tasks',httptask.viewTasks);
app.get('/_versions',function(req,res){
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end(JSON.stringify(process.versions,null,2));
});

app.get('/faq',function(req,res){
    var ssh_host=process.env.DOTCLOUD_WWW_SSH_HOST||'demo-nana.dotcloud.com';
    var i = ssh_host.indexOf('.'),name=ssh_host.substring(0,i);
    var _info={'ssh_host':ssh_host,ssh_port:process.env.DOTCLOUD_WWW_SSH_PORT,appname:name,'download_dir':ut.env.DOWNLOAD_DIR};
    res.render('faq',{info:_info});
});

app.get('/info/demo.ini',function(req,res){
    var demo=path.resolve(path.join(__dirname,'config.demo.ini'));
    try{
        var msg=fs.readFileSync(demo);
        res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Length':msg.length});
        res.end(msg);
    }catch(err){
        res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
        res.end('failed to read demo file:\n'+err.message);
    }
});
app.get('/info',function(req,res){
    var http_url=process.env.DOTCLOUD_WWW_HTTP_URL||'http://localhost';
    var ssh_url=process.env.DOTCLOUD_WWW_SSH_URL||'localhost';
    var proxy_url=process.env.DOTCLOUD_WWW_PROXY_URL||'localhost';
    var env={
        http_url:http_url,
        ssh_url:ssh_url.replace('ssh://dotcloud@',''),
        proxy_url:proxy_url.replace('tcp://','')
    };
    var msg='; name: 帐号id\r\n; pass: 密码\r\n; ntime/count: 程序计数用，勿修改\r\n';
    env['ini']=msg+ut.ini.serialize();
    res.render('info',{conf:env});
});
app.post('/info',function(req,res){
    var content=req.body.ini;
    if(content&&content.length>0){
        try{
            fs.writeFile(ut.ini.file,content);
        }catch(err){
            console.error(err);
        }
    }
    res.redirect('/');
});
app.get(/^\/delete\/(.+)$/,function(req,res){
    try{
        var filename=req.params[0];
        var filepath=path.join(ROOT,filename);
        var fstat=fs.lstatSync(filepath);
        var href='/';
        if(fstat.isDirectory()){
            if(filepath==ut.env.DOWNLOAD_DIR){
                var __msg=filepath+" is used for download service, not permit to delete it.";
                logger.warn(__msg);
                res.writeHead(500,{'Content-Type':'text/plain'});
                return res.end(__msg);
            }
            wrench.rmdirSyncRecursive(filepath);
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
        res.writeHead(500,{'Content-Type':'text/plain;charset=utf-8'});
        res.end('delete faild: '+err.message);
    }
});


/** server is ready for http request**/
if(SERVER_PORT){
    var tty=require('./tty/tty.js');
    var ttyapp=tty.createServer({
        express:app,
        shell:'bash',
        port: PORT
    });
    ttyapp.listen();
    var httpserver=ttyapp.server;
}else{
    var httpserver=http.createServer(app);
    httpserver.listen(PORT, function(){
      console.log("Express server listening on port %s",PORT);
    });
}

httpserver.on('connect', function(req, cltSocket, head) {
    var srvUrl = urlparse('http://' + req.url);
    console.log('CONNECT: %s',req.url);
    var srvSocket = net.connect(srvUrl.port, srvUrl.hostname, function() {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: mtap\r\n\r\n');
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
if(process.env.PORT_PROXY){
    var forwardServer=require('./router.js');
    forwardServer.listen(process.env.PORT_PROXY);
}
