#!/usr/bin/env python
# -*- coding: utf-8

#upload to weibo disk
import httplib
import re,StringIO,gzip,os
import json

cookieRE1=re.compile(r'\s*([^=]+)=([^;]+)(;|$)');
cookieRE2=re.compile(r'\s*([^=]+)=([^;]+);.+?path=.+?(,|$)')

filepath=os.path.dirname(os.path.realpath(__file__))
CFGFILE=os.path.join(filepath,'ads.cfg')
class Config:
    def __init__(self,cfgfile=CFGFILE):
        self.cookies={}
        if os.path.exists(cfgfile):
            with open(cfgfile,'rb') as f:cfg=json.load(f)
            self.cookies=cfg['cookies'] if 'cookies' in cfg else {}
            self.username=cfg['username'] if 'username' in cfg else None
            self.passwd=cfg['passwd'] if 'passwd' in cfg else None
            self.__cfg=cfg
    def cookieString(self):
        rs=''
        for k in sorted(self.cookies.iterkeys()):
            rs+=k+'='+self.cookies[k]+'; '
        return rs[:-2]
    def setCookies(self,cookieString):
        for m in cookieRE2.finditer(cookieString):
            self.cookies[m.group(1)]=m.group(2)
        print 'cookie: %s'%self.cookieString()
    def save(self,cfgfile=CFGFILE):
        self.__cfg['cookies']=self.cookies
        with open(cfgfile,'wb') as f:json.dump(self.__cfg ,f)

def initHeader(conn):
    conn.putheader("Accept","text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    conn.putheader('User-Agent','Mozilla/5.0 (Windows NT 5.1; rv:16.0) Gecko/20100101 Firefox/16.0')
    conn.putheader('Accept-Language','zh-cn,en;q=0.5')
    conn.putheader('Accept-Encoding','gzip, deflate')
    conn.putheader('Connection','keep-alive')
    conn.putheader('Referer','http://bbs.9gal.com/index.php')

def login(conn,cfg):
    conn.putrequest("POST", "/login.php",skip_accept_encoding=True)
    initHeader(conn)
    conn.putheader('Content-Type','application/x-www-form-urlencoded')
    data='pwuser='+cfg.username+'&pwpwd='+cfg.passwd+'&jumpurl=index.php&step=2&cktime=31536000'
    conn.putheader('Content-Length',len(data))
    conn.endheaders()
    conn.send(data)
    resp = conn.getresponse()
    cfg.setCookies(resp.getheader('set-cookie'))



def clickAds(tries=0,cfg=None):
    #initCookie()
    if not cfg:cfg=Config()
    conn = httplib.HTTPConnection("bbs.9gal.com", 80)
    conn.putrequest("GET", "/index.php",skip_accept_encoding=True)
    initHeader(conn)
    if cfg.cookies: conn.putheader('Cookie',cfg.cookieString())
    conn.endheaders()
    resp = conn.getresponse()
    cfg.setCookies(resp.getheader('set-cookie'))
    gzdata=StringIO.StringIO(resp.read())
    data=gzip.GzipFile(fileobj=gzdata).read()
    i=data.find('login.php?action=quit')
    if i<0:
        print 'login.....'
        if tries==0:login(conn,cfg);return clickAds(tries+1,cfg)
        else:return None 
    i =data.find('g_intro.php')
    if i<0:i=data.find('diy_ad_move.php')
    if i<0:print 'failed to find ads link';exit(1)
    j =data.find('"',i)

    #request for ads
    path='/'+data[i:j]

    conn.putrequest("GET", path,skip_accept_encoding=True)
    initHeader(conn)
    if cfg.cookies:conn.putheader('Cookie',cfg.cookieString())
    conn.endheaders()
    resp = conn.getresponse()
    cfg.setCookies(resp.getheader('set-cookie'))
    cfg.save()
    gzdata=StringIO.StringIO(resp.read())
    data=gzip.GzipFile(fileobj=gzdata).read()
    conn.close()
    data=data.decode('gbk')
    if data.find('http-equiv="refresh"')>0:
        i=data.find(u'恭喜你')
        j=data.find('<br',i)
        return data[i:j]
    else:
        return None

if __name__=="__main__":
    try:
        rs=clickAds()
        if rs:
            print rs.encode('utf-8')
            #print rs
            exit(0)
        else:
            exit(1)
    except Exception as err:
        print err
        exit(1)

