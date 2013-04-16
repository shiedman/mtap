/**
 * shiedman (shiedman@gmail.com)
 * main module
 */

//set timezone to +8000
process.env.TZ='Asia/Shanghai';
var express = require('express')
    , http = require('http')
    , net = require('net')
    , fs = require('fs')
    , path = require('path')
    , urlparse = require('url').parse
    , wrench;// delay loading

var ut=require('./lib/utility.js')
  , logger=ut.logger
  , dir=require('./lib/directory')
  , httptask = require('./lib/httptask')
  , goagent = require('./lib/goagent')
  , wallproxy = require('./lib/wallproxy')
  , proxy = require('./lib/proxy')
  , jsonrpc = require('./lib/jsonrpc')
  , forward = require('./lib/forward');

/** set concurrent sockets to 10 **/
http.globalAgent.maxSockets=10;
ut.ini.load();
var PORT=ut.env.PORT_WWW, ROOT=ut.env.ROOT_DIR,DOWNLOAD=ut.env.DOWNLOAD_DIR;
/** assume DOWNLOAD DIR is subdir of ROOT DIR **/
fs.exists(DOWNLOAD,function(exists){
    fs.exists(ROOT,function(exists){
        if(exists){
            fs.mkdir(DOWNLOAD);
        }else{
            fs.mkdir(ROOT,function(err){ fs.mkdir(DOWNLOAD); });
        }
    });
});
setTimeout(function(){
    console.log('Starting directory: ' + process.cwd());
    try {
        process.chdir(ROOT);
        console.log('New directory: ' + process.cwd());
    } catch (err) {
        console.log('chdir: ' + err);
    }
},5000);

if(PORT){
    //process.on('SIGINT',function (){ console.log(' Press Control-D to exit.');}); 
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
    setInterval(function(){ ut.ini.write();},600000);

    /** interval check in **/
    if(ut.ini.param('system')['auto_checkin']=='yes'){
        logger.info('auto check in every 10 mins');
        setInterval(function(){ jsonrpc.checkin(); },600000);
    }

    /** monitor download/upload httptask status every 30s **/
    setInterval(function(){ httptask.updateTask();},30000);
}


var admin=ut.ini.param('system');
var app = express();
/** express setting begin*********************/
/** view template settings **/
app.set('debug',!PORT);
app.set('views', path.join(__dirname,'views'));
app.set('view engine', 'jade');
/** sits behind proxy which forward http request **/
app.enable('trust proxy');

/** 
 * logger level : dev,tiny
 * http://www.senchalabs.org/connect/middleware-logger.html 
 * **/
if(app.get('debug')){
    app.use(express.logger('tiny'));
    app.locals.pretty = true;
}
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
//app.use(express.cookieParser());
//app.use(express.cookieSession());
//if(PORT)app.use(express.compress());

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

if(app.get('debug')){
    app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
}else{
    app.use(express.errorHandler());
}
/** express setting ends*********************/

app.post('/API/JSONRPC',function(req,res){
    var obj=req.body;
    try{
        var func=jsonrpc[obj.method];
        if(typeof func!='function') throw new Error('Method:'+obj.method+' not exists');
        var rtn=func.apply(null,obj.params);
        res.json({jsonrpc:'2.0',id:obj.id,result:rtn});
    }catch(err){
        console.warn(err.message);
        console.warn(err.stack);
        res.json({jsonrpc:'2.0',id:obj.id||null,error:{message:err.message}});
    }
});
app.post('/API/JSONRPC1',function(req,res){
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
        }else if(method=='httptask.addTask'){
            //params is the same format as aria2c input file
            rtn=httptask.queueDownload([proxy.download,params]);
        }else if(method=='httptask.pauseTask'){
            rtn=httptask.pauseTask(params.taskid);
        }else if(method=='httptask.abortTask'){
            rtn=httptask.abortTask(params.taskid);
        }else if(method=='httptask.listTask'){
            var tasks=httptask.listTask(params.status);
            return res.json({jsonrpc:'2.0',id:1,result:{'data':tasks}});
        }else if(method.search(/\.upload$/)>0){
            var func=site[method];
            if(typeof func!='function') throw new Error('upload:'+method+' not exists');
            httptask.queueUpload(func,params.file);
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


/** goagent request **/
app.post('/agentfetch',goagent.serve);
/** wallproxy request **/
app.post('/wallfetch',wallproxy.serve);
/** download/upload task listing **/
app.get('/tasks',httptask.viewTasks);
app.get('/_version',function(req,res){
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end(JSON.stringify(process.versions,null,2));
});
app.get('/_process',function(req,res){
    var cmd=process.platform=='win32'?'tasklist':'ps aux';
    var exec = require('child_process').exec;
    exec(cmd, function(err, stdout, stderr) {
        res.set('Content-Type','text/plain');
        if(err){ return res.send(500,err); }
        res.send(200,stdout);
    });
});
app.get('/proxy.log',function(req,res){
    var filepath=path.join(__dirname, 'proxy.log');
    res.set('Content-Type','text/plain; charset=utf-8');
    if(fs.existsSync(filepath)){
        res.sendfile(filepath);
    }else{
        res.send('proxy.log not found');
    }
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
    if(!wrench)wrench = require('wrench');
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

app.post('/_upload',function(req,res){
    var upload_dir=path.join(ut.env.ROOT_DIR,'uploads');
    if(!fs.existsSync(upload_dir))fs.mkdirSync(upload_dir);
    for(var k in req.files){
        var f=req.files[k];
        fout=fs.createWriteStream(path.join(upload_dir,f.name));
        fin=fs.createReadStream(f.path);
        fin.pipe(fout);
        logger.info('saving %s',f.name);
    }
    res.send('upload done\r\n');
});

/**
app.post('/xunlei/scan',function(req,res){
    try{
        var loginuser=req.body.loginuser,loginpass=req.body.loginpass,scantarget=req.body.scantarget;
        var valid=loginuser&&loginpass&&scantarget;
        if(!valid)throw new Error('loginuser & loginpass & scantarget missing');
        var scan=site['xunlei.scan'];
        scan(loginuser,loginpass,scantarget);
        res.send('scan begins....');
    }catch(err){
        console.warn(err);
        res.send('scan failed');
    }

});
app.post('/uptobox/download',function(req,res){
    try{
        var url=req.body.download_url;
        if(!url)return res.send('download_url not specified');
        var download=site['uptobox.download'];
        download(url);
        res.send('download begins:'+url);
    }catch(err){
        console.warn(err);
        res.send('download failed:'+url);
    }
});
app.post('/zippyshare/download',function(req,res){
    try{
        var url=req.body.download_url;
        if(!url)return res.send('download_url not specified');
        var download=site['zippyshare.download'];
        download(url);
        res.send('download begins:'+url);
    }catch(err){
        console.warn(err);
        res.send('download failed:'+url);
    }
});

app.post('/115/download',function(req,res){
    var download=site['115.download'];
    var params={
        username:req.body.username,
        password:req.body.password,
        pickcode:req.body.pickcode,
        url:'http://115.com/file/'+req.body.pickcode
    }
    try{
        httptask.queueDownload([download,params]);
        res.send('download begins:'+params.pickcode);
    }catch(err){
        console.warn(err);
        res.send('download failed:'+params.pickcode);
    }
});
*/
/** server is ready for http request**/
if(PORT){
    var tty=require('./tty/tty.js');
    var ttyapp=tty.createServer({
        express:app,
        shell:'bash',
        port: PORT
    });
    ttyapp.listen();
    var httpserver=ttyapp.server;
}else{
    PORT=80;
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
