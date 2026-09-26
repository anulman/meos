# SPDX-License-Identifier: Apache-2.0
"""Admitted, resumable creation of one passwordless notification-only native principal.
Never elevates an existing user, resets passwords, or prints tokens. Production
requires separate exact-helper/state admission; acceptance uses the same path.
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
assert admission['status']=='approved-notification-principal' and admission['reviewer'] and admission['evidence']
assert admission['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
assert admission['stateSHA256']==hashlib.sha256(state_path.read_bytes()).hexdigest() and admission['accessSHA256']==hashlib.sha256(access_path.read_bytes()).hexdigest()
assert state['environment'] in ['acceptance','production'] and admission['environment']==state['environment']
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
plan_path=out/'principal-plan.json'
if not plan_path.exists():save('principal-plan.json',{'instanceId':run,'ownerId':access['ownerId'],'agentId':str(uuid.uuid4()),'email':'meos-notification-'+uuid.uuid4().hex+'@example.invalid','expiresAt':int(time.time()*1000)+365*86400000,'state':'planned'})
plan=json.loads(secure(plan_path).read_text());assert plan['instanceId']==run and plan['ownerId']==access['ownerId'] and plan['agentId']!=access['ownerId']
agent=uuid.UUID(plan['agentId']).bytes;assert re.fullmatch('meos-notification-[a-f0-9]{32}@example.invalid',plan['email']) and plan['expiresAt']>int(time.time()*1000)
with sqlite3.connect(verify()) as db:
 db.execute('PRAGMA foreign_keys=ON');db.create_function('is_uuid',1,lambda v:isinstance(v,bytes) and len(v)==16);db.create_function('is_email',1,lambda v:v is None or isinstance(v,str) and bool(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',v)))
 assert db.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(run,'production')]
 assert db.execute('SELECT email,admin FROM _user WHERE id=?',(owner,)).fetchone()==(access['email'],0)
 assert db.execute('SELECT COUNT(*) FROM _user WHERE admin=1').fetchone()==(0,)
 row=db.execute('SELECT email,password_hash,admin,unverified_email FROM _user WHERE id=?',(agent,)).fetchone()
 if row is None:
  assert plan['state']=='planned' and db.execute('SELECT COUNT(*) FROM _user WHERE email=?',(plan['email'],)).fetchone()==(0,)
  db.execute('INSERT INTO _user(id,email,password_hash,admin) VALUES(?,?,NULL,0)',(agent,plan['email']))
 else:assert row==(plan['email'],None,0,None),'Existing principal differs; never overwrite'
 scopes=['notifications:consume'];grant=db.execute('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',(agent,)).fetchone()
 if grant is None:
  assert plan['state']=='planned';db.execute('INSERT INTO _meos_agent_grants(agent_id,owner_id,scopes,expires_at,revoked) VALUES(?,?,?,?,0)',(agent,owner,json.dumps(scopes),plan['expiresAt']))
 else:assert grant==(owner,json.dumps(scopes),plan['expiresAt'],0),'Existing grant differs; never renew or reset'
plan['state']='provisioned';save('principal-plan.json',plan)
credential_path=out/'credentials.json'
if not credential_path.exists():
 verify();tokens=json.loads(base64.b64decode(docker('exec',name,'/bin/trail','--depot','/data','user','mint',plan['agentId']).strip()))
 claims=json.loads(base64.urlsafe_b64decode(tokens['auth_token'].split('.')[1]+'==='));assert base64.urlsafe_b64decode(claims['sub']+'===')==agent and claims['exp']*1000>time.time()*1000
 save('credentials.json',{'authToken':tokens['auth_token'],'refreshToken':tokens['refresh_token']});del tokens,claims
else:
 credentials=json.loads(secure(credential_path).read_text());assert set(credentials)=={'authToken','refreshToken'} and all(isinstance(v,str) and v for v in credentials.values())
save('receipt.json',{'status':'principal-provisioned-not-activated','environment':state['environment'],'instanceId':run,'agentId':plan['agentId'],'ownerId':plan['ownerId'],'scopes':scopes,'expiresAt':plan['expiresAt'],'passwordless':True,'ownerUnchanged':True,'admissionSHA256':hashlib.sha256(admission_path.read_bytes()).hexdigest()})
print(json.dumps({'status':'principal-provisioned-not-activated','receipt':str(out/'receipt.json')}))
