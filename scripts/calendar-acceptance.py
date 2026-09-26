# SPDX-License-Identifier: Apache-2.0
"""Trusted synthetic-only candidate launcher/bootstrap; no production mode or target override.
Requires independent `.qualification/release-acceptance/admission.json` before launch.
All secret-bearing native commands and HTTP responses stay captured in this process.
"""
import argparse,base64,hashlib,http.client,json,os,pathlib,secrets,socket,sqlite3,stat,subprocess,time,uuid
assert os.geteuid()==0
repo=pathlib.Path(__file__).resolve().parents[1];q=repo/'.qualification/release-calendar-acceptance'
p=argparse.ArgumentParser();p.add_argument('--candidate',required=True);a=p.parse_args()
candidate_path=pathlib.Path(a.candidate).resolve();assert candidate_path.is_relative_to(repo/'.qualification') and candidate_path.name=='candidate.json'
candidate=json.loads(candidate_path.read_text());assert candidate['status']=='candidate-not-admitted-not-deployed'
admission=json.loads((q/'admission.json').read_text())
assert admission['candidateSHA256']==hashlib.sha256(candidate_path.read_bytes()).hexdigest()
assert admission['image']==candidate['image'] and admission['reviewStatus']==admission['status']=='approved-for-isolated-qualification'
assert admission['reviewer'] and admission['evidence']
assert not q.is_symlink();clean={'PATH':'/usr/bin:/bin'}
def docker(*args):
 p=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode:raise RuntimeError('Docker operation failed; private reconciliation required: '+args[0])
 return p.stdout+p.stderr if args[0]=='logs' else p.stdout
def save(name,value,private=False):
 target=q/name;temp=q/(name+'.pending')
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600 if private else 0o644)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,target);os.chown(target,repo.stat().st_uid,repo.stat().st_gid)
if not (q/'runtime-launch.json').exists():
 run=uuid.uuid4().hex;name='meos-acceptance-'+run;volume=name+'-data'
 plan={'schema':1,'environment':'acceptance','runtimeEnvironment':'production','origin':candidate['origin'],'runId':run,'image':candidate['image'],'syntheticOnly':True,'network':'none','credentials':'fresh-in-container','endpoint':'container-unix-socket','volume':'fresh-managed','identity':'fresh-synthetic'}
 r={'state':'planned','plan':plan,'containerId':None,'volume':volume,'network':'none','identityQualified':False}
 save('runtime-launch.json',r);save('candidate.json',candidate)
