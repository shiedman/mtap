var fs=require('fs'),
    path=require('path'),
    crypto = require('crypto'),
    qs=require('querystring'),
    util=require('util');

var httptask=require('./httptask.js'),
    multipart=require('./multipart.js'),
    ut=require('./utility.js'),
    logger=ut.logger;

function Uploader(username,password){
    this.construct(username,password);
    if(!this.password){
        throw('No password setted');
    }
}
util.inherits(Uploader,require('events').EventEmitter);
Uploader.prototype.construct=function(username,password){
    this.username=username;
    this.password=password;
};
Uploader.prototype.login=function(callback){
    var username=this.username,password=this.password;
    var url='https://passport.115.com/?ac=login';
    var payload=qs.stringify({ 'login[account]':username,'login[passwd]':password });
    ut.http.post(url,payload,function(err,res){
        var success=res.cookie&&res.cookie['OOFL']==encodeURIComponent(username);
        //console.log(res.cookie);
        //console.log(res.data);
        //fs.appendFileSync('log',res.data);
        if(callback){ callback(success); }
    });
};
Uploader.prototype.homePage=function(logined){
    var self=this;
    ut.http.get('http://115.com/',function(err,res){
        if(err){return logger.warn(err);}
        var data=res.data||'';
        var i=data.indexOf('UPLOAD_CONFIG_H5');
        if(i<0){
            logger.warn('no data');
            if(!logined)self.login(function(success){
                if(success) self.homePage(true);
                else logger.warn('login failed');
            });
        }else{
            var j=data.indexOf(';',i);
            if(j>0)j=data.indexOf(';',j+1);
            if(j<0){
                return logger.warn('UPLOAD_CONFIG_H5 not found');
            }
            var script='var '+data.substring(i,j+1);
            i=data.indexOf('FUpRsa1'),j=data.indexOf(';',i);
            if(i<0||j<0)return logger.warn('FUpRsa1 not found');
            script+='var '+data.substring(i,j+1);

            i=data.indexOf('FUpRsa2'),j=data.indexOf(';',i);
            if(i<0||j<0)return logger.warn('FUpRsa2 not found');
            script+='var '+data.substring(i,j+1);
            self.emit('ready',script);
        }
    });
};
Uploader.prototype.web_upload=function(cfg){
    var headers={'User-Agent':'Shockwave Flash','Accept':'text/*'};
    var filepath=cfg.filepath;
    var filename=path.basename(filepath);
    var filesize=fs.statSync(filepath).size;
    var time=Date.now();
    var rsa1=cfg.FUpRsa1,rsa2=cfg.FUpRsa2;
    var token=((((rsa1 + rsa2) + filesize) + time) + rsa2) + rsa1;
    var payload={
        Filename:filename,
        cookie:cfg.USER_COOKIE,
        aid:1,
        time:time,
        target:'U_1_0',
        token:crypto.createHash('md5').update(token).digest("hex"),
        FILE:{name:'Filedata',filepath:filepath},
        Upload:'Submit Query'
    }
    var task=new httptask.Task(null,filepath,filesize);
    var req=multipart.post(cfg.upload_url,payload,headers,
        function(err,res){
            if(err){
                task.status=-3;return logger.error('[upload]error:'+err.message);
            }
            if(res)logger.log('[upload]response: %s ==> %s',res.statusCode,filename);

        }
        ,function(data){ task.update(data.length,2);}
    );
    task.on('abort',function(){req.abort();});
    task.resumable=false;
};

function upload(filepath){
    var info=ut.ini.param('115_upload');
    console.log(info);
    if(!info.user||!info.pass){return logger.warn('user&password needed!');}
    filepath=path.resolve(filepath);
    if(!fs.existsSync(filepath))throw new Error(filepath+' not exits');
    var up=new Uploader(info.user,info.pass);
    up.on('ready',function(script){
        if(!script){return logger.warn('script is empty');}
        try{ eval(script); }catch(err){return logger.warn(err); }
        var cfg={
            filepath:filepath,
            upload_url:UPLOAD_CONFIG_H5.url,
            USER_COOKIE:USER_COOKIE,
            FUpRsa1:FUpRsa1,FUpRsa2:FUpRsa2
        };
        up.web_upload(cfg);
    });
    up.homePage();

}

