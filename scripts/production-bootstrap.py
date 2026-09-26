# SPDX-License-Identifier: Apache-2.0
"""Reviewed trusted provisioning controller; NOT a repository test launcher.

Only explicit root-owned reviewed plans can allocate a fresh named target. Secret
input is a root0700-directory/root0600 JSON file, never argv/env/chat/logs. This
source passed independent review and isolated synthetic qualification. Production
policy/input admission remains separate. No automatic resets.
"""
import argparse,base64,fcntl,hashlib,http.client,json,os,pathlib,re,secrets,socket,sqlite3,stat,subprocess,time,uuid
from zoneinfo import ZoneInfo
IMAGE='sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d'
ORIGIN='https://meos.aidans.computer'
CLEAN={'PATH':'/usr/bin:/bin'}
def secure_dir(path,private=False):
 i=path.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 if private:assert stat.S_IMODE(i.st_mode)==0o700
 for parent in path.parents:
  i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
def read_root_json(path,secret=False,manifest=False):
 secure_dir(path.parent,private=secret)
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  i=os.fstat(fd);assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and i.st_nlink==1
  assert stat.S_IMODE(i.st_mode)==(0o444 if manifest else 0o600) and i.st_size<=65536
  data=os.read(fd,65537);assert len(data)<=65536
  after=os.fstat(fd);assert (i.st_ino,i.st_dev,i.st_size,i.st_mtime_ns)==(after.st_ino,after.st_dev,after.st_size,after.st_mtime_ns)
  return json.loads(data)
 finally:os.close(fd)
def save(path,value):
 temp=path.with_suffix(path.suffix+'.pending');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,path);fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);os.fsync(fd);os.close(fd)
def docker(*args):
 p=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=CLEAN,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
 if p.returncode:raise RuntimeError('Private Docker operation failed')
 return p.stdout+p.stderr if args[0]=='logs' else p.stdout
def inspect(kind,name):
 p=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',kind,'inspect',name],env=CLEAN,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 if p.returncode:
  expected={'container':'Error response from daemon: No such container: '+name,'volume':'Error response from daemon: get '+name+': no such volume'}
  assert kind in expected and p.returncode==1 and p.stdout.strip()==b'[]' and p.stderr.decode().strip()==expected[kind], 'Docker inspect unavailable, not proof of absence'
  return None
 return json.loads(p.stdout)[0]
class UDS(http.client.HTTPConnection):
 def __init__(self,root,part):super().__init__('meos.aidans.computer',timeout=15);self.root=root;self.part=part
 def connect(self):
  fd=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
   info=os.stat(self.part,dir_fd=fd,follow_symlinks=False);assert stat.S_ISSOCK(info.st_mode) and info.st_uid==10001
   self.sock=socket.socket(socket.AF_UNIX);self.sock.settimeout(self.timeout);self.sock.connect('/proc/self/fd/'+str(fd)+'/'+self.part)
  finally:os.close(fd)
