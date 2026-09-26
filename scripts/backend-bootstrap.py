# SPDX-License-Identifier: Apache-2.0
# Trusted acceptance-only launcher: exact Docker identity checked before any database write.
import json,pathlib,subprocess,os,sqlite3,secrets,re,stat,uuid,time
q=pathlib.Path(__file__).resolve().parents[1]/'.qualification';r=json.loads((q/'runtime-launch.json').read_text());plan=r['plan'];run=plan['runId'];assert re.fullmatch('[a-f0-9]{32}',run);name='meos-acceptance-'+run
clean={'PATH':'/usr/bin:/bin'}
def docker(*args):
 p=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode:raise RuntimeError('Docker '+args[0]+' failed: '+p.stderr.decode().replace(args[-1],'[redacted]'))
 return p.stdout
c=json.loads(docker('inspect',name))[0];v=json.loads(docker('volume','inspect',r['volume']))[0]
assert c['Image']==plan['image'] and c['HostConfig']['NetworkMode']=='none' and c['HostConfig']['ReadonlyRootfs'] and c['Config']['User']=='10001:10001'
assert c['Config']['Labels']['meos.acceptance.run']==run and v['Labels']['meos.acceptance.run']==run and v['Labels']['meos.environment']=='acceptance'
assert v['Name']==name+'-data' and v['Driver']=='local' and not v.get('Options')
mounts=[x for x in c['Mounts'] if x['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data'
root=pathlib.Path(v['Mountpoint']);assert root.stat().st_uid==10001
deadline=time.monotonic()+55
while not (root/'server.sock').is_socket() and time.monotonic()<deadline:time.sleep(0.25)
assert (root/'server.sock').is_socket(),'server not ready within55seconds; inspect, do not assume readiness'
conn=sqlite3.connect(root/'data/main.db');assert conn.execute("SELECT name FROM sqlite_master WHERE name='_user'").fetchone(), 'native auth migration missing';conn.execute('BEGIN IMMEDIATE');rows=conn.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()
if not rows:conn.execute('INSERT INTO _meos_instance VALUES(1,?,?)',(run,'acceptance'))
else:assert rows==[(run,'acceptance')]
conn.commit();conn.close()
cp=q/'synthetic-credentials.json'
def persist(state):
 temp=cp.with_suffix('.pending')
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:json.dump(state,f);f.flush();os.fsync(f.fileno())
 os.replace(temp,cp);owner=q.stat();os.chown(cp,owner.st_uid,owner.st_gid)
if cp.exists():
 assert stat.S_IMODE(cp.stat().st_mode)==0o600, 'credential file permissions must be0600'
 state=json.loads(cp.read_text());assert state['runId']==run, 'never reuse credentials from another instance'
 assert state.get('schema')==1, 'unrecognized bootstrap receipt; reconcile without reset'
else:
 state={'schema':1,'runId':run,'users':[{'id':str(uuid.uuid4()),'email':role+'-'+run+'@example.invalid','password':secrets.token_urlsafe(32),'provisioned':False} for role in ['owner','other']]}
 persist(state) # Persist intent before creating identities, so interrupted attempts resume.
for user in state['users']:
 assert re.fullmatch(r'(owner|other)-'+run+r'@example\.invalid',user['email'])
 conn=sqlite3.connect(root/'data/main.db')
 conn.create_function('is_uuid',1,lambda value:int(isinstance(value,bytes) and len(value)==16))
 conn.create_function('is_email',1,lambda value:int(value is None or value==user['email']))
 conn.execute('BEGIN IMMEDIATE');row=conn.execute('SELECT id,admin FROM _user WHERE email=?',(user['email'],)).fetchone()
 if row is None:
  assert not user['provisioned'], 'sealed owner disappeared; recovery is separate'
  conn.execute('INSERT INTO _user(id,email,admin) VALUES(?,?,0)',(uuid.UUID(user['id']).bytes,user['email']))
 else:assert row==(uuid.UUID(user['id']).bytes,0), 'identity or privilege changed'
 defaults={'timezone':'UTC','weekStartsOn':1,'weather':{'enabled':False,'source':'latest','units':'celsius'}}
 now=int(time.time()*1000)
 conn.execute('INSERT INTO preferences(owner_id,doc,revision,created_at,updated_at) VALUES(?,?,1,?,?) ON CONFLICT DO NOTHING',(uuid.UUID(user['id']).bytes,json.dumps(defaults,separators=(',',':')),now,now))
 conn.commit();conn.close()
 if not user['provisioned']:
  # The upstream add-user CLI writes a removed verified column. Use its current
  # password operation after the validated ordinary-user insert; never rehash a
  # completed owner or reset an existing password on a successful rerun.
  docker('exec',name,'/bin/trail','--depot','/data','user','change-password',user['email'],user['password'])
  user['provisioned']=True;persist(state)
(q/'acceptance-endpoint.json').write_text(json.dumps({'runId':run,'container':name,'socket':str(root/'server.sock'),'origin':'https://meos-acceptance.invalid','environment':'acceptance','ownerUid':10001},indent=2)+'\n')
print('Acceptance identity sealed; two synthetic users provisioned; credentials retained privately')
