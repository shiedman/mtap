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
var taskid=1;
function isPending(filepath){
    for (var i=0,len=tasklist.length;i<len;i++){
        if(tasklist[i].status>=0 && tasklist[i].file.path==filepath 
                && fs.existsSync(filepath)){;
            logger.info('task existed: %s',filepath);
            return true;
        }
    }
    return false;
}
var uploadlist=[];
var uploadingTask={};
function queue(func,params){
    if(!util.isArray(params)){return logger.warn('%s is not array',params);}
    for(var i=0;i<uploadlist.length;i++){
        var u=uploadlist[i];
        if(u[0]==func && u[1].length==params.length){
            for(var j=0;u[1][j]==params[j]&&j<params.length;j++);
            if(j==params.length){
                logger.warn('func[%s] existed, params: %s',func.name,util.inspect(params));
                return;
            }
        }
    }
    if(!isPending(params[0])){
        uploadlist.push([func,params]);
    }
}
function Task(options,filepath,fileSize){
    tasklist.push(this);
    this.id=taskid++;
    this.file={name:path.basename(filepath),size:fileSize,path:filepath}
    this.options=options;
    this.downloaded=0;
    this.resumable=true;
    this.status=null;
    this.retries=3;
    this.info={speed:0,size:0,time:Date.now()};
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

Task.prototype.update=function(size,_status){
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
    if(this.downloaded==this.file.size){
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
Task.prototype.resume=function(){

    var self=this;
    var headers=self.options['headers'];
    var arr=[];
    for(var k in headers){
        arr.push(k+': '+headers[k]);
    }
    var params={ 'out':self.file.name,'header':arr };
    aria2.addUri([self.options['url']],params,function(err,rs){
        if(err){
            logger.error('failed to add url to aria2: %s',self.options['url']);
            logger.error('  '+err);
        }else if (rs.error){
            logger.error('aria2 response error messag: %s',rs.error);
        } else{
            self.status=-2;
            self.retries=0;
            logger.info('aria2 start download: %s\n   response: %s',self.options['url'],rs.result);
        }
    });
};
//deployed on heroku server, which not able to connect internal aria2c process
if(process.env.PORT){
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
        if(task.status==2)uploading++;
        //resume aborted task if task is resumable
        if ((task.status<0)&& task.resumable && task.retries>0){
            logger.info('resume:',task.file.name);
            task.retries--;
            task.resume();
        }
        // more than 30s,no data transfer between remote server
        if ((task.status>0) && Date.now()-task.info.time>30000){
            //upload task
            if(task.status==2 && task.file.path==uploadingTask.file && uploadingTask.retry>0){
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
            task.abort();
        }
        //remove aborted or finished task that exists more than 12 hours
        if (task.status<=0 && Date.now()-task.info.time>43200000){
            logger.info('clear task:%s',task.file.name);
            tasklist.splice(i,1);
        }
    }
    //currently no uploading task
    if(uploading==0&&uploadlist.length>0){
        var u=uploadlist.shift();
        try{
            u[0].apply(null,u[1]);
            uploadingTask.func=u[0];
            uploadingTask.file=u[1][0];
            uploadingTask.retry=3;
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
exports.isPending=isPending;
exports.Task=Task;
exports.viewTasks=viewTasks;
exports.updateTask=updateTask;
exports.deleteTask=deleteTask;
exports.abortTask=abortTask;
exports.queue=queue;
exports.listTask=listTask;
if(false){
    queue('demo',[1]);
    queue('demo',[1,1]);
}
