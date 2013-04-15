var fs=require('fs'),
    url=require('url'),
    util=require('util');

var request=require('../myrequest'),
    ut=require('../utility.js'),
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
    var options={
        encoding:'utf-8',
        headers:{'Referer':_url}
    }
    request(_url,options,function(err,res,body){
        jquery(body,function($){
            var script=$('#dlbutton').next().text().trim();
            eval(script);
            var href=url.parse(_url);
            href.pathname=nodes['dlbutton']['href'];
            var link=url.format(href);
            logger.info("begin download:%s",link);
            var cookies=request.defaultJar().get({url:link});
            var cookieStr=cookie.map(function(c){
                return c.name+'='+c.value;
            }).join('; ');
            require('../proxy.js').download(link,{header:['Cookie: '+cookieStr],out:'sub.rar'});
        });
    });
}
exports.download=download;
if(false){
    download('http://www49.zippyshare.com/v/61915323/file.html');
}
