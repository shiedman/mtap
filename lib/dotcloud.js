var spawn = require('child_process').spawn;
var processes=[];

function setup(confname,apikey){
    fs.readFile('/home/dotcloud/.dotcloud/dotcloud.tmpl','utf-8',function(err,data){
        if(err) throw err;
        fs.writeFile('/home/dotcloud/.dotcloud/'+confname,
            data.replace('${apikey}',apikey),
            'utf-8');
    });
}
var msg='firest\ndkdafd\nkdjeefk\n';
function list(apikey,callback){
    //callback(msg);
    var _env={};
    for (var k in process.env){_env[k]=process.env[k];}
    //_env['DOTCLOUD_CONFIG_FILE']=confname;
    var exec   = spawn('bash',['listapp',apikey],{ cwd:'/home/dotcloud/dev/dotcloud',env:_env });
    var ret='';
    exec.stdout.on('data', function (data) {ret+=data.toString();});
    exec.stderr.on('data', function (data) {ret+=data.toString();});
    exec.on('exit', function (code) {callback(ret)});
}
function push(req,res,html){
    var i=html.indexOf('${msg}');
    var part1=html.substring(0,i);
    var part2=html.substring(i+6);
    var build=req.session.build;
    var appname=req.session.appname;
    var apikey=req.session.apikey;
    var pid=req.session.pid;
    if(!build){
        res.status(500);req.send('appname not found');return;
    }
    if(pid && processes.indexOf(pid)>=0){
        console.warn('killing process: %s',pid);
        try{
        //process.kill(pid);
        spawn('bash',['/home/dotcloud/dev/dotcloud/killupload',pid]);

        }catch(err){console.error(err.message);}
        processes.splice(processes.indexOf(pid),1);
        delete req.session.pid;pid=null;
    }
    req.session.build=false;
    req.session.updateList=true;
    delete req.session.appname;
    var _env={};
    for (var k in process.env){_env[k]=process.env[k];}
    _env['apikey']=apikey;
    var exec   = spawn('bash',['upload',appname],{ cwd:'/home/dotcloud/dev/dotcloud',env:_env });
    pid=exec.pid;
    req.session.pid=pid;
    processes.push(pid);

    res.write(part1);
    var www='';
    var newline=false;
    function echo(data){
        var msg=data.toString();//.replace(/\x1b\[[^m]+m/g,'');
        var i=msg.indexOf('www:');
        if(i>=0)www=msg.substring(i+4).replace(/\s/g,'').replace(/\r*\n/,'');
        if(msg.length==1){
            //msg.replace('\x0d','.');
            newline=true;
            res.write('**');
        }else{
            if(newline){msg='\n'+msg;newline=false;}
            res.write(msg);
        }
    }
    exec.stdout.on('data', function (data) {
        echo(data);
        console.log(data.toString());
    });

    exec.stderr.on('data', function (data) {
        echo(data);
        console.log(data.toString());
    });

    exec.on('exit', function (code) {
        //delete req.session.pid;
        //processess.append(pid);
        var _i=processes.indexOf(pid);
        if(_i>=0)processes.splice(_i,1);
        if(code>0){
            //build failed
        }
        res.end(part2.replace(/\$\{www\}/g,www));
        console.log('exit with code:'+code);
        console.dir(req.session);
    });
}
function get(req,res){
    console.dir(req.session);
    console.dir(req.query);
    if(req.session.updateList || req.query.refresh){
        req.session.updateList=false;
        dotcloud.list(req.session.apikey,function(rs){
            req.session.applist=rs;
            console.dir(req.session);
            if(rs.indexOf('error:')>=0 && rs.indexOf('API key')>=0){
                var errkey=req.session.apikey;
                delete req.session.apikey;
                res.render('dotcloud',{conf:req.session,errkey:errkey});
            }else{
                res.render('dotcloud',{conf:req.session});
            }
        });
    }else{
        res.render('dotcloud',{conf:req.session});
    }
}
function post(req,res){
    console.log(req.body);
    if(req.body.apikey && /^\w{20}:\w{40}$/.test(req.body.apikey)){
        req.session.apikey=req.body.apikey;
        //req.session.confname=''+Date.now();
        req.session.updateList=true;
        res.redirect('/dotcloud');
    }else if(req.body.appname){
        //create dotcloud application
        req.session.build=true;
        req.session.appname=req.body.appname;
        //return res.render('dotcloud_push',req.session);
        res.render('dotcloud_push',{conf:req.session},function(err,html){
            try{
                dotcloud.push(req,res,html);
            }catch(err){
                console.log(err.message);
                console.log(err.stack);
            }
        });
    }
    //res.render('dotcloud',req.session);
}
exports.push=push;
exports.list=list;
exports.post=post;
exports.get=get;
if(false){
    var req={session:{build:true,appname:'gomi',apikey:'xV1afvDUso6Ano1rQDx3:155d53a9567815ae68f6621687cd8b02cc199b4f'}};
    var fs=require('fs');
    var res=fs.createWriteStream('build.log');
    var html="<html><body><pre>${msg}</pre></body></html>";
    building(req,res,html);
}
    function echo1(msg){
        var _pt=null;
        if(msg.indexOf('www:')>=0){
            _pt=100;
        }else if(msg.indexOf('Successfully deployed')>=0){
            _pt=95;
        }else if(msg.indexOf('Waiting for')>=0){
            _pt=90;
        }else if(msg.indexOf('Running postinstall')>=0){
            _pt=80;
        }else if(msg.indexOf('Build completed')>=0){
            _pt=70;
        }else if(msg.indexOf('phase4')>=0){
            _pt=60;
        }else if(msg.indexOf('phase3')>=0){
            _pt=50;
        }else if(msg.indexOf('phase2')>=0){
            _pt=40;
        }else if(msg.indexOf('phase1')>=0){
            _pt=30;
        }else if(msg.indexOf('snapshotsworker')>=0){
            _pt=20;
        }else if(msg.indexOf('total size')>=0){
            _pt=10;
        }
        
        if(_pt){
            var script='\n<script>document.getElementById("percentage").innerHTML="'+_pt+'%";</script>\n';
            if(_pt==100){
                script="\n<script>document.getElementById('title1').className='alert alert-warning'; document.getElementById('title1').innerHTML='<strong>site created:</strong>&nbsp;&nbsp;&nbsp;<a href=\"${www}\">${www}</a>';\n";
                var _i=msg.indexOf('www:');
                var www=msg.substring(_i+4).replace(/\s/g,'').replace(/\r*\n/,'');
                script=script.replace(/\$\{www\}/g,www);
            }
            msg+=script;
        }
        res.write(msg);
    }
function push1(req,res){
    //var i=html.indexOf('#$$#');
    //var part1=html.substring(0,i);
    //var part2=html.substring(i+4);
    var build=req.session.build;
    var appname=req.session.appname;
    if(!build){
        res.status(500);req.send('appname not found');return;
    }
    req.session.build=false;
    req.session.updateList=true;
    delete req.session.appname;
    var _env={};
    for (var k in process.env){_env[k]=process.env[k];}
    _env['apikey']=req.session.apikey;
    //_env['DOTCLOUD_CONFIG_FILE']=req.session.confname;
    //var exec   = spawn('ffmpeg',['-i','madoka02.mp4','-vn','-c:a','libmp3lame','-y','out.mp3'],{ cwd:'d:/home/doujin',env:_env });
    var exec   = spawn('bash',['upload',appname],{ cwd:'/home/dotcloud/dev/dotcloud',env:_env });

    //res.write(part1);
    exec.stdout.on('data', function (data) {
            res.write(data);
            console.log(data.toString());
            });

    exec.stderr.on('data', function (data) {
            res.write(data);
            console.log(data.toString());
            });

    exec.on('exit', function (code) {
            res.end();
            console.log('child process exited with code ' + code);
            });
}
