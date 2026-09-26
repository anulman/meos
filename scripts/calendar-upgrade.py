# SPDX-License-Identifier: Apache-2.0
"""Exact-admission, preserved-volume backend transition. Never creates/reseeds data.
Retains old container, cold data copy, state and units for rollback. Leaves web
stopped until independently reviewed web/Calendar activation completes. All
arguments are non-secret paths. Interrupted transitions require reconciliation.
"""
import argparse,hashlib,importlib.util,http.client,json,os,pathlib,re,shutil,socket,sqlite3,stat,subprocess,sys,time
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--release',required=True);p.add_argument('--admission',required=True);p.add_argument('--output',required=True);a=p.parse_args()
clean={'PATH':'/usr/bin:/bin'}
def secure(path,private=False):
 path=pathlib.Path(path).absolute();i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022 and i.st_nlink==1
 if private:assert stat.S_IMODE(i.st_mode)==0o600
 for parent in path.parents:
  i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 return path
state_path=secure(a.state,True);release=pathlib.Path(a.release).absolute();manifest_path=secure(release/'manifest.json');admission_path=secure(a.admission,True)
state=json.loads(state_path.read_text());manifest=json.loads(manifest_path.read_text());admission=json.loads(admission_path.read_text())
assert admission['status']=='approved-calendar-preserved-upgrade' and admission['reviewer'] and admission['evidence']
assert admission['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
preservation_path=pathlib.Path(__file__).with_name('calendar-preservation.py');assert admission['preservationSHA256']==hashlib.sha256(preservation_path.read_bytes()).hexdigest()
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('calendar_preservation',preservation_path);preservation=importlib.util.module_from_spec(spec);spec.loader.exec_module(preservation)
assert admission['stateSHA256']==hashlib.sha256(state_path.read_bytes()).hexdigest() and admission['manifestSHA256']==hashlib.sha256(manifest_path.read_bytes()).hexdigest()
assert state['environment'] in ['production','acceptance'] and admission['environment']==state['environment']
if state['environment']=='production':assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed'
else:assert manifest['status'] in ['qualification-only','independently-reviewed']
assert re.fullmatch('sha256:[a-f0-9]{64}',manifest['image']) and manifest['image']==admission['newImage']
run=state['instanceId'];assert re.fullmatch('[a-f0-9]{32}',run)
name='meos-'+state['environment']+'-'+run;assert state['volume']==name+'-data';rollback=name+'-rollback-'+state['image'][7:19]
out=pathlib.Path(a.output).absolute();assert str(out)==admission['output'] and not out.exists(),'Existing transition: reconcile, never retry automatically'
for parent in out.parents:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
out.mkdir(mode=0o700)
def command(*args):
 r=subprocess.run(args,env=clean,capture_output=True,timeout=90);assert r.returncode==0,'Operation failed; reconcile retained transition state';return r.stdout
def docker(*args):return command('/usr/bin/docker','--host','unix:///var/run/docker.sock',*args)
def save(name,value):
 p=out/(name+'.pending');fd=os.open(p,os.O_CREAT|os.O_WRONLY|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(p,out/name)
def inspect(target):return json.loads(docker('inspect',target))[0]
old=inspect(name);v=json.loads(docker('volume','inspect',state['volume']))[0]
def verify(c,image,cid,running=None):
 h=c['HostConfig'];assert c['Id']==cid and c['Image']==image
 if running is not None:assert c['State']['Running']==running
 assert c['Config']['User']=='10001:10001' and set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
 assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom') and h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges'] and not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
 label='meos.'+('production.instance' if state['environment']=='production' else 'acceptance.run')
 for labels in [c['Config']['Labels'],v['Labels']]:assert labels[label]==run and labels['meos.environment']==state['environment']
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name']==state['volume'] and mounts[0]['Destination']=='/data' and mounts[0]['Source']==v['Mountpoint'] and v['Driver']=='local' and not v['Options']
 assert c['Config']['Cmd']==['/bin/trail','--depot','/data','--public-url',state['origin'],'run','--address','unix:/data/server.sock','--admin-address','unix:/data/admin.sock']
verify(old,state['image'],state['containerId'],True)
image=inspect(manifest['image']);assert image['Id']==manifest['image'] and image['Config']['User']=='10001:10001'
assert not any(x['Name']=='/'+rollback for x in json.loads(docker('inspect',state['containerId']))),'Rollback name must differ'
exists=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',rollback],env=clean,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);assert exists.returncode!=0,'Rollback name already exists'
root=pathlib.Path(v['Mountpoint']);assert root.is_dir() and not root.is_symlink()
def invariants():
 with sqlite3.connect('file:'+str(root/'data/main.db')+'?mode=ro',uri=True) as db:
  assert db.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(run,'production')]
  return preservation.fingerprint(db)
