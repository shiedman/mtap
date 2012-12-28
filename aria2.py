#!/usr/bin/env python
# -*- coding: utf-8 -*-
import xmlrpclib,datetime,os
import sys
def sizeof_fmt(num):
    for x in ['bytes','KB','MB','GB','TB']:
        if num < 1024.0:
            return "%3.2f%s" % (num, x)
        num /= 1024.0

class RPC:
    def __init__(self):
        self.proxy=xmlrpclib.ServerProxy('http://localhost:6800/rpc')

    def actives(self):
        tasks=self.proxy.aria2.tellActive()
        print '+++++++active tasks++++++'
        for t in tasks:
            total=int(t['totalLength'])
            completed=int(t['completedLength'])
            speed=int(t['downloadSpeed'])
            secs=(total-completed)/speed
            delta=datetime.timedelta(seconds=secs)
            for f in t['files']:
                print os.path.basename(f['path'])
            print t['gid'],delta,"\t%dk/s"%(speed/1024),"\t%s/%s"%(sizeof_fmt(completed),sizeof_fmt(total))
            print '==================================================='

    def stops(self):
        tasks=self.proxy.aria2.tellStopped(0,10)
        print '+++++++stopped tasks++++++'
        for t in tasks:
            total=int(t['totalLength'])
            completed=int(t['completedLength'])
            for f in t['files']:
                print os.path.basename(f['path'])
            print t['gid'],'--','--',"%s/%s"%(sizeof_fmt(completed),sizeof_fmt(total))
            print '==================================================='

    def remove(self,gid):
        self.proxy.aria2.remove(gid)

    def addUri(self,uris):
        if isinstance(uris,list):
            self.proxy.aria2.addUri(uris)
        else:
            self.proxy.aria2.addUri([uris])

if __name__ == '__main__':
    argv=sys.argv
    if len(argv)==1:print '-------';exit()
    act=argv[1]
    rpc=RPC()
    if act=='ls':
        rpc.actives()
    elif act=='stop':
        rpc.stops()
    elif act=='del' and len(argv)==3:
        rpc.remove(argv[2])
    elif act=='add' and len(argv)>=3:
        rpc.addUri(argv[2:])

