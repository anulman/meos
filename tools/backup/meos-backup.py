#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Optional MeOS host recovery tooling. Missing bucket means no side effects."""
import argparse, contextlib, datetime as dt, fcntl, hashlib, hmac, json, os
from pathlib import Path
import re, shutil, signal, sqlite3, stat, subprocess, sys, tarfile, tempfile
import urllib.parse, urllib.request, uuid

AGE_SHA256 = 'eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c'
UNITS = ['meos-web.socket', 'meos-web.service', 'meos-calendar.socket', 'meos-calendar.service', 'meos-backend.service']
REQUIRED = {'native', 'calendar', 'configuration', 'release', 'units'}

def require(ok, message):
    if not ok: raise RuntimeError(message)

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()

def digest(path):
    with open(path, 'rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()

def ancestors(path):
    for parent in Path(path).absolute().parents:
        i = parent.lstat()
        require(stat.S_ISDIR(i.st_mode) and not i.st_mode & 0o022, 'unsafe path ancestor')

def private(path):
    path = Path(path); info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o077 and info.st_uid == os.geteuid() and info.st_nlink == 1, 'unsafe private file')
    return path

def atomic(path, value):
    fd, temp = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f, sort_keys=True, indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
        os.replace(temp, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally:
        if os.path.exists(temp): os.unlink(temp)

def config(path):
    # No secret/executable lookup, mkdir, or request before disabled check.
    try: c = json.loads(Path(path).read_text())
    except FileNotFoundError: return None, 'not-configured'
    require(isinstance(c, dict), 'configuration must be an object')
    if 'bucket' not in c or c['bucket'] == '': return None, 'no-bucket'
    require(isinstance(c['bucket'], str), 'bucket must be a string')
    require(isinstance(c.get('enabled', True), bool), 'enabled must be boolean')
    if not c.get('enabled', True): return None, 'disabled'
    private(path)
    require(c.get('schema') == 1, 'unsupported configuration schema')
    require(isinstance(c['bucket'], str) and re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', c['bucket']), 'invalid bucket')
    url = urllib.parse.urlsplit(c['endpoint'])
    require(url.scheme == 'https' and url.hostname and not url.username and not url.password and not url.query and not url.fragment and url.path in ['', '/'], 'HTTPS endpoint required')
    require(re.fullmatch(r'[A-Za-z0-9/_-]+', c['prefix']) and '..' not in c['prefix'], 'invalid prefix')
    require(re.fullmatch(r'[a-z0-9-]+', c['region']), 'invalid region')
    require(re.fullmatch(r'[a-f0-9]{32}', c['instanceId']), 'invalid instance identity')
    require(set(c['sources']) == REQUIRED, 'all five named source roots required')
    for path in [*c['sources'].values(), c['workDirectory'], c['age'], c['credentialsFile'], c['identityFile'], c['runtimeStateFile']]:
        require(isinstance(path, str) and Path(path).is_absolute() and '..' not in Path(path).parts, 'absolute normalized paths required')
    require(Path(c['runtimeStateFile']).is_relative_to(Path(c['sources']['configuration'])), 'runtime state must be included in configuration')
    roles = {'webIdentity','owner','accessKeys','calendarConfig','calendarOAuth','calendarPlanner'}
    require(set(c.get('requiredConfiguration', {})) == roles, 'all installed configuration roles required')
    for relative in c['requiredConfiguration'].values():
        require(isinstance(relative, str) and not Path(relative).is_absolute() and '..' not in Path(relative).parts, 'unsafe configuration role path')
    require(isinstance(c['recipient'], str) and c['recipient'].startswith('age1'), 'native age recipient required')
    for key, default in [('requiredPreupgrade', True), ('paused', False)]:
        require(isinstance(c.get(key, default), bool), 'invalid policy boolean')
    require(type(c.get('cadenceSeconds', 86400)) is int and c.get('cadenceSeconds', 86400) > 0, 'invalid cadence')
    require(type(c.get('maxArchiveBytes', 268435456)) is int and 0 < c.get('maxArchiveBytes', 268435456) <= 5368709120, 'invalid archive limit')
    require(type(c.get('keepLast', 0)) is int and c.get('keepLast', 0) >= 0, 'invalid retention')
    return c, None

def run(command):
    p = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={'PATH':'/usr/bin:/bin'}, timeout=600)
    require(p.returncode == 0, 'external operation failed; output suppressed'); return p.stdout

def systemctl(action, unit):
    require(unit in UNITS, 'unexpected service')
    if action == 'is-active':
        p = subprocess.run(['/usr/bin/systemctl','is-active',unit], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env={'PATH':'/usr/bin:/bin'}, timeout=30)
        state = p.stdout.decode().strip()
        require(state in ['active','inactive','failed','unknown'], 'service transitional or unknown')
        return state == 'active'
    run(['/usr/bin/systemctl',action,unit])

@contextlib.contextmanager
def locked(c):
    root = Path(c['workDirectory']); ancestors(root); root.mkdir(mode=0o700, parents=False, exist_ok=True)
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700, 'unsafe work directory')
    fd = os.open(root/'lock', os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB); yield root
    finally: os.close(fd)