exports.upload=upload;
if(false){
    console.log(__filename);
    ut.Cookie.load();
    ut.ini.load();
    //setInterval(cron,5000);
    //login('y2be@163.com','su201279');
    //ut.http.get('http://115.com',function(err,res){
        //fs.writeFileSync('log',res.data);
    //});
    setTimeout(function(){

    upload('115_upload.js');

    },2000);
    process.on('exit',function(){
        ut.Cookie.save();
        //ut.ini.write();
    });
}
/**
rsa1='9e38c924c8b08922d8f15b0da0f27b80502bd556';
rsa2='0cf7f7f30104d00dc8a9480301c7bd4cae367e59';
size=1024;
time=1354634059651;

var msg=((((rsa1 + rsa2) + size) + time) + rsa2) + rsa1;
console.log(msg);

var crypto = require('crypto');
var hash = crypto.createHash('md5').update(msg).digest("hex");
console.log(hash);


POST /upload?userid=62235704&ets=1354806880&appid=n&sig=1C71E6AEE4BE3CE8E816A3E530B935DDAA0B8497 HTTP/1.1
Accept: text/*
Content-Type: multipart/form-data; boundary=----------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
User-Agent: Shockwave Flash
Host: upload.115.com
Content-Length: 2149
Connection: Keep-Alive
Cache-Control: no-cache
Cookie: __utma=48116967.1813919219.1347770824.1347770824.1347770824.1; __utmz=48116967.1347770824.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none)

------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="Filename"

examples.zip
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="cookie"

%03%05SUSU%01%02%0DDP%0BS%06%5BS%5C%02PV%0B%06%06R%02Q%22%08%0C%03Q_P%19PWSLRYZ%0D%09Q%03V%00%00%07%0C%5ES%03%04%00%04%0A%03%07%5CUR%0EW%01VS%00%03%07WT%06Q%08Z%05Z%04%06%0A%5EW%05%01
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="aid"

1
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="time"

1354634059651
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="target"

U_1_0
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="token"

3185b39686afbe78d64316de57b92c5b
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="Filedata"; filename="examples.zip"
Content-Type: application/octet-stream

PK..
.....}r.<................SAE_SDK_Windows_1.0.5/PK........n..>2..U.>..........SAE_SDK_Windows_1.0.5/am.exe.Z{<......e.d.j...a_Q...r.9...Pb1..L.....Q.T..T*.........oM..."..m....{............s]..u...........}..>. ....P................/...N..W.\..+].'0.>.CIN.M>p.s,5..9..INM..&F.$cB...[)+......O....|@``...=..	.U0.$..4.... ....3.`..P.......c.!........?..Q..................&.`x]....
..i...@..s
"...a.v=....A...p]...4...I...GX..HNI>..F............{...g..~.*o.n.Cu...ku%P.3...n.-.`.....7...._..Rq.+..@...Hk.......8
H.^a'L..t.i..=..|.....t.c..T#....Y.../..@.......;...O......eN.ag ....k.$.8.i2.....^qo..t.go....].+....]..1RCZ..f.5..P...:<.>dI....+.W..2C..Z...y......niuw...7....K.ab.O.z<'L..-r;.qO.!
O...2.^.i..............T..$....@....F..I...............!..........Td&...H..<.......%..F(..h.=j.......:<....|.YG...6.1.......PH=.H@...........z...CW...%.....	T...mv....S.._.l..o..ml.. 9A`...g..7FG...>.........66N..iF.
..z.`......L.O.7...x\%"9......._...<k...4D.........c......=.'......n..uZp..$.,.y>.U.}n.7W=...v(&&.ZF.
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5
Content-Disposition: form-data; name="Upload"

Submit Query
------------ei4KM7gL6gL6Ef1gL6cH2GI3Ef1Ij5--
HTTP/1.1 200 OK
Server: nginx
Date: Tue, 04 Dec 2012 15:15:20 GMT
Content-Type: text/html
Connection: close
Powered-By-YlmF: CN-DG-TEL-UP-1001

{"state":true,"data":{"cid":0,"aid":1,"file_name":"examples.zip","file_ptime":1354634120,"file_status":1,"file_id":28432448,"file_size":1024,"pick_code":"aetm546a","sp":1}}

*/
