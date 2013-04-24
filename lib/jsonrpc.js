var path=require('path'),
    fs=require('fs');

var _9gal = require('./site/9gal.js'),
    _115 = require('./site/115.js'), 
    xunlei = require('./site/xunlei'),
    vdisk = require('./site/vdisk'),
    weibo = require('./site/weibo_wap.js'),
    uptobox = require('./site/uptobox.js'),
    zippyshare = require('./site/zippyshare.js'),
    baidu = require('./site/baidu.js'),
    bitshare=require('./site/bitshare.js'),
    ctdisk = require('./site/ctdisk.js'),
    proxy=require('./proxy'),
    httptask=require('./httptask.js');

var methods={
    //upload 
    '115.upload':upload(_115.upload),
    'vdisk.upload':upload(vdisk.upload),
    'xunlei.upload':upload(xunlei.upload),
    'uptobox.upload':upload(uptobox.upload),
    'baidu.upload':upload(baidu.upload),
    'ctdisk.ftpupload':upload(ctdisk.ftpupload),
    'ctdisk.httpupload':upload(ctdisk.httpupload),
    'bitshare.upload':upload(bitshare.upload),
    //download
    'proxy.download':download(proxy.download),
    'uptobox.download':download(uptobox.download),
    'uptobox.remote_download':download(uptobox.remote_download),
    '115.download':download_115(_115.download),
    'zippyshare.download':download(zippyshare.download),
    //httptask
    'httptask.deleteTask':task(httptask.deleteTask),
    'httptask.pauseTask':task(httptask.pauseTask),
    'httptask.abortTask':task(httptask.abortTask),
    'httptask.listTask':task(httptask.listTask),
    //others
    'xunlei.scan':xunleiScan,
    //checkin sites
    '9gal.checkin':_9gal.checkin,
    '115.checkin':_115.checkin,
    'weibo.checkin':weibo.checkin,
    checkin:function(){
        _9gal.checkin();_115.checkin();weibo.checkin();
    }
};

function upload(func){
    return function(filepath){
        filepath=path.normalize(filepath);
        if(!fs.existsSync(filepath)) throw new Error('file not exists: '+filepath);
        var stat=fs.statSync(filepath);
        if(!stat.isFile())throw new Error('not a File: '+filepath);
        if(httptask.queueUpload(func,filepath)){
            return 'upload queued:'+filepath;
        }
        throw new Error(filepath+' is uploading');
    }
}

function download(func){
    return function(url,options){
        if(url && (url.substring(0,7)=='http://'||url.substring(0,8)=='https://')){
            httptask.queueDownload(func,[url,options]);
            return 'download queued:'+url;
        }
        throw new Error('not valid URL: '+url);
    }
}

function download_115(func){
    return function(pick_code,options){
        if(pick_code && options.username && options.password){
            httptask.queueDownload(func,[pick_code,options]);
            return 'download queued:'+pick_code;
        }
        throw new Error('not valid pick_code: '+pick_code);
    }
}

function task(func){
    return function(taskid){
        var rtn=func.call(null,taskid);
        if(typeof rtn == 'object'){
            return {data:rtn}
        }else if (typeof rtn == 'number'){
            if(rtn<0)throw  new Error(taskid+' not exists');
        }
        return 'success';
    }
}

function xunleiScan(loginuser,loginpass,scantarget,scanNodeId){
    var valid=loginuser&&loginpass&&scantarget;
    if(!valid)throw new Error('loginuser & loginpass & scantarget missing');
    xunlei.scan(loginuser,loginpass,scantarget,scanNodeId);
    return 'scan started';
}

module.exports=exports=methods;



