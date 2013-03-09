/*
 ** shiedman (shiedman@gmail.com)
 **
 */
var util  = require('util'),
    fs   = require('fs'),
    events=require('events'),
    path=require('path');

//var downloader=require('./downloader.js');
var ut=require('./utility.js'),
    aria2=ut.aria2,
    logger=ut.logger;

var KB = 1024; // Kilobyte
var MB = 1024 * KB; // Megabyte
var GB = 1024 * MB; // Gigabyte

var tasklist=[];
var uploadQueue=[];
var downloadQueue=[];
var taskid=1;
function isdownloading(filepath){
    for (var i=0;i<tasklist.length;i++){
        var t=tasklist[i];
        if (t.file.path==filepath && t.type==1 && t.status==1){
            logger.info('task existed: %s',filepath);
            return true;
        }
    }
    return false;
}
function queueUpload(func,filepath){
    if(!filepath){return logger.warn('filepath is missing');}
    for(var i=0;i<uploadQueue.length;i++){
        var u=uploadQueue[i];
        if(u[0]==func && u[1]==filepath){
            return logger.warn('func[%s] is uploading: %s',func.name,filepath);
        }
    }
    uploadQueue.push([func,filepath]);
}
/**
 * params[0]:function object
 * params[1]: download url
 * params[2...]: headers,output filename
 */
function queueDownload(params){
    if(!params||params.length<2){return logger.warn('url is missing');}
    for(var i=0;i<uploadQueue.length;i++){
        var d=downloadQueue[i];
        if(d[0]==params[0] && d[1]['url']==params[1]['url']){
            return logger.warn('currently downloading : %s',params[1]['url']);
        }
    }
    downloadQueue.push(params);
}
function Task(filepath,fileSize,tasktype,resumeFunc,retries){
    //find lastest retrying task
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if (t.file.path==filepath && t.type==tasktype && t.status==-4){
            retries=t.retries;
            //remove old task
            tasklist.splice(i,1);
            break;
        }
    }
    tasklist.push(this);
    this.id=taskid++;
    this.file={name:path.basename(filepath),size:fileSize,path:filepath};
    this.type=tasktype;
    this.resume=resumeFunc.bind(this);
    this.retries=typeof retries =='undefined'?3:retries;
    this.status=null;
    this.downloaded=0;
    this.info={speed:0,size:0,time:Date.now()};
    this._emitter=new events.EventEmitter();
    this.on=function(evt,listener){
        this._emitter.on(evt,listener);
    };
}

Task.prototype.stop=function(){
    this._emitter.emit('abort');
    logger.log('task stopped:',this.file.name);
    this._emitter.removeAllListeners('abort');
};
Task.prototype.abort=function(){
    this._emitter.emit('abort');
    this.status=-1;
    logger.log('task[%s] abort:%s',this.id,this.file.name);
    this._emitter.removeAllListeners('abort');
};

Task.prototype.update=function(size){
    this.downloaded+=size;
    this.status=this.type;
    var now=Date.now();
    var interval=now-this.info.time;
    if (interval>=3000){//3000ms elapsed
        this.info.time=now;
        this.info.speed=((this.info.size+size)/interval).toFixed(0);
        this.info.size=0;
    }else{
        this.info.size+=size;
    }
    //is it possible the downloaded bytes > filesize?
    if(this.downloaded>=this.file.size){
        this.status=0;
        this._emitter.removeAllListeners();
    }
};
Task.prototype.end=function(){
    //content-length not given, filesize unspecify
    if(isNaN(this.file.size)){
        this.status=0;
        this._emitter.removeAllListeners();
    }
};

Task.prototype.getStatus=function(){
    var msg='unknown';
  switch (this.status) {
    case 0:msg='done';break;
    case 1:msg='downloading';break;
    case 2:msg='uploading';break;
    case -1:msg='abort';break;
    case -2:msg='aria2';break;
    case -3:msg='failed';break;
    case -4:msg='retrying';break;
  }
    return msg;
};