else:r=json.loads((q/'runtime-launch.json').read_text());plan=r['plan'];run=plan['runId'];name='meos-acceptance-'+run;volume=name+'-data'
assert plan['image']==candidate['image'] and plan['environment']=='acceptance' and plan['runtimeEnvironment']=='production'
assert plan['syntheticOnly'] is True and plan['network']=='none' and r['volume']==volume
assert len(run)==32 and all(c in '0123456789abcdef' for c in run)
if r['state']=='planned':
 # Never resume an ambiguous create automatically. Inspect existence first.
 for kind,target in [('container',name),('volume',volume)]:
  p=subprocess.run(['docker','--host','unix:///var/run/docker.sock',kind,'inspect',target],env=clean,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  assert p.returncode!=0,'Interrupted create: reconcile existing object, do not retry'
 docker('volume','create','--label','meos.environment=acceptance','--label','meos.acceptance.run='+run,volume)
 container=docker('create','--name',name,'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1200m','--pids-limit','128','--label','meos.environment=acceptance','--label','meos.acceptance.run='+run,'--mount','type=volume,src='+volume+',dst=/data','--tmpfs','/tmp:rw,noexec,nosuid,size=64m',candidate['image'],'/bin/trail','--depot','/data','--public-url',candidate['origin'],'run','--address','unix:/data/server.sock','--admin-address','unix:/data/admin.sock').decode().strip()
 r.update(state='created',containerId=container);save('runtime-launch.json',r)
def verify():
 c=json.loads(docker('container','inspect',name))[0];v=json.loads(docker('volume','inspect',volume))[0];h=c['HostConfig']
 assert c['Id']==r['containerId'] and c['Image']==candidate['image']
 assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom')
 assert set(c['NetworkSettings']['Networks'])=={'none'} and c['Config']['User']=='10001:10001'
 assert h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges']
 assert not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
 assert set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
 for obj in [c['Config'],v]:assert obj['Labels']['meos.acceptance.run']==run and obj['Labels']['meos.environment']=='acceptance'
 assert v['Name']==volume and v['Driver']=='local' and not v['Options']
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==volume and mounts[0]['Destination']=='/data'
 return c,pathlib.Path(v['Mountpoint'])
c,root=verify()
if not c['State']['Running']:docker('start',name)
def ready():
 deadline=time.monotonic()+55
 while time.monotonic()<deadline:
  c,_=verify();assert c['State']['Running'],'Candidate stopped'
  if (root/'server.sock').is_socket() and (root/'admin.sock').is_socket():return
  time.sleep(.25)
 raise RuntimeError('Candidate sockets not ready')
ready();assert root.stat().st_uid==10001
def db():
 verify();c=sqlite3.connect(root/'data/main.db');c.execute('PRAGMA foreign_keys=ON');return c
with db() as conn:
 rows=conn.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()
 if not rows:conn.execute('INSERT INTO _meos_instance VALUES(1,?,?)',(run,'production'))
 else:assert rows==[(run,'production')]
cp=q/'synthetic-credentials.json'
if cp.exists():
 assert stat.S_IMODE(cp.stat().st_mode)==0o600
 state=json.loads(cp.read_text());assert state['runId']==run
else:
 state={'schema':1,'runId':run,'users':[{'email':role+'-'+run+'@example.invalid','password':secrets.token_urlsafe(32)+'!aA1','provisioned':False} for role in ['owner','other','bridge','agent','calendar']]}
 save('synthetic-credentials.json',state,True)
class UDS(http.client.HTTPConnection):
 def __init__(self,path):super().__init__('meos.aidans.computer',timeout=15);self.path=path
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX);self.sock.settimeout(self.timeout)
  fd=os.open(self.path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:self.sock.connect('/proc/self/fd/'+str(fd)+'/'+self.path.name)
  finally:os.close(fd)
def request(path,method,route,body=None,headers=None):
 verify();client=UDS(root/path)
 try:
  client.request(method,route,body,headers or {});resp=client.getresponse();return resp.status,resp.read(),resp.getheaders()
 finally:client.close()
checks={}
pending=any(not u['provisioned'] for u in state['users'])
if pending:
 tokens=json.loads(base64.b64decode(docker('exec',name,'/bin/trail','--depot','/data','user','mint','admin@localhost').strip()))
 token=tokens['auth_token'];claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
 headers={'Authorization':'Bearer '+token,'CSRF-Token':claims['csrf_token'],'Content-Type':'application/json'}
 probe=json.dumps({'email':'denial-'+run+'@example.invalid','password':secrets.token_urlsafe(32)+'!aA1','verified':True,'admin':False})
 for label,hs in [('missingCsrf',{'Authorization':'Bearer '+token,'Content-Type':'application/json'}),('wrongCsrf',{**headers,'CSRF-Token':'wrong'})]:
  code,_,_=request('admin.sock','POST','/api/_admin/user',probe,hs);assert code in [400,403];checks[label]=code
 for user in state['users']:
  assert user['email'].endswith('-'+run+'@example.invalid')
  with db() as conn:row=conn.execute('SELECT id,admin,password_hash,unverified_email FROM _user WHERE email=?',(user['email'],)).fetchone()
  if row is None:
   assert not user['provisioned']
   code,body,_=request('admin.sock','POST','/api/_admin/user',json.dumps({'email':user['email'],'password':user['password'],'verified':True,'admin':False}),headers)
   assert code==200,'Private synthetic creation failed (response suppressed)'
   user['id']=json.loads(body)['id']
  else:
   assert row[1]==0 and row[2] and row[3] is None
   found=str(uuid.UUID(bytes=row[0]));assert not user.get('id') or user['id']==found;user['id']=found
  user['provisioned']=True;save('synthetic-credentials.json',state,True)
 # Native cleanup needs no secret argv. Demotion checks live admin status even for minted JWT.
 docker('exec',name,'/bin/trail','--depot','/data','admin','demote','admin@localhost')
 code,_,_=request('admin.sock','POST','/api/_admin/user',probe,headers);assert code==403;checks['demotedAdminDenied']=True
 docker('exec',name,'/bin/trail','--depot','/data','user','invalidate-session','admin@localhost')
 code,_,_=request('server.sock','POST','/api/auth/v1/refresh',json.dumps({'refresh_token':tokens['refresh_token']}),{'Content-Type':'application/json'})
 assert code in [400,401,403];checks['bootstrapRefreshRevoked']=True
 docker('exec',name,'/bin/trail','--depot','/data','user','delete','admin@localhost')
 del tokens,token,claims,headers
with db() as conn:
 assert conn.execute('SELECT COUNT(*) FROM _user WHERE admin=1').fetchone()==(0,)
 assert conn.execute("SELECT COUNT(*) FROM _user WHERE email='admin@localhost'").fetchone()==(0,)
 for user in state['users']:
  row=conn.execute('SELECT id,admin,unverified_email FROM _user WHERE email=?',(user['email'],)).fetchone();assert row==(uuid.UUID(user['id']).bytes,0,None)
  now=int(time.time()*1000);defaults={'timezone':'UTC','weekStartsOn':1,'weather':{'enabled':False,'source':'latest','units':'celsius'}}
  conn.execute('INSERT INTO preferences(owner_id,doc,revision,created_at,updated_at) VALUES(?,?,1,?,?) ON CONFLICT DO NOTHING',(uuid.UUID(user['id']).bytes,json.dumps(defaults,separators=(',',':')),now,now))
 owner,other,bridge,agent,calendar=state['users']
 owner_id=uuid.UUID(owner['id']).bytes;bridge_id=uuid.UUID(bridge['id']).bytes;agent_id=uuid.UUID(agent['id']).bytes
 bound=conn.execute('SELECT owner_id FROM _meos_bridge_binding WHERE bridge_id=?',(bridge_id,)).fetchone()
 if bound is None:conn.execute('INSERT INTO _meos_bridge_binding VALUES(?,?)',(bridge_id,owner_id))
 else:assert bound==(owner_id,), 'Existing bridge binding differs; never replace'
 scopes=['agenda:read','tasks:write','routines:write','occurrences:write','schedule:read','schedule:write']
 grant=conn.execute('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',(agent_id,)).fetchone()
 if grant is None:conn.execute('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)',(agent_id,owner_id,json.dumps(scopes),int(time.time()*1000)+86400000))
 else:
  assert grant[0]==owner_id and json.loads(grant[1])==scopes and grant[2]>int(time.time()*1000) and grant[3]==0, 'Existing grant differs/expired/revoked; never renew or reset'
 calendar_id=uuid.UUID(calendar['id']).bytes;calendar_scopes=['sync:read','sync:write']
 grant=conn.execute('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',(calendar_id,)).fetchone()
 if grant is None:conn.execute('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)',(calendar_id,owner_id,json.dumps(calendar_scopes),int(time.time()*1000)+86400000))
 else:assert grant[0]==owner_id and json.loads(grant[1])==calendar_scopes and grant[2]>int(time.time()*1000) and grant[3]==0
# Restart exact image/config; native login supports existing users while registration stays disabled.
verify();docker('restart',name);ready()
with db() as conn:
 assert conn.execute('SELECT COUNT(*) FROM _user WHERE admin=1').fetchone()==(0,)
 assert conn.execute("SELECT COUNT(*) FROM _user WHERE email='admin@localhost'").fetchone()==(0,)
for user in state['users']:
 code,body,_=request('server.sock','POST','/api/auth/v1/login',json.dumps({'email':user['email'],'password':user['password']}),{'Content-Type':'application/json','Origin':candidate['origin']})
 assert code==200,'Synthetic login failed (response suppressed)'
 checks['logins']=checks.get('logins',0)+1
code,body,_=request('server.sock','GET','/api/meos/v1/instance');assert code==200 and json.loads(body)['instanceId']==run
checks['productionInstanceServed']=True
code,_,_=request('server.sock','POST','/api/auth/v1/register',json.dumps({'email':'signup-'+run+'@example.invalid','password':secrets.token_urlsafe(32),'password_repeat':'different'}),{'Content-Type':'application/json'})
assert code==403;checks['nativeRegistrationDisabled']=True
logs=docker('logs',name).decode(errors='replace')
assert 'Created new admin user' not in logs and 'password:' not in logs.lower()
assert all(u['password'] not in logs for u in state['users'])
checks.update(noCredentialLogs=True,noBootstrapAdminAfterRestart=True,verifiedOrdinaryUsers=5,noEmailBranch='source verified:true guard; runtime network none',runtimeEnvironment='production',physicalEnvironment='acceptance',runId=run,image=candidate['image'])
if (q/'bootstrap-checks.json').exists():
 previous=json.loads((q/'bootstrap-checks.json').read_text());assert previous['runId']==run;checks={**previous,**checks,'repeatBootstrapNoPasswordReset':not pending}
save('bootstrap-checks.json',checks)
save('acceptance-endpoint.json',{'runId':run,'container':name,'socket':str(root/'server.sock'),'origin':candidate['origin'],'environment':'acceptance','runtimeEnvironment':'production','ownerUid':10001})
r.update(state='started',identityQualified=True);save('runtime-launch.json',r)
print(json.dumps({'runId':run,'image':candidate['image'],'status':'synthetic-candidate-ready','privateEndpointFile':str(q/'acceptance-endpoint.json'),'checks':checks}))
