# SPDX-License-Identifier: Apache-2.0
"""Bind an existing Calendar refresh session to its already-approved grant deadline.
Native `user mint` v0.33.22 uses a fixed12h refresh expiry; refresh does not extend
it. This admitted operator action changes one matching session expiry only. It
never creates a principal, changes a grant, or reads/writes provider state.
"""
import argparse,hashlib,json,os,pathlib,sqlite3,stat,subprocess,time,uuid
from contextlib import closing

def bind_session(session,agent,refresh,deadline,now):
 rows=session.execute('SELECT id,expires FROM _session WHERE user=? AND refresh_token=?',(agent,refresh)).fetchall()
 if len(rows)!=1 or rows[0][1]<=now:raise ValueError('Expected one unexpired existing session')
 if deadline<=now:raise ValueError('Grant expired')
 ident,previous=rows[0]
 # Never lengthen beyond the independently verified grant; also cap a legacy
 # session whose deadline was incorrectly longer than its current grant.
 with session:
  changed=session.execute('UPDATE _session SET expires=? WHERE id=? AND user=? AND refresh_token=? AND expires=?',(deadline,ident,agent,refresh,previous)).rowcount
  if changed!=1:raise ValueError('Session changed; reconcile before retry')
 return {'previousExpires':previous,'expires':deadline}

def main():
 assert os.geteuid()==0
 parser=argparse.ArgumentParser();parser.add_argument('--state',required=True);parser.add_argument('--credentials',required=True);parser.add_argument('--admission',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
 def secure(value):
  p=pathlib.Path(value).absolute();i=p.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and i.st_nlink==1
  for parent in p.parents:
   i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
  return p
 state_path=secure(args.state);credentials_path=secure(args.credentials);admission_path=secure(args.admission)
 sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 a=json.loads(admission_path.read_text());state=json.loads(state_path.read_text());credentials=json.loads(credentials_path.read_text())
 assert a['status']=='approved-calendar-session-lifetime' and a['reviewer'] and a['evidence']
 assert a['scriptSHA256']==sha(pathlib.Path(__file__)) and a['stateSHA256']==sha(state_path) and a['credentialsSHA256']==sha(credentials_path)
 assert state['environment'] in ['production','acceptance'] and a['environment']==state['environment']
 out=pathlib.Path(args.output).absolute();assert str(out)==a['output'] and not out.exists()
 for p in out.parents:
  i=p.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 def docker(*parts):return subprocess.check_output(['/usr/bin/docker',*parts],env={'PATH':'/usr/bin:/bin'},stderr=subprocess.PIPE,timeout=30)
 c=json.loads(docker('inspect',state['containerId']))[0];v=json.loads(docker('volume','inspect',state['volume']))[0];h=c['HostConfig']
 assert c['State']['Running'] and c['Image']==state['image'] and h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and h['CapDrop']==['ALL'] and c['Config']['User']=='10001:10001'
 label='meos.'+('production.instance' if state['environment']=='production' else 'acceptance.run')
 for labels in [c['Config']['Labels'],v['Labels']]:assert labels[label]==state['instanceId'] and labels['meos.environment']==state['environment']
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==state['volume']==v['Name'] and mounts[0]['Source']==v['Mountpoint'] and mounts[0]['Destination']=='/data' and v['Driver']=='local' and not v['Options']
 root=pathlib.Path(v['Mountpoint'])/'data';agent=uuid.UUID(credentials['agentId']).bytes;owner=uuid.UUID(credentials['ownerId']).bytes
 assert agent!=owner and set(credentials['scopes'])=={'sync:read','sync:write'}
 with closing(sqlite3.connect('file:'+str(root/'main.db')+'?mode=ro',uri=True)) as db:
  db.execute('BEGIN')
  assert db.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(state['instanceId'],state.get('runtimeEnvironment',state['environment']))]
  assert db.execute('SELECT password_hash,admin FROM _user WHERE id=?',(agent,)).fetchone()==(None,0)
  grant=db.execute('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',(agent,)).fetchone()
  assert grant and grant[0]==owner and set(json.loads(grant[1]))=={'sync:read','sync:write'} and grant[3]==0
  deadline=grant[2]//1000;assert deadline>time.time() and deadline==a['grantExpiresSeconds']
  # Bind to this verified grant snapshot; this is not a cross-database lock.
  # Runtime authorization still checks revocation/scope/expiry on every MCP call.
  for suffix in ['-wal','-shm']:
   info=(root/('session.db'+suffix)).lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==10001 and info.st_nlink==1
  with closing(sqlite3.connect(root/'session.db')) as session:
   result=bind_session(session,agent,credentials['refreshToken'],deadline,int(time.time()))
  for suffix in ['-wal','-shm']:
   info=(root/('session.db'+suffix)).lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==10001 and info.st_nlink==1
  assert db.execute('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',(agent,)).fetchone()==grant
 result.update(status='calendar-session-bound-to-grant',instanceId=state['instanceId'],identityChanged=False,grantWritten=False)
 fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(result,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 fd=os.open(out.parent,os.O_DIRECTORY);os.fsync(fd);os.close(fd)
 print(json.dumps(result))
if __name__=='__main__':main()
