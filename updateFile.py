#!/usr/bin/python
# -*- coding: utf-8 -*-
import os
#title='TMP'
#with open('views/layout.jade','rb') as f:
    #founded=0
    #for line in f:
        #if line.find('y2proxy_')>0 and title in os.environ:
            #line=line.replace('y2proxy_','y2proxy@'+os.environ[title])
        #if founded==0 and line.find('nav.dotcloud')>=0: founded=1; continue
        #if founded>=1 and founded <=3:founded+=1;continue
        #out.write(line)
#out.close()
title=''
if 'DOTCLOUD_PROJECT' in os.environ:title=os.environ['DOTCLOUD_PROJECT']
with open('views/layout.jade','rb') as f:lines=f.read()
out=open('views/layout.jade','wb')
#founded=0
for line in lines.splitlines(True):
    if line.find('y2proxy_')>0:
        line=line.replace('y2proxy_','y2proxy@'+title)
    #if founded==0 and line.find('nav.dotcloud')>=0: founded=1; continue
    #if founded>=1 and founded <=3:founded+=1;continue
    out.write(line)
out.close()

with open('app.js','rb') as f:lines=f.read()
out=open('app.js','wb')
for line in lines.splitlines(True):
    if line.find('##remove##')>=0:continue 
    out.write(line)
out.close()

http_url='http://localhost/';
if 'DOTCLOUD_WWW_HTTP_URL' in os.environ:http_url=os.environ['DOTCLOUD_WWW_HTTP_URL']
with open('static/goagent/proxy.ini','rb') as f:lines=f.read()
with open('static/goagent/proxy.ini','wb') as f:
    f.write(lines.replace('${DOTCLOUD_WWW_HTTP_URL}',http_url))


with open('static/wallproxy/proxy.ini','rb') as f:lines=f.read()
with open('static/wallproxy/proxy.ini','wb') as f:
    f.write(lines.replace('${DOTCLOUD_WWW_HTTP_URL}',http_url))


