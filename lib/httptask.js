/*
 ** shiedman (shiedman@gmail.com)
 **
 */
var util  = require('util');
var fs   = require('fs');
var events=require('events');
var path=require('path');

var downloader=require('./downloader.js');
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
        if (t.filepath==filepath && t.task.type==1 && t.task.status==1){
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
        if(d[0]==params[0] && d[1]==params[1]){
            return logger.warn('currently downloading : %s',params[1]);
        }
    }
    downloadQueue.push(params);
}
//function Task(options,filepath,fileSize){
function Task(filepath,fileSize,tasktype,resumeFunc){
    for(var i=0;i<tasklist.length;i++){
        var t=tasklist[i];
        //dead task, replace it
        if (t.filepath==filepath && t.task.type==tasktype && t.task.status<0){
            t.task=this;
            t.tried++;
            break;
        }
    }
    //not found in tasklist, create new task
    if(i==tasklist.length){
        tasklist.push({filepath:filepath,task:this,tried:0});
    }
    //tasklist.push(this);
    this.id=taskid++;
    this.file={name:path.basename(filepath),size:fileSize,path:filepath};
    this.info={speed:0,size:0,time:Date.now()};
    //this.options=options;
    this.downloaded=0;
    //this.resumable=true;
    this.resumeFunc=resumeFunc;
    this.type=tasktype;
    this.status=null;
    this.retries=3;
    this._emitter=new events.EventEmitter();
    this.on=function(evt,listener){
        this._emitter.on(evt,listener);
    };
}

Task.prototype.abort=function(){
    this._emitter.emit('abort');
    this.status=-1;
    logger.log('task abort:',this.file.name);
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
//invoke aria2 with jsonrpc call
Task.prototype.resume111=function(){
    if(!aria2.online){
        return downloader.download(this.options.url,this.options.headers,this.file.path,this);
    }
    var headers=this.options['headers'];
    var arr=[];
    for(var k in headers){
        arr.push(k+': '+headers[k]);
    }
    var params={ 'out':this.file.name,'header':arr };
    aria2.addUri([this.options['url']],params,function(err,rs){
        if(err){
            //aria2c service not available
            logger.error('failed to add url to aria2: %s',this.options['url']);
            logger.error('  '+err);
        }else if (rs.error){
            //aria2c failed to do the request
            logger.error('aria2 response error messag: %s',rs.error);
        } else{
            //request accepted, download begins
            this.status=-2,this.retries=0;
            logger.info('aria2 start download: %s\n   response: %s',this.options['url'],rs.result);
        }
    }.bind(this));
};
//deployed on heroku server, which not able to connect internal aria2c process
if(false&&process.env.PORT){
    //resume download with http ranges
    Task.prototype.resume=function(){
        downloader.download(this.options.url,this.options.headers,this.file.path,this);
    };
}

Task.prototype.getStatus=function(){
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
        var t=tasklist[i].task;
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
        if(t.task.status==1)downloading++;
        if(t.task.status==2)uploading++;
        //resume aborted task if task is resumable
        if (false&&task.status<0&& task.resumable && task.retries>0){
            logger.info('resume:',task.file.name);
            task.retries--;
            task.resume();
        }
        // more than 30s,no data transfer between remote server
        if (t.task.status>0 && (Date.now()-t.task.info.time>30000)){
            //upload task
            if(false&&task.status==2 && task.file.path==uploadingTask.file && uploadingTask.retry>0){
                uploadingTask.retry--;
                try{
                    uploadingTask.func.apply(null,[uploadingTask.file]);
                    tasklist.splice(i,1);
                    logger.log('[%s]retry upload file: %s',uploadingTask.retry,uploadingTask.file);
                }catch(err){
                    console.error(err.message);
                    console.error(err.stack);
                }
            }
            t.task.abort();
            if (t.task.resumeFunc && t.tried<t.task.retries){
                t.task.retries--;
                setTimeout(function(){t.task.resumeFunc();},5000);
            }
        }
        //remove aborted or finished task that exists more than 12 hours
        if (t.task.status<=0 && (Date.now()-t.task.info.time>43200000)){
            logger.info('clear task:%s',t.task.file.name);
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
    if(downloading<2&&downloadQueue.length>0){
        var params=downloadQueue.shift();
        try{
            var func=params.shift();
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
        var t=tasklist[i].task;
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
        var t=tasklist[i].task;
        if(t.id==id){
            if(t.status>0)t.abort();
            return 0;
        }
    }
    return -1;
}

function listTask(status){
    var todo=[],done=[];
    for(var i=tasklist.length-1;i>=0;i--){
        var t=tasklist[i].task;
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
if(false){
    queue('demo',[1]);
    queue('demo',[1,1]);
}
