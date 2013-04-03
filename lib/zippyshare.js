var fs=require('fs'),
    url=require('url'),
    util=require('util');

var HttpClient=require('./urlfetch').HttpClient,
    ut=require('./utility.js'),
    logger=ut.logger;

var jsdom;
function jquery(html,callback){
    if(!jsdom)jsdom=require('jsdom');
    jsdom.env(html,["http://code.jquery.com/jquery.min.js"],function(err,window){
        if(err){
            logger.error('jquery error:%j',err);
        }else{
            callback(window.$);
        }
    });
}
var nodes={};
var document={
    getElementById:function(name){
        if(typeof nodes[name] == 'undefined'){nodes[name]={};}
        return nodes[name];
    }
}
function download(_url){
    var http=new HttpClient(true);
    http.encoding='utf-8';
    http.referer=_url;
    http.get(_url,function(err,res){
        jquery(res.content,function($){
            var script=$('#dlbutton').next().text().trim();
            eval(script);
            var href=url.parse(_url);
            href.pathname=nodes['dlbutton']['href'];
            var link=url.format(href);
            logger.info("begin download:%s",link);
            http.cookiejar.getCookies(link,function(err,cookies){
                if(err){return logger.warn(err);}
                var s='Cookie: ';
                for(var i=0;i<cookies.length;i++){
                    if(i>0)s+='; ';
                    s+=cookies[i].key+'='+cookies[i].value;
                }
                require('./proxy.js').download({url:link,header:[s],out:'sub.rar'});
            });
        });
    });
}
exports.download=download;
if(false){
    download('http://www49.zippyshare.com/v/61915323/file.html');
}