def resume(root):
    journal = root/'writers.json'
    if journal.exists():
        value = json.loads(private(journal).read_text())
        require(set(value['active']) <= set(UNITS), 'invalid recovery journal')
        for unit in reversed(value['active']): systemctl('start', unit)
        journal.unlink()

@contextlib.contextmanager
def quiesce(root, c=None):
    require(not (root/'writers.json').exists(), 'interrupted run: invoke resume-writers')
    active = [u for u in UNITS if systemctl('is-active',u)]
    atomic(root/'writers.json', {'active':active,'at':now()})
    try:
        for unit in UNITS: systemctl('stop',unit)
        require(not any(systemctl('is-active',u) for u in UNITS), 'writer still active')
        if c is not None:
            state = json.loads(private(c['runtimeStateFile']).read_text())
            require(state['instanceId'] == c['instanceId'], 'runtime identity mismatch')
            require(not run(['/usr/bin/docker','--host','unix:///var/run/docker.sock','ps','-q','--filter','volume='+state['volume']]).strip(), 'container still writing native volume')
            volume = json.loads(run(['/usr/bin/docker','--host','unix:///var/run/docker.sock','volume','inspect',state['volume']]))[0]
            require(volume['Mountpoint'] == c['sources']['native'], 'native source is not runtime volume')
        yield
    finally: resume(root)

def snapshot(source, target):
    with contextlib.closing(sqlite3.connect(source.as_uri()+'?mode=ro', uri=True)) as original:
        with contextlib.closing(sqlite3.connect(target)) as copy:
            original.backup(copy)
            copy.execute('PRAGMA journal_mode=DELETE')
            require(copy.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'SQLite integrity failed')
            schema = copy.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
            version = copy.execute('PRAGMA user_version').fetchone()[0]
    os.chmod(target, 0o600)
    return {'schema':schema,'userVersion':version}

def stage(c, target):
    m = {'schema':1,'createdAt':now(),'instanceId':c['instanceId'],'files':{},'databases':{},'recoveryScope':sorted(REQUIRED),'applicationRecoveryVerified':False}
    for secret in [c['identityFile'], c['credentialsFile']]:
        require(not any(Path(secret).is_relative_to(Path(source)) for source in c['sources'].values()), 'backup key/credentials overlap archived roots')
    for root in c['sources'].values():
        p = Path(root); ancestors(p)
        require(p.is_dir() and not p.is_symlink(), 'source missing or symlinked')
        require(not Path(c['workDirectory']).is_relative_to(p), 'work directory overlaps source')
    for label, source in c['sources'].items():
        source = Path(source)
        for p in sorted(source.rglob('*')):
            rel = Path(label)/p.relative_to(source); dest = target/rel; info = p.lstat()
            require(not stat.S_ISLNK(info.st_mode), 'symlink in source')
            if stat.S_ISDIR(info.st_mode):
                dest.mkdir(parents=True, exist_ok=True, mode=0o700); continue
            if stat.S_ISSOCK(info.st_mode) and label == 'native' and p.name in ['server.sock','admin.sock']: continue
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'special or hardlinked source')
            sidecar = next((s for s in ['-wal','-shm','-journal'] if p.name.endswith(s)), None)
            if sidecar:
                with p.with_name(p.name[:-len(sidecar)]).open('rb') as f: require(f.read(16) == b'SQLite format 3\x00', 'unrecognized sidecar')
                continue
            dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with p.open('rb') as f: sqlite = f.read(16) == b'SQLite format 3\x00'
            if sqlite: m['databases'][str(rel)] = snapshot(p,dest)
            else: shutil.copyfile(p,dest); os.chmod(dest,0o600)
            m['files'][str(rel)] = {'sha256':digest(dest),'bytes':dest.stat().st_size,'mode':stat.S_IMODE(info.st_mode),'uid':info.st_uid,'gid':info.st_gid}
    require('native/data/main.db' in m['databases'], 'native database missing')
    require('calendar/private/calendar.sqlite' in m['databases'], 'Calendar database missing')
    require(any(k.startswith('configuration/') for k in m['files']), 'configuration empty')
    for relative in c['requiredConfiguration'].values():
        prefix = 'configuration/' + relative
        require(prefix in m['files'] or any(k.startswith(prefix.rstrip('/') + '/') for k in m['files']), 'installed configuration role missing')
    require('release/manifest.json' in m['files'], 'release manifest missing')
    require(all('units/'+u in m['files'] for u in UNITS), 'service units missing')
    with contextlib.closing(sqlite3.connect((target/'native/data/main.db').as_uri()+'?mode=ro',uri=True)) as db:
        require(db.execute('SELECT instance_id FROM _meos_instance').fetchall() == [(c['instanceId'],)], 'wrong instance')
    atomic(target/'manifest.json',m)
    return json.loads((target/'manifest.json').read_text())

