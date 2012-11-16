node.js@dotcloud
================
1. proxy
http/https/socks5
goagent/wallproxy

2. modified aria2c, port mapping mechanize changed

3.dotcloud/ui/config.py
class GlobalConfig(object):
    def __init__(self):
        self.dir = os.path.expanduser('~/.dotcloud_cli')
        if os.environ.get('DOTCLOUD_LOCAL_CONFIG'):
            if not os.path.exists('.local'):os.mkdir('.local', 0700)
            self.dir='.local'
        self.path = self.path_to('config')
        self.key = self.path_to('dotcloud.key')
        self.load()