invariants() # Fail required-table/identity preflight before stopping any service.

save('before-state.json',state);save('before-manifest-reference.json',{'path':str(manifest_path),'sha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest()})
units=out/'before-units';units.mkdir(mode=0o700)
if state['environment']=='production':
 for unit in ['meos-web.service','meos-web.socket','meos-backend.service']:
  source=pathlib.Path('/etc/systemd/system')/unit;secure(source);shutil.copy2(source,units/unit)
 for unit in ['meos-web.socket','meos-web.service','meos-backend.service']:command('/usr/bin/systemctl','stop',unit)
else:docker('stop','--time','20',state['containerId'])
verify(inspect(state['containerId']),state['image'],state['containerId'],False)
save('stopped.json',{'oldContainer':state['containerId'],'volume':state['volume']})
# No application process may hold this volume while copying/checking data.
assert not docker('ps','-q','--filter','volume='+state['volume']).strip(),'Another writer still has the volume'
before=invariants();save('before-data-digests.json',before)
assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in (root/'data').rglob('*'))
shutil.copytree(root/'data',out/'cold-data-copy',symlinks=False);save('cold-copy.json',{'sourceVolume':state['volume'],'databasePreserved':True})
docker('rename',state['containerId'],rollback);save('renamed.json',{'oldContainer':state['containerId'],'rollbackName':rollback})
label='meos.'+('production.instance' if state['environment']=='production' else 'acceptance.run')
new_id=docker('create','--name',name,'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1200m','--pids-limit','128','--label','meos.environment='+state['environment'],'--label',label+'='+run,'--mount','type=volume,src='+state['volume']+',dst=/data','--tmpfs','/tmp:rw,noexec,nosuid,size=64m',manifest['image'],*old['Config']['Cmd']).decode().strip()
new_state={**state,'image':manifest['image'],'containerId':new_id};save('runtime-state.json',new_state);verify(inspect(new_id),manifest['image'],new_id,False)
docker('start',new_id)
# Docker's attached-volume mountpoint may exceed AF_UNIX's 108-byte limit.
# Pin the verified directory and use its short proc-fd alias, not a moved socket.
root_fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
class UDS(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX);self.sock.settimeout(3);self.sock.connect('/proc/self/fd/'+str(root_fd)+'/server.sock')
deadline=time.monotonic()+60
while True:
 verify(inspect(new_id),manifest['image'],new_id,True)
 try:
  client=UDS('meos.aidans.computer',timeout=3)
  try:
   client.request('GET','/api/meos/v1/instance');response=client.getresponse();data=response.read(8193);assert response.status==200 and json.loads(data)=={'instanceId':run,'environment':'production'}
  finally:client.close()
  break
 except (FileNotFoundError,ConnectionRefusedError,TimeoutError):
  if time.monotonic()>deadline:raise RuntimeError('New backend readiness failed; rollback artifacts retained')
  time.sleep(.2)
os.close(root_fd)
assert invariants()==before,'Persisted owner/domain rows changed during upgrade; hold web, reconcile cold copy'
save('receipt.json',{'status':'backend-upgraded-web-held','environment':state['environment'],'instanceId':run,'oldContainer':state['containerId'],'newContainer':new_id,'image':manifest['image'],'volume':state['volume'],'oldContainerPreserved':True,'coldCopyRetained':True,'ownerAndDomainRowsUnchanged':True,'state':str(out/'runtime-state.json')})
print(json.dumps({'status':'backend-upgraded-web-held','receipt':str(out/'receipt.json')}))
