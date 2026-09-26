# SPDX-License-Identifier: Apache-2.0
"""Isolated synthetic rendered Calendar sidecar lifecycle. No production mode.
Snapshots source into a new root-owned qualification directory; installs only
uniquely named temporary /run units and removes them after the proof.
"""
import fcntl,hashlib,http.client,json,os,pathlib,shutil,socket,subprocess,time,uuid
assert os.geteuid()==0
clean={'PATH':'/usr/bin:/bin'}
lease=os.open('/run/lock/meos-calendar-qualification-61004.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61004' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env=clean,text=True).split()
repo=pathlib.Path(__file__).resolve().parents[1];run=uuid.uuid4().hex;prefix='meos-calendar-proof-'+run
base=pathlib.Path('/var/lib')/prefix;base.mkdir(mode=0o700);release=base/'release';release.mkdir(mode=0o755)
(release/'backend').mkdir();(release/'scripts').mkdir()
for source in (repo/'backend').glob('*.mjs'):
 assert source.is_file() and not source.is_symlink();shutil.copyfile(source,release/'backend'/source.name)
for name in ['serve-calendar.mjs','calendar-uid-check.py']:shutil.copyfile(repo/'scripts'/name,release/'scripts'/name)
node=pathlib.Path('/home/clawy/.local/share/mise/installs/node/24.19.0')
state=base/'state';state.mkdir(mode=0o700);os.chown(state,61004,61004)
config={'origin':'https://calendar.example.invalid','ownerId':'synthetic-owner','ownerEmail':'owner@example.invalid','redirectUri':'https://calendar.example.invalid/api/calendar/google/callback','googlePins':{'oauth2.googleapis.com':['203.0.113.1'],'www.googleapis.com':['203.0.113.1']}}
for name,value in [('config.json',config),('oauth.json',{'clientId':'synthetic.apps.googleusercontent.com','clientSecret':'synthetic-no-real-credential'})]:
 p=base/name;p.write_text(json.dumps(value));os.chown(p,0,61004);os.chmod(p,0o440)
values={'RELEASE':str(release),'NODE_DIR':str(node),'CONFIG':str(base/'config.json'),'OAUTH':str(base/'oauth.json'),'STATE':str(state),'GOOGLE_ALLOW':'IPAddressAllow=203.0.113.1/32'}
unit=(repo/'deployment/meos-calendar.service.in').read_text().replace('meos-calendar.socket',prefix+'.socket')
for key,value in values.items():unit=unit.replace('@'+key+'@',value)
assert '@' not in unit
socket_path='/run/'+prefix+'/control.sock'
socket_unit=(repo/'deployment/meos-calendar.socket').read_text().replace('/run/meos-calendar/control.sock',socket_path)
units={prefix+'.service':unit,prefix+'.socket':socket_unit}
def command(*args):
 r=subprocess.run(args,env=clean,capture_output=True,text=True,timeout=30);assert r.returncode==0,(args[0],r.returncode,r.stderr[-500:]);return r.stdout
class UnixConnection(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(5);self.sock.connect(socket_path)
def call(operation,payload):
 c=UnixConnection('localhost',timeout=5)
 try:c.request('POST','/'+operation,json.dumps(payload),{'Content-Type':'application/json'});r=c.getresponse();return r.status,json.loads(r.read())
 finally:c.close()
installed=[];checks={}
try:
 for name,text in units.items():
  p=pathlib.Path('/run/systemd/system')/name;assert not p.exists() and not (pathlib.Path('/etc/systemd/system')/name).exists();p.write_text(text);installed.append(p)
 command('/usr/bin/systemctl','daemon-reload');command('/usr/bin/systemctl','start',prefix+'.socket')
 assert call('status',{'ownerId':'synthetic-owner'})==(200,{'state':'disconnected','syncActive':False,'lastSyncAt':None,'nextSyncAt':None,'syncError':None})
 checks['socketActivatedExactSource']=True
 pid=int(command('/usr/bin/systemctl','show','--property=MainPID','--value',prefix+'.service'));assert pid>0
 status=pathlib.Path('/proc/'+str(pid)+'/status').read_text().splitlines();assert next(x for x in status if x.startswith('Uid:')).split()[1:]==['61004']*4;assert all(int(x.split()[1],16)==0 for x in status if x.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
 checks['uid61004ZeroCapabilities']=True
 code,data=call('connect',{'ownerId':'synthetic-owner','session':'synthetic-flow'});assert code==200 and data['authorizationUrl'].startswith('https://accounts.google.com/o/oauth2/v2/auth?')
 command('/usr/bin/systemctl','restart',prefix+'.service')
 assert call('status',{'ownerId':'synthetic-owner'})==(200,{'state':'connecting','syncActive':False,'lastSyncAt':None,'nextSyncAt':None,'syncError':None})
 assert pid!=int(command('/usr/bin/systemctl','show','--property=MainPID','--value',prefix+'.service'));checks['privateStateSurvivesRestart']=True
 assert call('status',{'ownerId':'other'})[0]==503;checks['wrongOwnerRejected']=True
 assert call('disconnect',{'ownerId':'synthetic-owner'})[0]==200
 assert call('status',{'ownerId':'synthetic-owner'})==(200,{'state':'disconnected','syncActive':False,'lastSyncAt':None,'nextSyncAt':None,'syncError':None})
 checks['disconnectPersists']=True
 logs=command('/usr/bin/journalctl','--no-pager','-o','cat','-u',prefix+'.service');assert 'synthetic-no-real-credential' not in logs and 'synthetic-flow' not in logs;checks['credentialsNotLogged']=True
 files={str(p.relative_to(release)):hashlib.sha256(p.read_bytes()).hexdigest() for p in release.rglob('*') if p.is_file()}
 proof={'runId':run,'environment':'acceptance','syntheticOnly':True,'checks':checks,'sourceFiles':files,'nodeSHA256':hashlib.sha256((node/'bin/node').read_bytes()).hexdigest(),'units':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in units.items()},'artifacts':str(base)}
 (base/'proof.json').write_text(json.dumps(proof,indent=2)+'\n');target=repo/'.qualification/calendar-lifecycle-proof.json';target.write_text(json.dumps(proof,indent=2)+'\n');os.chown(target,repo.stat().st_uid,repo.stat().st_gid);print(json.dumps({'count':len(checks),'checks':checks,'proof':str(target)}))
finally:
 for suffix in ['.socket','.service']:subprocess.run(['/usr/bin/systemctl','stop',prefix+suffix],env=clean,capture_output=True,timeout=15)
 for p in installed:p.unlink()
 subprocess.run(['/usr/bin/systemctl','daemon-reload'],env=clean,capture_output=True,timeout=15)
