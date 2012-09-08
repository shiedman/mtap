/*
 ** shiedman (shiedman@gmail.com)
 **
 */
var util  = require('util');
var fs   = require('fs');
var events=require('events');
var path=require('path');

var aria2=new (require('./utilize.js').aria2)();

var tasklist=[];
var taskid=1;
function isPending(filepath){
    for (var i in tasklist){
        if(tasklist[i].file.path==filepath && 
                fs.existsSync(filepath)){;
            console.info('[already tasklist]'+filepath);
            return true;
        }
    }
    return false;
}
function Task(options,filepath,fileSize){
    tasklist.push(this);
    this.id=taskid++;
    this.file={name:path.basename(filepath),size:fileSize,path:filepath}
    this.options=options;
    this.downloaded=0;
    this.resumable=true;
    this.status=null;
    this.retries=5;
    this.info={speed:0,size:0,time:Date.now()};
    this.leftedTime=function(){
        if (this.info.speed==0)return '-';
        var t=(this.file.size-this.downloaded)/(1000*this.info.speed);
        t=t.toFixed(0);
        if (t>60){
            var sec=t%60;
            var minute=(t-sec)/60;
            return sec==0?minute:minute+'m'+sec;
        }
        return t;
    };
    this._emitter=new events.EventEmitter();
    this.on=function(evt,listener){
        this._emitter.on(evt,listener);
    };
    this.abort=function(){
        this._emitter.emit('abort');
        this.status=-1;
        console.log('abort:'+this.file.name);
        this._emitter.removeAllListeners('abort');
    };
    this.getStatus=function(){
        var msg='unknown';
      switch (this.status) {
        case 0:msg='done';break;
        case 1:msg='downloading';break;
        case 2:msg='uploading';break;
        case -1:msg='abort';break;
        case -2:msg='aria2';break;
        case -3:msg='failed';break;
      }
        return msg;
    };
    this.update=function(size,_status){
        this.downloaded+=size;
        this.status=_status||1;
        var t=Date.now()-this.info.time;
        if (t>=5000){
            this.info.speed=((this.info.size+size)/t).toFixed(0);
            this.info.size=0;
            this.info.time=Date.now();
        }else{
            this.info.size+=size;
        }
        if(this.downloaded==this.file.size)this.status=0;
    };
    //invoke aria2 with jsonrpc call
    this.resume=function(){
        var self=this;
        var headers=self.options['headers'];
        var arr=[];
        for(var k in headers){
            arr.push(k+': '+headers[k]);
        }
        var params={ 'out':self.file.name,'header':arr };
        aria2.addUri([self.options['url']],params,function(err,rs){
            if(err){
                console.error('failed to add url to aria2:'+self.options['url']);
                console.error('    '+err);
            }else if (rs.error){
                console.error('aria2 response error messag:'+rs.error);
            } else{
                self.status=-2;
                self.retries=0;
                util.log('added url to aria2:'+rs.result+'\n    '+self.options['url']);
            }
        });
    };
}
//function viewTasks(request,response,next){
function viewTasks(req,res){
    //var t=new Task(null,'fantacycty@KF[K-ON!!][BDRIP][1080P-10bit....rar',302320);
    //t.resumable=false;
    //t.downloaded=60223;
    //t.info.speed=44;
    res.render('tasks',{tasks:tasklist});
}
/**
function viewTasks1(request,response){
    //if (request.method!='GET' || request.url[0]!='/')return next();
    //console.log('request:',request.url);
    var msg='tasklist files.......\n\n';
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        msg+=t.file.name+'\n';
        var buf=new Buffer(70);buf.fill(' ');buf[68]=buf[69]=0x0a;
        buf.write((100*t.downloaded/t.file.size).toFixed(2)+'%',3);
        buf.write((t.downloaded/1024/1024).toFixed(2)+'M/'+(t.file.size/1024/1024).toFixed(2)+'M',14);
        buf.write(t.info.speed+'k',35);
        buf.write(t.leftedTime()+'s',44);
        buf.write(t.getStatus(),56);
        buf.write(t.retries+'',65);
        msg+=buf.toString();
    }
    var output=Buffer(msg);//unicode convert to utf-8
    response.writeHead(200, {'content-type':'text/plain;charset=utf-8','connection':'close','content-length':output.length});
    response.end(output);
}
*/
function updateTask(){
    var i=tasklist.length;
    while (i--){
        var task=tasklist[i];
        if ((task.status<0)&& task.resumable && task.retries>0){
            console.info('resume:'+task.file.name);
            task.retries--;
            task.resume();
        }
        if ((task.status>0) && Date.now()-task.info.time>30000){
            task.abort();
        }
        if (task.status==0 && Date.now()-task.info.time>86400000){
            util.log('clear task:'+task.file.name);
            tasklist.splice(i,1);
        }
    }
}
function deleteTask(id){
    if(!id)return -1;
    for(var i=tasklist.length-1;i>=0;i--){
        if(tasklist[i].id==id){
            if(tasklist[i].status>0)tasklist[i].abort();
            tasklist.splice(i,1);return 0;
        }
    }
    return -1;
}
function abortTask(id){
    if(!id)return -1;
    for(var i=tasklist.length-1;i>=0;i--){
        if(tasklist[i].id==id){
            if(tasklist[i].status>0)tasklist[i].abort();
            return 0;
        }
    }
    return -1;
}
//exports.isDownloading=isDownloading;
exports.isPending=isPending;
exports.Task=Task;
exports.viewTasks=viewTasks;
exports.updateTask=updateTask;
exports.deleteTask=deleteTask;
exports.abortTask=abortTask;