def age(c, source, target, decrypt=False):
    require(digest(c['age']) == AGE_SHA256, 'unadmitted age executable')
    args = [c['age']]
    if decrypt:
        private(c['identityFile']); args += ['--decrypt','--identity',c['identityFile']]
    else: args += ['--encrypt','--recipient',c['recipient']]
    run(args+['--output',str(target),str(source)])

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise RuntimeError('S3 redirects forbidden')

class S3:
    """Path-style SigV4 using stdlib HMAC; verified TLS, no proxies/redirects."""
    def __init__(self,c):
        self.c = c; self.auth = json.loads(private(c['credentialsFile']).read_text())
        require(set(self.auth) in [{'accessKeyId','secretAccessKey'},{'accessKeyId','secretAccessKey','sessionToken'}], 'invalid credential file')
        require(all(isinstance(v,str) and v and '\n' not in v for v in self.auth.values()), 'invalid credentials')
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    def request(self,method,key,data=b''):
        c = self.c
        require(key.startswith(c['prefix'].rstrip('/')+'/') and '..' not in key, 'key outside prefix')
        endpoint = c['endpoint'].rstrip('/'); path = '/'+c['bucket']+'/'+urllib.parse.quote(key,safe='/')
        instant = dt.datetime.now(dt.timezone.utc); stamp = instant.strftime('%Y%m%dT%H%M%SZ'); day = instant.strftime('%Y%m%d')
        payload = hashlib.sha256(data).hexdigest()
        headers = {'host':urllib.parse.urlsplit(endpoint).netloc,'x-amz-date':stamp,'x-amz-content-sha256':payload}
        if self.auth.get('sessionToken'): headers['x-amz-security-token'] = self.auth['sessionToken']
        signed = ';'.join(sorted(headers))
        canonical = method+'\n'+path+'\n\n'+''.join(k+':'+headers[k]+'\n' for k in sorted(headers))+'\n'+signed+'\n'+payload
        scope = day+'/'+c['region']+'/s3/aws4_request'
        string = 'AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
        signing = ('AWS4'+self.auth['secretAccessKey']).encode()
        for part in [day,c['region'],'s3','aws4_request']: signing = hmac.new(signing,part.encode(),hashlib.sha256).digest()
        signature = hmac.new(signing,string.encode(),hashlib.sha256).hexdigest()
        headers['Authorization'] = 'AWS4-HMAC-SHA256 Credential='+self.auth['accessKeyId']+'/'+scope+', SignedHeaders='+signed+', Signature='+signature
        request = urllib.request.Request(endpoint+path,data=data if method == 'PUT' else None,headers=headers,method=method)
        with self.opener.open(request,timeout=120) as response:
            value = response.read(c.get('maxArchiveBytes', 268435456) + 1)
            require(len(value) <= c.get('maxArchiveBytes', 268435456), 'remote object exceeds configured limit')
            return value

