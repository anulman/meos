#!/usr/bin/python3
# SPDX-License-Identifier: Apache-2.0
"""Private stdio MCP bridge. No TCP listener; only fixed native Unix upstream."""
import fcntl, http.client, json, os, pathlib, socket, stat, sys

LIMIT = 150000

def private(path):
    p = pathlib.Path(path).absolute()
    for parent in p.parents:
        s = parent.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_mode & 0o022 or s.st_uid not in (0, os.getuid()):
            raise ValueError('unsafe parent')
    s = p.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o600:
        raise ValueError('unsafe private file')
    return p

def save(p, value):
    tmp = p.with_name(p.name + '.pending')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, p)
    fd = os.open(p.parent, os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, host, path):
        super().__init__(host, timeout=30); self.path = path
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout); self.sock.connect(self.path)

class Bridge:
    def __init__(self, config):
        self.c = config
        if set(config) != {'origin', 'socket', 'credentials', 'instanceId', 'environment'}:
            raise ValueError('invalid config')
        from urllib.parse import urlsplit
        u = urlsplit(config['origin'])
        if u.scheme != 'https' or not u.hostname or u.path or u.query or u.fragment or u.username:
            raise ValueError('invalid origin')
        self.host = u.netloc
        if not os.path.isabs(config['socket']): raise ValueError('absolute socket required')
    def request(self, path, body=None, token=None):
        conn = UnixHTTP(self.host, self.c['socket'])
        headers = {'Content-Type':'application/json', 'Accept':'application/json, text/event-stream'}
        if token: headers['Authorization'] = 'Bearer ' + token
        if path == '/api/auth/v1/refresh': headers['Origin'] = self.c['origin']
        try:
            conn.request('POST' if body is not None else 'GET', path, json.dumps(body) if body is not None else None, headers)
            r = conn.getresponse(); data = r.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024: raise ValueError('response limit')
            return r.status, json.loads(data) if data else None
        finally: conn.close()
    def call(self, message):
        status, identity = self.request('/api/meos/v1/instance')
        if status != 200 or identity.get('instanceId') != self.c['instanceId'] or identity.get('environment') != self.c['environment']:
            raise ValueError('instance mismatch')
        p = private(self.c['credentials'])
        # Dedicated stable inode: credential replacement must not release the lock.
        fd = os.open(str(p) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            credentials = json.loads(private(p).read_text())
            status, result = self.request('/api/meos/v1/mcp', message, credentials['authToken'])
            if status == 401:
                # Persist an intent before refresh: an ambiguous rotated token must
                # stop, not repeatedly refresh an invalid predecessor after a crash.
                intent = p.with_name(p.name + '.refresh-intent')
                if intent.exists(): raise ValueError('refresh outcome requires reconciliation')
                save(intent, {'state':'refreshing'})
                code, tokens = self.request('/api/auth/v1/refresh', {'refresh_token':credentials['refreshToken']})
                if code != 200 or not all(isinstance(tokens.get(k), str) and tokens[k] for k in ('auth_token','refresh_token')):
                    raise ValueError('refresh rejected')
                save(p, {'authToken':tokens['auth_token'],'refreshToken':tokens['refresh_token']})
                intent.unlink()
                d = os.open(p.parent, os.O_DIRECTORY); os.fsync(d); os.close(d)
                status, result = self.request('/api/meos/v1/mcp', message, tokens['auth_token'])
            if status not in (200, 202): raise ValueError('upstream rejected')
            return result
        finally: os.close(fd)

def main():
    bridge = Bridge(json.loads(private(sys.argv[1]).read_text()))
    while True:
        raw = sys.stdin.buffer.readline(LIMIT + 1)
        if not raw: break
        if len(raw) > LIMIT: raise ValueError('request limit')
        message = json.loads(raw)
        if not isinstance(message, dict): raise ValueError('invalid message')
        try: result = bridge.call(message)
        except Exception:
            result = {'jsonrpc':'2.0','id':message.get('id'),'error':{'code':-32603,'message':'Private MeOS transport unavailable; operator reconciliation may be required'}}
        if 'id' in message:
            print(json.dumps(result), flush=True)
if __name__ == '__main__': main()
