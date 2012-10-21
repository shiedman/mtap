var fs=require('fs'),
    path=require('path');
var cfgfile=path.join(__dirname,'ads.cfg');
exports.clickAds=function(){
    fs.exists(cfgfile,function(exists){
        if(!exists){console.warn('ads.cfg not found');return;}
        var _5mins=300000;
        var _1hour=3600000;
        var cfg=JSON.parse(fs.readFileSync(cfgfile));
        if(!cfg.adsTime || Date.now()-cfg.adsTime>5*_1hour){
            if(!cfg.accessTime || Date.now()-cfg.accessTime>=_5mins){
                var spawn = require('child_process').spawn;
                var exec   = spawn('python',[path.join(__dirname,'ads.py')]);
                exec.stdout.on('data',function (data){console.log('clickAds: %s',data.toString());});
                exec.stderr.on('data',function (data){console.log('clickAds: %s',data.toString());});
                exec.on('exit', function (code) {
                    cfg=JSON.parse(fs.readFileSync(cfgfile));
                    cfg.accessTime=Date.now();
                    if(code==0){
                        cfg.adsTime=Date.now();
                        cfg.tries=0;
                    }else{
                        if(cfg.tries==undefined)cfg.tries=0;
                        cfg.tries++;
                        if(cfg.tries>10){
                            cfg.adsTime=Date.now()-3*_1hour;
                            cfg.tries=0;
                        }
                    }
                    console.info('ads.py exit with code: %s',code)
                    fs.writeFile(cfgfile,JSON.stringify(cfg));
                });
                //click ads
            }
        }
    });
  }