def verify_tree(root):
    m = json.loads((root/'manifest.json').read_text()); require(m['schema'] == 1,'unsupported manifest')
    actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}-{'manifest.json'}
    require(actual == set(m['files']), 'archive inventory mismatch')
    require(set(m['databases']) <= set(m['files']), 'database inventory outside archive')
    require(m.get('recoveryScope') == sorted(REQUIRED), 'incomplete recovery scope')
    for name,item in m['files'].items():
        p = root/name; require(p.stat().st_size == item['bytes'] and digest(p) == item['sha256'], 'restore checksum mismatch')
    for name in m['databases']:
        with contextlib.closing(sqlite3.connect((root/name).as_uri()+'?mode=ro',uri=True)) as db:
            require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)],'restored database invalid')
    return m

def unpack(c, archive, target, temp):
    clear = temp/'restore.tar'; age(c,archive,clear,decrypt=True); target.mkdir(mode=0o700)
    with tarfile.open(clear) as tar:
        members = tar.getmembers(); names = [m.name for m in members]
        require(len(names) == len(set(names)), 'duplicate archive paths')
        for m in members:
            require(not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and (m.isfile() or m.isdir()),'unsafe archive member')
            if m.isdir(): (target/m.name).mkdir(parents=True,exist_ok=True,mode=0o700)
            else:
                dest = target/m.name; dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                with tar.extractfile(m) as src, dest.open('xb') as dst: shutil.copyfileobj(src,dst)
                os.chmod(dest,0o600)
    return verify_tree(target)

def backup(c,root,reason):
    require(not c.get('paused',False),'backup policy paused')
    run_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
    key = c['prefix'].rstrip('/')+'/'+run_id+'.tar.age'
    require(digest(c['age']) == AGE_SHA256,'unadmitted age executable'); private(c['identityFile']); remote = S3(c)
    with tempfile.TemporaryDirectory(prefix='run-',dir=root) as directory:
        temp = Path(directory); tree = temp/'tree'; tree.mkdir(mode=0o700)
        with quiesce(root,c): manifest = stage(c,tree)
        clear, encrypted = temp/'bundle.tar', temp/'bundle.tar.age'
        with tarfile.open(clear,'w') as tar:
            for p in sorted(tree.rglob('*')):
                if p.is_file(): tar.add(p,arcname=str(p.relative_to(tree)),recursive=False)
        require(clear.stat().st_size <= c.get('maxArchiveBytes', 268435456), 'archive exceeds configured limit')
        age(c,clear,encrypted)
        require(encrypted.stat().st_size <= c.get('maxArchiveBytes', 268435456), 'encrypted archive exceeds configured limit')
        checksum = digest(encrypted)
        remote.request('PUT',key,encrypted.read_bytes())
        fetched = temp/'download.tar.age'; fetched.write_bytes(remote.request('GET',key))
        require(digest(fetched) == checksum,'remote checksum mismatch')
        receipt = {'schema':1,'snapshot':key,'instanceId':c['instanceId'],'sha256':checksum,'backupSucceededAt':now(),
                   'snapshotAt':manifest['createdAt'],'reason':reason,'dataRestoreSucceededAt':None,'applicationRecoveryVerified':False}
        atomic(root/'last-backup.json',receipt)
        restored = unpack(c,fetched,temp/'restored',temp); require(restored == manifest,'restored manifest mismatch')
        receipt['dataRestoreSucceededAt'] = now()
        remote.request('PUT',key+'.receipt.json',json.dumps(receipt,sort_keys=True).encode())
        atomic(root/'last-restore.json',receipt)
        history = root/'receipts'; history.mkdir(mode=0o700,exist_ok=True); atomic(history/(run_id+'.json'),receipt)
        if c.get('heartbeatFile'):
            notice = json.loads(private(c['heartbeatFile']).read_text())
            url = urllib.parse.urlsplit(notice['url'])
            require(url.scheme == 'https' and url.hostname and not url.username and not url.password, 'invalid heartbeat endpoint')
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            req = urllib.request.Request(notice['url'], data=json.dumps({'snapshotAt':receipt['snapshotAt'], 'dataRestoreSucceededAt':receipt['dataRestoreSucceededAt']}).encode(), headers={'Content-Type':'application/json'}, method='POST')
            with opener.open(req, timeout=30) as response: response.read(1024)
        return receipt

