var url  = require('url');

var blacklist =['cpro.baidu.','pos.baidu.','drmcmm.baidu.','cnzz.com',
    'sinajs','37cs','zx915','qiyou','googleads','258u','nnjiankang',
    '1lo0','tbjfw','zjbdt','51.la','xcy8','snyu','778669','images9999',
    '17kuxun','460','258u','theooxx','wqzyt.net','7794','62001188',
    'tuiguang','qqtan.com','linezing.com','ku123.com','ugooo.cc',
    'play-asia','777wyx.com'];
/**
fs.watchFile('./blacklist', function(c,p) {
  fs.stat('./blacklist', function(err, stats) {
    if (!err) {
      util.log("Updating blacklist.");
      sitelist = fs.readFileSync('./blacklist').split(/\r*\n/);
                  //.filter(function(rx) { return rx.length })
                  //.map(function(rx) { return RegExp(rx) });
    }
  });
});
*/
//var SERVER=process.env.PORT_PROXY;
exports.filter=function(request,response){
    var reqURL=url.parse(request.url);
    var hostname=reqURL['hostname'];
    if(!hostname){
    var ip = request.connection.remoteAddress;
    util.error('[BLOCKSITE]'+ip+':'+request.url);
    return false;
    }

    for (var i in blacklist){
        //if(blacklist[i].test(reqURL['hostname']))return true;
        if(hostname.indexOf(blacklist[i])>=0)return send404(response);
    }
    if (!process.env.PORT_WWW){
        if(/\.swf$/.test(reqURL.pathname)) return send404(response);
        if(/\.feedburner\.com/.test(hostname))return send404(response);
    }
};
function send404(response){
    response.writeHead(404, {'connection':'close','content-length':0});
    response.end();
    return true;
}
