# SPDX-License-Identifier: Apache-2.0
"""Reviewed qualification helper. Exercise rendered units ONLY on a separately provisioned
acceptance-labelled synthetic target. No production target mode, no real input.
No caller-selected network endpoint. Leaves disposable data/evidence intact.
"""
import argparse,hashlib,http.client,json,os,pathlib,socket,stat,subprocess,time,urllib.parse
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--render-dir',required=True);p.add_argument('--bootstrap-dir',required=True);p.add_argument('--synthetic-owner-file',required=True);a=p.parse_args()
render=pathlib.Path(a.render_dir).absolute();bootstrap=pathlib.Path(a.bootstrap_dir).absolute();owner_path=pathlib.Path(a.synthetic_owner_file).absolute()
clean={'PATH':'/usr/bin:/bin'}
def read(path):
 i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022 and i.st_nlink==1 and i.st_size<10000000
 return json.loads(path.read_text())
receipt=read(render/'render-receipt.json');state=read(bootstrap/'runtime-state.json');intent=read(bootstrap/'bootstrap-receipt.json')
assert receipt['environment']==state['environment']=='acceptance' and intent['stage']=='complete'
run=state['instanceId'];prefix='meos-proof-'+run
assert receipt['prefix']==prefix and receipt['instanceId']==intent['instanceId']==run
assert state['image']==receipt['image']=='sha256:70e887448c5458d9735835a47bb3f1d2586a16cab1560df8f899cc55702bc63d'
assert pathlib.Path(receipt['state']).resolve()==(bootstrap/'runtime-state.json').resolve()
i=owner_path.lstat();assert i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and stat.S_IMODE(owner_path.parent.stat().st_mode)==0o700
owner=read(owner_path);assert set(owner)=={'email','password'} and owner['email'].endswith('@example.invalid') and owner['email']==intent['ownerEmail']
def command(*args):
 result=subprocess.run(args,env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
 assert result.returncode==0,'Trusted lifecycle command failed; inspect sanitized phase receipt'
 return result.stdout
def verify_target():
 c=json.loads(command('/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',state['containerId']))[0]
 v=json.loads(command('/usr/bin/docker','--host','unix:///var/run/docker.sock','volume','inspect',state['volume']))[0]
 assert c['Image']==state['image'] and c['Id']==state['containerId'] and c['HostConfig']['NetworkMode']=='none'
 for obj in [c['Config'],v]:
  assert obj['Labels']['meos.environment']=='acceptance' and obj['Labels']['meos.acceptance.run']==run and obj['Labels']['meos.provisioning.intent']==intent['intent']
 return pathlib.Path(v['Mountpoint'])
root=verify_target()
units=[prefix+'-backend.service',prefix+'-web.service',prefix+'-web.socket'];assert set(receipt['units'])==set(units)
for name in units:
 path=render/name;assert hashlib.sha256(path.read_bytes()).hexdigest()==receipt['units'][name]
 assert not (pathlib.Path('/run/systemd/system')/name).exists() and not (pathlib.Path('/etc/systemd/system')/name).exists()
assert 'ListenStream=127.0.0.1:3191\n' in (render/units[2]).read_text()
assert '@' not in (render/units[2]).read_text()
occupied=socket.socket();occupied.bind(('127.0.0.1',3191));occupied.close()
command('/usr/bin/systemd-analyze','verify','--man=no',*[str(render/name) for name in units])
def request(method,path,body=None,headers=None):
 client=http.client.HTTPConnection('127.0.0.1',3191,timeout=15)
 try:
  client.request(method,path,body,{'Host':'meos.aidans.computer',**(headers or {})});response=client.getresponse();data=response.read(2000000)
  return response.status,data,response.getheaders()
 finally:client.close()
def await_web():
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  try:
   code,data,_=request('GET','/config.js')
   if code==200 and b'"demo":false' in data:return
  except (OSError,http.client.HTTPException):pass
  time.sleep(.2)
 raise RuntimeError('Rendered web readiness failed')
def web_identity():
 pid=int(command('/usr/bin/systemctl','show','--property=MainPID','--value',units[1]));assert pid>0
 lines=pathlib.Path('/proc/'+str(pid)+'/status').read_text().splitlines()
 assert next(line for line in lines if line.startswith('Uid:')).split()[1:]==['61002']*4
 assert all(int(line.split()[1],16)==0 for line in lines if line.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
 assert os.readlink('/proc/'+str(pid)+'/ns/net')!=os.readlink('/proc/self/ns/net')
 return pid
checks={};installed=[]
try:
 for name in units:
  target=pathlib.Path('/run/systemd/system')/name
  with target.open('x') as f:f.write((render/name).read_text())
  os.chmod(target,0o644);installed.append(target)
 command('/usr/bin/systemctl','daemon-reload')
 command('/usr/bin/systemctl','start',units[2])
 # Positive host-visible prestart denial: a live reserved-UID decoy must prevent
 # activation, proving the '+' prestart is not fooled by ProtectProc filtering.
 decoy=subprocess.Popen(['/usr/bin/setpriv','--reuid=61002','--regid=61002','--clear-groups','/usr/bin/python3','-c','import sys;print("ready",flush=True);sys.stdin.buffer.read()'],env=clean,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  assert decoy.stdout.readline()==b'ready\n' and decoy.poll() is None
  result=subprocess.run(['/usr/bin/systemctl','start',units[1]],env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
  assert result.returncode!=0 and decoy.poll() is None
  journal=command('/usr/bin/journalctl','--no-pager','-o','cat','-u',units[1])
  assert b'Web UID/GID already active' in journal
  assert int(command('/usr/bin/systemctl','show','--property=MainPID','--value',units[1]))==0
  checks['hostVisibleUid61002PrestartDecoyDenied']=True
 finally:
  decoy.stdin.close();decoy.wait(timeout=5)
 command('/usr/bin/systemctl','reset-failed',units[1])
 await_web();before=web_identity();checks['socketActivationUID61002PrivateNetworkZeroCaps']=True
 code,body,_=request('GET','/');assert code==200
 manifest=read(pathlib.Path(receipt['release'])/'manifest.json');assert hashlib.sha256(body).hexdigest()==manifest['files']['client/_shell.html'];checks['exactShellBytes']=True
 for path in ['/api/_admin/user','/api/auth/v1/register','/api/meos/v1/mcp','/api/records/v1/tasks','/mockServiceWorker.js']:
  code,_,_=request('GET',path);assert code in [403,404]
 checks['privateAndDemoRoutesDenied']=True
 code,_,headers=request('POST','/api/auth/v1/login',urllib.parse.urlencode(owner),{'Content-Type':'application/x-www-form-urlencoded','Origin':state['origin']});assert code in [200,303]
 cookie='; '.join(value.split(';')[0] for key,value in headers if key.lower()=='set-cookie');assert cookie
 code,body,_=request('GET','/api/meos/v1/session',headers={'Cookie':cookie});assert code==200 and json.loads(body)['user']['id']==intent['ownerId'];checks['privateBodyProvisionedOwnerLogin']=True
 inode=(root/'server.sock').stat().st_ino
 verify_target();command('/usr/bin/systemctl','restart',units[0]);await_web();after=web_identity()
 assert before!=after and (root/'server.sock').stat().st_ino!=inode
 code,body,_=request('GET','/api/meos/v1/session',headers={'Cookie':cookie});assert code==200 and json.loads(body)['user']['id']==intent['ownerId'];checks['backendRestartWebReboundNewSocketAndSessionPersists']=True
 command('/usr/bin/systemctl','stop',units[0])
 status=subprocess.run(['/usr/bin/systemctl','is-active','--quiet',units[1]],env=clean);assert status.returncode!=0;checks['backendStopPropagatesToWeb']=True
 # Socket remains active and the next request must reactivate backend then web.
 await_web();web_identity();checks['socketReactivationAfterBackendStop']=True
 logs=command('/usr/bin/journalctl','--no-pager','-o','cat','-u',units[0],'-u',units[1]);assert owner['password'].encode() not in logs and b'Created new admin user' not in logs
 checks['noCredentialJournalOutput']=True
finally:
 if installed:
  subprocess.run(['/usr/bin/systemctl','stop',units[2],units[1],units[0]],env=clean,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=90)
 for target in installed:
  assert hashlib.sha256(target.read_bytes()).hexdigest()==receipt['units'][target.name];target.unlink()
 if installed:command('/usr/bin/systemctl','daemon-reload')
(render/'lifecycle-proof.json').write_text(json.dumps({'status':'isolated-rendered-unit-proof-passed','instanceId':run,'image':state['image'],'renderedUnits':receipt['units'],'checks':checks,'count':len(checks),'disposableVolumePreserved':True},indent=2)+'\n')
print(json.dumps({'status':'isolated-rendered-unit-proof-passed','checks':len(checks),'evidence':str(render/'lifecycle-proof.json')}))