def restore(c,key,output):
    # NEW isolated directory only. Never start services or use application sockets.
    target = Path(output).absolute(); ancestors(target); require(not target.exists() and not target.is_symlink(),'restore target exists')
    for p in [*c['sources'].values(),c['workDirectory']]:
        require(not target.is_relative_to(Path(p)) and not Path(p).is_relative_to(target),'restore target overlaps live data')
    remote = S3(c)
    with tempfile.TemporaryDirectory(prefix='meos-restore-') as directory:
        temp = Path(directory); receipt = json.loads(remote.request('GET',key+'.receipt.json'))
        require(receipt['snapshot'] == key and receipt['instanceId'] == c['instanceId'],'wrong snapshot identity')
        archive = temp/'download.tar.age'; archive.write_bytes(remote.request('GET',key))
        require(digest(archive) == receipt['sha256'],'remote checksum mismatch')
        manifest = unpack(c,archive,target,temp); require(manifest['instanceId'] == c['instanceId'],'wrong restored identity')
        return {'status':'isolated-data-restore-verified','target':str(target),'at':now(),'applicationRecoveryVerified':False}

def retention(c,root,apply):
    keep = c.get('keepLast',0); files = sorted((root/'receipts').glob('*.json')); candidates = files[:-keep] if keep else []
    keys = [json.loads(private(p).read_text())['snapshot'] for p in candidates]
    if apply:
        require(keep > 0,'keepLast=0 disables deletion'); remote = S3(c)
        for path,key in zip(candidates,keys):
            remote.request('DELETE',key); remote.request('DELETE',key+'.receipt.json'); path.unlink()
    return {'status':'retention-applied' if apply else 'retention-plan','objects':keys,'keepLast':keep}

@contextlib.contextmanager
def upgrade_guard(config_path='/etc/meos/backup.json'):
    c, disabled = config(config_path)
    if c is None:
        yield
        return
    with locked(c) as root:
        if c.get('requiredPreupgrade', True): backup(c, root, 'preupgrade')
        yield

def preupgrade(config_path='/etc/meos/backup.json'):
    with upgrade_guard(config_path): pass

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--config',default='/etc/meos/backup.json')
    sub = parser.add_subparsers(dest='action',required=True)
    for action in ['status','config-check','backup','due','preupgrade','resume-writers']: sub.add_parser(action)
    p = sub.add_parser('restore'); p.add_argument('--snapshot',required=True); p.add_argument('--output',required=True)
    p = sub.add_parser('retention'); p.add_argument('--apply',action='store_true')
    a = parser.parse_args(argv); c,disabled = config(a.config)
    if c is None:
        if a.action in ['status','config-check']: print(json.dumps({'enabled':False,'reason':disabled}))
        return 0
    if a.action in ['status','config-check']:
        result = {'enabled':True,'paused':c.get('paused',False),'requiredPreupgrade':c.get('requiredPreupgrade',True),'cadenceSeconds':c.get('cadenceSeconds',86400),'keepLast':c.get('keepLast',0)}
        if a.action == 'status':
            for name in ['last-backup','last-restore']:
                path = Path(c['workDirectory'])/(name+'.json'); result[name] = json.loads(private(path).read_text()) if path.exists() else None
        print(json.dumps(result)); return 0
    if a.action == 'restore': print(json.dumps(restore(c,a.snapshot,a.output))); return 0
    with locked(c) as root:
        if a.action == 'resume-writers': resume(root); result = {'status':'writers-resumed'}
        elif a.action == 'retention': result = retention(c,root,a.apply)
        else:
            if a.action == 'due':
                if c.get('paused',False): return 0
                last = root/'last-restore.json'
                if last.exists():
                    instant = dt.datetime.fromisoformat(json.loads(private(last).read_text())['dataRestoreSucceededAt'])
                    if (dt.datetime.now(dt.timezone.utc)-instant).total_seconds() < c.get('cadenceSeconds',86400): return 0
            if a.action == 'preupgrade' and not c.get('requiredPreupgrade',True): return 0
            result = backup(c,root,a.action)
        print(json.dumps(result))
    return 0

if __name__ == '__main__':
    os.umask(0o077)
    def interrupted(signum,frame): raise RuntimeError('interrupted')
    signal.signal(signal.SIGTERM,interrupted)
    try: sys.exit(main())
    except Exception:
        print(json.dumps({'status':'failed','action':'inspect private configuration; resume-writers if interrupted'}),file=sys.stderr); sys.exit(1)
