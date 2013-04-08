var _9gal = require('./9gal.js') 
  , _115 = require('./115.js') 
  , xunlei = require('./xunlei')
  , vdisk = require('./vdisk')
  , weibo = require('./weibo_wap.js') 
  , uptobox = require('./uptobox.js') 
  , zippyshare = require('./zippyshare.js') 
  , baidu = require('./baidu.js') 
  , ctdisk = require('./ctdisk.js') ;

var site={
    //checkin sites
    '9gal.checkin':_9gal.checkin,
    '115.checkin':_115.checkin,
    'weibo.checkin':weibo.checkin,
    //upload sites
    '115.upload':_115.upload,
    '115.download':_115.download,
    'vdisk.upload':vdisk.upload,
    'xunlei.upload':xunlei.upload,
    'xunlei.scan':xunlei.scan,
    'uptobox.upload':uptobox.upload,
    'uptobox.download':uptobox.download,
    'zippyshare.download':zippyshare.download,
    'baidu.upload':baidu.upload,
    'ctdisk.upload':ctdisk.ftpupload,
    //functions
    checkin:function(){
        _9gal.checkin();_115.checkin();weibo.checkin();
    }
};
module.exports=exports=site;