Task.prototype.leftedTime=function(){
    if (this.info.speed==0)return '-.-';
    var seconds=(this.file.size-this.downloaded)/(1000*this.info.speed);
    seconds=seconds.toFixed(0);
    var hour = seconds >= 3600  ? Math.round(seconds / 3600) : 0;
    var remain = seconds % 3600;
    var min = remain >= 60 ? Math.round(remain / 60) : 0;
    remain = remain % 60;
    return hour > 99 ? '大于100小时' : (hour > 0 ? (hour < 10 ? '0'+hour : hour) : '00')+':'+(min > 0 ? (min < 10 ? '0'+min : min) : '00')+':'+(remain > 0 ? (remain < 10 ? '0'+remain : remain) : '00');

};

Task.prototype.getFileSize=function(size){
    if(!size)size=this.file.size;
    return size < KB ? size+'B' : size < MB ? (size / KB).toFixed(2)+'K' : size < GB ? (size / MB).toFixed(2)+'M' : (size / GB).toFixed(2)+'G';

};

Task.prototype.toString=function(){
    return '['+this.id+']. '+this.file.name+'\n'+this.getStatus()+'\t'+this.leftedTime()+'\t'+this.info.speed+'k/s\t'+this.getFileSize(this.downloaded)+'/'+this.getFileSize();
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
    var n=tasklist.length,uploading=0,downloading=0;
    while (n--){
        var t=tasklist[n];
        if(t.status==1)downloading++;
        if(t.status==2)uploading++;
        // more than 30s,no data transfer between remote server
        if (t.status>0 && (Date.now()-t.info.time>30000)){
            t.abort();
            if (t.resume && t.retries>0){
                t.retries--;
                t.status=-4;//retrying status
                setTimeout(function(){this.resume();}.bind(t),5000);
            }
        }
        //remove aborted or finished task that exists more than 12 hours
        if (t.status<=0 && (Date.now()-t.info.time>43200000)){
            logger.info('clear task:%s',t.file.name);
            tasklist.splice(n,1);
        }
    }
    //currently no uploading task
    if(uploading==0&&uploadQueue.length>0){
        var params=uploadQueue.shift();
        try{
            var func=params.shift();
            func.apply(null,params);
            //u[0].apply(null,[u[1]]);
        }catch(err){
            console.error(err.message);
            console.error(err.stack);
        }
    }
    //currently downloading tasks < 2
    if(downloading<2&&downloadQueue.length>0){
        var params=downloadQueue.shift();
        try{
            var func=params.shift();
            logger.info('[download queue] %j',params[0]);
            func.apply(null,params);
        }catch(err){
            console.error(err.message);
            console.error(err.stack);
        }
    }
}
function deleteTask(id){
    if(!id)return -1;
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if(t.id==id){
            if(t.status>0)t.abort();
            tasklist.splice(i,1);return 0;
        }
    }
    return -1;
}
function abortTask(id){
    if(!id)return -1;
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if(t.id==id){
            if(t.status>0)t.abort();
            //if(t.status>0)t.stop();
            return 0;
        }
    }
    return -1;
}

function listTask(status){
    var todo=[],done=[];
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i];
        if(t.status==0)done.push(t.toString());
        else todo.push(t.toString());
    }
    //todo.sort(function(a,b){return b.status-a.status;});
    return status==0?done:todo;
}
exports.isdownloading=isdownloading;
exports.Task=Task;
exports.viewTasks=viewTasks;
exports.updateTask=updateTask;
exports.deleteTask=deleteTask;
exports.abortTask=abortTask;
exports.queueUpload=queueUpload;
exports.queueDownload=queueDownload;
exports.listTask=listTask;
exports.tasklist=tasklist;
if(false){
    queue('demo',[1]);
    queue('demo',[1,1]);
}
