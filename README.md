node.js@dotcloud
================
1. proxy
http/https/socks5
goagent/wallproxy

2. offline downloader

3. dotcloud/ui/config.py
class GlobalConfig(object):
    def __init__(self):
        #self.dir = os.path.expanduser('~/.dotcloud_cli')
        self.dir = os.path.abspath('.local')
        self.path = self.path_to('config')
        self.key = self.path_to('dotcloud.key')
        self.load()

4.dotcloud/ui/cli.py
line 435: if True or self.confirm(
