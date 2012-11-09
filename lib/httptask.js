/*
 ** shiedman (shiedman@gmail.com)
 **
 */
var util  = require('util');
var fs   = require('fs');
var events=require('events');
var path=require('path');

var aria2=require('./utility.js').aria2;

var KB = 1024; // Kilobyte
var MB = 1024 * KB; // Megabyte
var GB = 1024 * MB; // Gigabyte

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
var uploadlist=[];
function queue(func,params){
    if(!util.isArray(params)){console.log(params+' is not array');return;}
    for(var i=0;i<uploadlist.length;i++){
        var u=uploadlist[i];
        if(u[0]==func && u[1].length==params.length){
            var j=0;
            for(;u[1][j]==params[j]&&j<params.length;j++);
            if(j==params.length){
                console.info('func:'+func.name+',params:'+util.inspect(params)+' existed!');
                return;
            }
        }
    }
    uploadlist.push([func,params]);
    //updateTask();
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
    this.update=function(size,_status){
        this.downloaded+=size;
        if(this.downloaded>this.file.size)this.downloaded=this.file.size;
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
    this.leftedTime=function(){
        if (this.info.speed==0)return '-.-';
        //var t=(this.file.size-this.downloaded)/(1000*this.info.speed);
        //t=t.toFixed(0);
        //if (t>60){
            //var sec=t%60;
            //var minute=(t-sec)/60;
            //return sec==0?minute:minute+'m'+sec;
        //}
        //return t;
        var seconds=(this.file.size-this.downloaded)/(1000*this.info.speed);
        seconds=seconds.toFixed(0);
        var hour = seconds >= 3600  ? Math.round(seconds / 3600) : 0;
        var remain = seconds % 3600;
        var min = remain >= 60 ? Math.round(remain / 60) : 0;
        remain = remain % 60;
        return hour > 99 ? '大于100小时' : (hour > 0 ? (hour < 10 ? '0'+hour : hour) : '00')+':'+(min > 0 ? (min < 10 ? '0'+min : min) : '00')+':'+(remain > 0 ? (remain < 10 ? '0'+remain : remain) : '00');

    };
    this.getFileSize=function(size){
        if(!size)size=this.file.size;
        return size < KB ? size+'B' : size < MB ? (size / KB).toFixed(2)+'K' : size < GB ? (size / MB).toFixed(2)+'M' : (size / GB).toFixed(2)+'G';

    };
}
Task.prototype.toString=function(){
    return this.id+'. '+this.file.name+'\n'+this.getStatus()+'\t'+this.leftedTime()+'\t'+this.info.speed+'k/s\t'+this.getFileSize(this.downloaded)+'/'+this.getFileSize();
}
function viewTasks(req,res){
    var todo=[],done=[];
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if(t.status==0)done.push(t);
        else todo.push(t);
    }
    todo.sort(function(a,b){return b.status-a.status;});
    res.render('tasks',{actives:todo,finishes:done});
}
function updateTask(){
    var i=tasklist.length;
    var uploading=0;
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
        if (task.status<=0 && Date.now()-task.info.time>43200000){
            util.log('clear task:'+task.file.name);
            tasklist.splice(i,1);
        }
        if(task.status==2)uploading++;
    }
    if(uploading==0&&uploadlist.length>0){
        var u=uploadlist.shift();
        try{
            u[0].apply(null,u[1]);
        }catch(err){
            console.error(err.message);
            console.error(err.stack);
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

function listTask(stype){
    var todo=[],done=[];
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if(t.status==0)done.push(t.toString());
        else todo.push(t.toString());
    }
    //todo.sort(function(a,b){return b.status-a.status;});
    return stype?done:todo;
}
//exports.isDownloading=isDownloading;
exports.isPending=isPending;
exports.Task=Task;
exports.viewTasks=viewTasks;
exports.updateTask=updateTask;
exports.deleteTask=deleteTask;
exports.abortTask=abortTask;
exports.queue=queue;
exports.listTask=listTask;
