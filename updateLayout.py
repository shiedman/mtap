#!/usr/bin/python
# -*- coding: utf-8 -*-
import os
title='DOTCLOUD_PROJECT'
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
with open('views/layout.jade','rb') as f:lines=f.read()
out=open('views/layout.jade','wb')
#founded=0
for line in lines.splitlines(True):
    if line.find('y2proxy_')>0 and title in os.environ:
        line=line.replace('y2proxy_','y2proxy@'+os.environ[title])
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