def main():
 assert os.geteuid()==0
 parser=argparse.ArgumentParser();parser.add_argument('--plan',required=True);parser.add_argument('--owner-file',required=True);parser.add_argument('--receipt-dir',required=True);args=parser.parse_args()
 plan_path=pathlib.Path(args.plan).absolute();owner_path=pathlib.Path(args.owner_file).absolute();out=pathlib.Path(args.receipt_dir).absolute()
 secure_dir(out,private=True)
 lease=os.open(out/'bootstrap.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);assert os.fstat(lease).st_uid==0;fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
 plan=read_root_json(plan_path)
 assert set(plan)=={'schema','environment','instanceId','image','origin','timezone','reviewStatus','reviewer','reviewEvidence','releaseManifestSHA256','releaseManifestFile','ownerInputKind'}
 assert plan['schema']==1 and plan['environment'] in ['production','acceptance'] and plan['image']==IMAGE and plan['origin']==ORIGIN
 assert re.fullmatch('[a-f0-9]{32}',plan['instanceId']) and re.fullmatch('[a-f0-9]{64}',plan['releaseManifestSHA256'])
 assert plan['reviewer'] and plan['reviewEvidence'];ZoneInfo(plan['timezone'])
 production=plan['environment']=='production'
 assert plan['reviewStatus']==('approved-for-production-bootstrap' if production else 'approved-for-isolated-qualification')
 assert plan['ownerInputKind']==('generated-owner-file' if production else 'synthetic-only-file')
 release_path=pathlib.Path(plan['releaseManifestFile']);assert release_path.is_absolute()
 manifest=read_root_json(release_path,manifest=True)
 assert hashlib.sha256(release_path.read_bytes()).hexdigest()==plan['releaseManifestSHA256'] and manifest['image']==IMAGE
 if production:assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed' and manifest['nodeRuntimeLicenseReview']
 else:assert manifest['status'] in ['qualification-only','independently-reviewed']
 run=plan['instanceId'];name='meos-'+plan['environment']+'-'+run;volume=name+'-data';receipt_path=out/'bootstrap-receipt.json'
 plan_digest=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest()
 if receipt_path.exists():
  receipt=read_root_json(receipt_path);assert receipt['planDigest']==plan_digest and receipt['instanceId']==run
 else:
  assert inspect('container',name) is None and inspect('volume',volume) is None, 'Preexisting target without intent; reconcile manually'
  receipt={'schema':1,'planDigest':plan_digest,'instanceId':run,'intent':secrets.token_hex(32),'stage':'intent','containerId':None,'ownerId':None,'ownerEmail':None}
  save(receipt_path,receipt)
 key='meos.production.instance' if production else 'meos.acceptance.run'
 labels={'meos.environment':plan['environment'],key:run,'meos.provisioning.intent':receipt['intent']}
 def label_check(obj):
  assert all(obj['Labels'].get(k)==v for k,v in labels.items()), 'Physical target intent mismatch'
 def verify(require_running=False):
  c=inspect('container',name);v=inspect('volume',volume);assert c and v
  assert c['Id']==receipt['containerId'] and c['Image']==IMAGE
  h=c['HostConfig'];assert c['Config']['User']=='10001:10001' and set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
  assert h['NetworkMode']=='none' and set(c['NetworkSettings']['Networks'])=={'none'} and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom')
  assert h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges'] and not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
  label_check(c['Config']);label_check(v);assert v['Name']==volume and v['Driver']=='local' and not v['Options']
  mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==volume and mounts[0]['Destination']=='/data'
  if require_running:assert c['State']['Running']
  return c,pathlib.Path(v['Mountpoint'])
 if receipt['stage']=='complete':
  _,root=verify(True)
  with sqlite3.connect('file:'+str(root/'data/main.db')+'?mode=ro',uri=True) as conn:
   assert conn.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(run,'production')]
   row=conn.execute('SELECT hex(id),admin FROM _user WHERE email=?',(receipt['ownerEmail'],)).fetchone();assert row==(uuid.UUID(receipt['ownerId']).hex.upper(),0)
  print(json.dumps({'status':'already-complete-no-reset','instanceId':run}));return
 owner=read_root_json(owner_path,secret=True);assert set(owner)=={'email','password'}
 assert isinstance(owner['email'],str) and 3<=len(owner['email'])<=254 and '@' in owner['email'] and owner['email']==owner['email'].strip()
 assert isinstance(owner['password'],str) and 8<=len(owner['password'].encode())<=128
 assert owner['email'].endswith('@example.invalid') is (not production)
 assert receipt['ownerEmail'] in [None,owner['email']]
 receipt['ownerEmail']=owner['email'];save(receipt_path,receipt)
 # Durable nonce proves interrupted creates belong to this intent. No acceptance promotion.
 v=inspect('volume',volume)
 if v is None:
  assert receipt['stage']=='intent'
  docker('volume','create',*[arg for k,v in labels.items() for arg in ['--label',k+'='+v]],volume)
 v=inspect('volume',volume);label_check(v);assert v['Driver']=='local' and not v['Options']
 c=inspect('container',name)
 if c is None:
  assert receipt['containerId'] is None
  docker('create','--name',name,'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1200m','--pids-limit','128',*[arg for k,v in labels.items() for arg in ['--label',k+'='+v]],'--mount','type=volume,src='+volume+',dst=/data','--tmpfs','/tmp:rw,noexec,nosuid,size=64m',IMAGE,'/bin/trail','--depot','/data','--public-url',ORIGIN,'run','--address','unix:/data/server.sock','--admin-address','unix:/data/admin.sock')
 c=inspect('container',name);label_check(c['Config']);assert c['Image']==IMAGE
 assert receipt['containerId'] in [None,c['Id']]
 receipt['containerId']=c['Id'];receipt['stage']='allocated';save(receipt_path,receipt)
 c,root=verify()
 if not c['State']['Running']:docker('start',name)
 deadline=time.monotonic()+60
 while True:
  verify(True)
  if (root/'server.sock').is_socket() and (root/'admin.sock').is_socket():break
  assert time.monotonic()<deadline, 'Readiness timeout';time.sleep(.1)
 assert root.stat().st_uid==10001
 def db():verify(True);return sqlite3.connect(root/'data/main.db')
 def request(part,method,route,body=None,headers=None):
  verify(True);client=UDS(root,part)
  try:
   client.request(method,route,body,headers or {});response=client.getresponse();data=response.read(65537);assert len(data)<=65536;return response.status,data
  finally:client.close()
 with db() as conn:
  rows=conn.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()
  if not rows:conn.execute('INSERT INTO _meos_instance VALUES(1,?,?)',(run,'production'))
  else:assert rows==[(run,'production')]
  row=conn.execute('SELECT id,admin,unverified_email FROM _user WHERE email=?',(owner['email'],)).fetchone()
 if row is None:
  assert receipt['ownerId'] is None, 'Recorded owner disappeared; recovery is separate'
  verify(True);tokens=json.loads(base64.b64decode(docker('exec',name,'/bin/trail','--depot','/data','user','mint','admin@localhost').strip()))
  token=tokens['auth_token'];claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
  code,data=request('admin.sock','POST','/api/_admin/user',json.dumps({**owner,'verified':True,'admin':False}),{'Authorization':'Bearer '+token,'CSRF-Token':claims['csrf_token'],'Content-Type':'application/json'})
  assert code==200,'Private create failed; never reset or print response'
  owner_id=str(uuid.UUID(json.loads(data)['id']));del tokens,token,claims
 else:
  assert row[1:]==(0,None);owner_id=str(uuid.UUID(bytes=row[0]))
 assert receipt['ownerId'] in [None,owner_id]
 # A reconciled interrupted create must prove the original supplied password works.
 code,data=request('server.sock','POST','/api/auth/v1/login',json.dumps(owner),{'Content-Type':'application/json','Origin':ORIGIN});assert code==200,'Owner proof failed; no password reset'
 del data
 receipt['ownerId']=owner_id;receipt['stage']='owner-proven';save(receipt_path,receipt)
 with db() as conn:
  now=int(time.time()*1000);defaults={'timezone':plan['timezone'],'weekStartsOn':1,'weather':{'enabled':False,'source':'latest','units':'celsius'}}
  if conn.execute('SELECT owner_id FROM preferences WHERE owner_id=?',(uuid.UUID(owner_id).bytes,)).fetchone() is None:
   conn.execute('INSERT INTO preferences(owner_id,doc,revision,created_at,updated_at) VALUES(?,?,1,?,?)',(uuid.UUID(owner_id).bytes,json.dumps(defaults,separators=(',',':')),now,now))
  admin=conn.execute("SELECT admin FROM _user WHERE email='admin@localhost'").fetchone()
 if admin is not None:
  verify(True)
  if admin==(1,):docker('exec',name,'/bin/trail','--depot','/data','admin','demote','admin@localhost')
  else:assert admin==(0,)
  verify(True);docker('exec',name,'/bin/trail','--depot','/data','user','invalidate-session','admin@localhost')
  verify(True);docker('exec',name,'/bin/trail','--depot','/data','user','delete','admin@localhost')
 with db() as conn:
  assert conn.execute('SELECT COUNT(*) FROM _user WHERE admin=1').fetchone()==(0,)
  assert conn.execute('SELECT COUNT(*) FROM _user').fetchone()==(1,)
 code,data=request('server.sock','GET','/api/meos/v1/instance');assert code==200 and json.loads(data)=={'instanceId':run,'environment':'production'}
 logs=docker('logs',name);assert owner['password'].encode() not in logs and b'Created new admin user' not in logs
 del owner,logs
 state={'environment':plan['environment'],'instanceId':run,'image':IMAGE,'containerId':receipt['containerId'],'volume':volume,'origin':ORIGIN}
 save(out/'runtime-state.json',state);receipt['stage']='complete';save(receipt_path,receipt)
 print(json.dumps({'status':'owner-provisioned-no-routing-change','instanceId':run,'stateFile':str(out/'runtime-state.json')}))
if __name__=='__main__':
 try:main()
 except Exception as error:
  # No raw response, exception value or traceback can disclose owner/token input.
  print('Bootstrap stopped ('+type(error).__name__+'); reconcile private receipt; no automatic password reset.',flush=True)
  raise SystemExit(1)
