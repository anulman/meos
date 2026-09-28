# SPDX-License-Identifier: Apache-2.0
"""Mint a renewable session for the admitted EXISTING owner; never create users/grants.
Use separate session output directories for independently refreshing clients.
"""
import argparse,base64,hashlib,json,os,pathlib,re,sqlite3,stat,subprocess,time,uuid
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--access-config',required=True);p.add_argument('--admission',required=True);p.add_argument('--output',required=True);a=p.parse_args()
clean={'PATH':'/usr/bin:/bin'}
def secure(path):
 path=pathlib.Path(path).absolute();i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and i.st_nlink==1
 for parent in path.parents:
  i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 return path
state_path=secure(a.state);access_path=secure(a.access_config);admission_path=secure(a.admission)
state=json.loads(state_path.read_text());access=json.loads(access_path.read_text());admission=json.loads(admission_path.read_text())
assert admission['status']=='approved-delegated-session' and admission['reviewer'] and admission['evidence']
policy=admission.get('sessionPolicy','native-12h');assert policy in ['native-12h','host-until-revoked']
assert admission['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
assert admission['stateSHA256']==hashlib.sha256(state_path.read_bytes()).hexdigest() and admission['accessSHA256']==hashlib.sha256(access_path.read_bytes()).hexdigest()
assert state['environment'] in ['acceptance','production'] and admission['environment']==state['environment']
runtime=state.get('runtimeEnvironment',state['environment']);assert runtime in ['production','acceptance'] and admission['runtimeEnvironment']==runtime
owner=uuid.UUID(access['ownerId']).bytes;run=state['instanceId'];assert re.fullmatch('[a-f0-9]{32}',run)
name='meos-'+state['environment']+'-'+run;assert state['volume']==name+'-data'
out=pathlib.Path(a.output).absolute();assert str(out)==admission['output']
for parent in out.parents:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
if not out.exists():out.mkdir(mode=0o700)
assert not out.is_symlink() and out.stat().st_uid==0 and stat.S_IMODE(out.stat().st_mode)==0o700
def docker(*args):
 result=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=clean,capture_output=True)
 assert result.returncode==0,'Native operation failed; reconcile before retry'
 return result.stdout
def verify():
 c=json.loads(docker('inspect',name))[0];v=json.loads(docker('volume','inspect',state['volume']))[0];h=c['HostConfig']
 assert c['Id']==state['containerId'] and c['Image']==state['image'] and c['State']['Running']
 assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and h['CapDrop']==['ALL'] and h['SecurityOpt']==['no-new-privileges'] and c['Config']['User']=='10001:10001'
 label='meos.'+('production.instance' if state['environment']=='production' else 'acceptance.run')
 for labels in [c['Config']['Labels'],v['Labels']]:assert labels[label]==run and labels['meos.environment']==state['environment']
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name']==state['volume'] and mounts[0]['Destination']=='/data' and mounts[0]['Source']==v['Mountpoint'] and v['Driver']=='local' and not v['Options']
 return pathlib.Path(v['Mountpoint'])/'data/main.db'
def save(name,value):
 pending=out/(name+'.pending');fd=os.open(pending,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(pending,out/name)
 directory=os.open(out,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(directory)
 finally:os.close(directory)
# Verification is read-only. No password changes, new identities or grant writes.
with sqlite3.connect('file:'+str(verify())+'?mode=ro',uri=True) as db:
 assert db.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(run,runtime)]
 assert db.execute('SELECT email,admin FROM _user WHERE id=?',(owner,)).fetchone()==(access['email'],0)
 assert not db.execute('SELECT 1 FROM _meos_agent_grants WHERE agent_id=?',(owner,)).fetchall()
 assert not db.execute('SELECT 1 FROM _meos_bridge_binding WHERE bridge_id=?',(owner,)).fetchall()
credential_path=out/'credentials.json'
if not credential_path.exists():
 assert not (out/'mint-intent.json').exists(),'Unknown issuance; reconcile rather than remint'
 save('mint-intent.json',{'instanceId':run,'ownerId':access['ownerId']})
 verify();tokens=json.loads(base64.b64decode(docker('exec',name,'/bin/trail','--depot','/data','user','mint',access['ownerId']).strip()))
 claims=json.loads(base64.urlsafe_b64decode(tokens['auth_token'].split('.')[1]+'==='));assert base64.urlsafe_b64decode(claims['sub']+'===')==owner and claims['exp']*1000>time.time()*1000
 save('credentials.json',{'authToken':tokens['auth_token'],'refreshToken':tokens['refresh_token']});del tokens,claims
 (out/'mint-intent.json').unlink()
 directory=os.open(out,os.O_DIRECTORY);os.fsync(directory);os.close(directory)
else:
 credentials=json.loads(secure(credential_path).read_text());assert set(credentials)=={'authToken','refreshToken'} and all(isinstance(v,str) and v for v in credentials.values())
 claims=json.loads(base64.urlsafe_b64decode(credentials['authToken'].split('.')[1]+'==='));assert base64.urlsafe_b64decode(claims['sub']+'===')==owner
 del credentials,claims
# The pinned native CLI fixes both TTLs to 12h. Native negative refresh TTLs
# use i64::MAX. Apply that supported representation only to this admitted host
# session, never globally or to another client's session. Repeating is idempotent.
if policy=='host-until-revoked':
 credentials=json.loads(secure(credential_path).read_text())
 session_path=verify().with_name('session.db')
 with sqlite3.connect('file:'+str(session_path)+'?mode=rw',uri=True) as db:
  db.execute('BEGIN IMMEDIATE')
  row=db.execute('SELECT user,expires FROM _session WHERE refresh_token=?',(credentials['refreshToken'],)).fetchall()
  assert len(row)==1 and row[0][0]==owner and row[0][1]>time.time(),'Missing/expired session: reconcile, never resurrect'
  assert db.execute('UPDATE _session SET expires=? WHERE refresh_token=? AND user=?',((1<<63)-1,credentials['refreshToken'],owner)).rowcount==1
 del credentials
save('receipt.json',{'status':'delegated-session-issued-not-activated','environment':state['environment'],'runtimeEnvironment':runtime,'instanceId':run,'ownerId':access['ownerId'],'identityCreated':False,'grantsChanged':False,'sessionPolicy':policy,'admissionSHA256':hashlib.sha256(admission_path.read_bytes()).hexdigest()})
print(json.dumps({'status':'delegated-session-issued-not-activated','receipt':str(out/'receipt.json')}))
