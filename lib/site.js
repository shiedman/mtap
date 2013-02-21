var _9gal = require('./9gal.js') 
  , _115 = require('./115.js') 
  , xunlei = require('./xunlei')
  , vdisk = require('./vdisk')
  , weibo = require('./weibo_wap.js') 
  , uptobox = require('./uptobox.js') 
  , baidu = require('./baidu.js') 
  , ctdisk = require('./ctdisk.js') ;

var site={
    //checkin sites
    '9gal.checkin':_9gal.checkin,
    '115.checkin':_115.checkin,
    'weibo.checkin':weibo.checkin,
    //upload sites
    '115.upload':_115.upload,
    'vdisk.upload':vdisk.upload,
    'xunlei.upload':xunlei.upload,
    'uptobox.upload':uptobox.upload,
    'baidu.upload':baidu.upload,
    'ctdisk.upload':ctdisk.upload,
    //functions
    checkin:function(){
        _9gal.checkin();_115.checkin();weibo.checkin();
    }
};
exports.site=site;

