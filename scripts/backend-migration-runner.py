# SPDX-License-Identifier: Apache-2.0
# Trusted migration qualification fixture. Only fresh disposable resources from admitted launcher.
import pathlib,json,subprocess,re,sqlite3,shutil,os,time,hashlib,uuid
assert os.geteuid()==0
q=pathlib.Path(__file__).resolve().parents[1]/'.qualification';repo=q.parent;clean={'PATH':'/usr/bin:/bin'}
image=json.loads((repo/'backend/reviewed-artifacts.json').read_text())['artifacts'][0]['image']
receipt=q/'migration-launch.json'
if not receipt.exists():
 data=subprocess.check_output(['/home/clawy/.local/share/mise/installs/node/24.19.0/bin/node',str(repo/'scripts/backend-launch.mjs'),image,'--prepare-restore'],env=clean);receipt.write_bytes(data)
r=json.loads(receipt.read_text());run=r['plan']['runId'];assert re.fullmatch('[a-f0-9]{32}',run)
assert r['plan']['environment']=='acceptance' and r['plan']['network']=='none' and r['plan']['syntheticOnly'] is True
name='meos-acceptance-'+run
def docker(*args):return subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=clean)
c=json.loads(docker('inspect',name))[0];v=json.loads(docker('volume','inspect',r['volume']))[0]
assert c['Id']==r['containerId'] and c['Image']==r['plan']['image']
assert c['Config']['User']=='10001:10001' and c['Config']['Labels']['meos.environment']=='acceptance' and c['Config']['Labels']['meos.acceptance.run']==run
assert c['HostConfig']['NetworkMode']=='none' and set(c['NetworkSettings']['Networks'])=={'none'} and c['HostConfig']['ReadonlyRootfs'] and not c['HostConfig'].get('Binds') and not c['HostConfig'].get('PortBindings')
assert v['Name']==name+'-data' and v['Labels']['meos.acceptance.run']==run and v['Labels']['meos.environment']=='acceptance' and v['Driver']=='local' and not v.get('Options')
mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data'
root=pathlib.Path(v['Mountpoint']);assert root.stat().st_uid==10001
statefile=q/'migration-state.json';state=json.loads(statefile.read_text()) if statefile.exists() else {'runId':run,'stage':'prepared'};assert state['runId']==run
migration=root/'migrations/main/U1790380805__scheduling_contract.sql'
def persist():statefile.write_text(json.dumps(state,indent=2))
def ready():
 # Native guest cold compilation can exceed 40 seconds; bounded 55-second slices.
 deadline=time.monotonic()+55
 while not (root/'server.sock').is_socket() and time.monotonic()<deadline:time.sleep(.1)
 assert (root/'server.sock').is_socket(),'pending native readiness; rerun resumes persisted phase'
def rows():
 db=sqlite3.connect('file:'+str(root/'data/main.db')+'?mode=ro',uri=True);result={t:db.execute('SELECT hex(id),doc,revision FROM '+t+' ORDER BY id').fetchall() for t in ['projects','tasks','routines','occurrences']};db.close();return result
if state['stage']=='prepared':
 assert not c['State']['Running'];migration.rename(root/'held-migration005.sql');state['stage']='old-schema-starting';persist();docker('start',name)
if state['stage']=='old-schema-starting':
 ready();db=sqlite3.connect(root/'data/main.db');assert not db.execute("SELECT 1 FROM sqlite_master WHERE name='sync_outbox'").fetchone()
 db.create_function('is_uuid',1,lambda b:int(isinstance(b,bytes) and len(b)==16));db.create_function('is_email',1,lambda value:1)
 owner=str(uuid.uuid4());routine={'id':str(uuid.uuid4()),'title':'Synthetic original template','notes':{'type':'doc'},'weekdays':[1],'timezone':'America/Toronto','time':'09:00','durationMinutes':30};occ={'id':str(uuid.uuid4()),'routineId':routine['id'],'date':'2026-09-21','completed':True};task={'id':str(uuid.uuid4()),'title':'Untouched task','notes':{'type':'doc'},'priority':'none','completed':False}
 db.execute('INSERT INTO _user(id,email,admin) VALUES(?,?,0)',(uuid.UUID(owner).bytes,'migration-'+run+'@example.invalid'))
 for table,doc in [('tasks',task),('routines',routine),('occurrences',occ)]:db.execute('INSERT INTO '+table+'(id,owner_id,doc,created_at,updated_at) VALUES(?,?,?,?,?)',(uuid.UUID(doc['id']).bytes,uuid.UUID(owner).bytes,json.dumps(doc),1,1))
 db.commit();db.close();state['before']=rows();state['stage']='seeded';persist()
if state['stage']=='seeded':
 docker('stop',name)
 for source in (repo/'backend/migrations').glob('*.sql'):
  target=root/'migrations/main'/source.name
  if target.exists():assert target.read_bytes()==source.read_bytes()
  else:shutil.copyfile(source,target);os.chown(target,10001,10001)
 state['stage']='upgrade-starting';persist();docker('start',name)
if state['stage']=='upgrade-starting':
 ready();after=rows();before=state['before']
 for table,values in before.items():
  if table!='occurrences':assert json.dumps(after[table])==json.dumps(values)
  else:
   assert len(values)==len(after[table])
   for a,b in zip(values,after[table]):
    assert a[0]==b[0];old,new=json.loads(a[1]),json.loads(b[1]);assert all(new[k]==v for k,v in old.items());assert new['title']=='Synthetic original template' and new['durationMinutes']==30 and new['notes']=={'type':'doc'} and 'schedule' not in new and b[2]>a[2]
 evidence={'runId':run,'image':r['plan']['image'],'method':'actual native migration on fresh disposable pre005 schema with persisted synthetic before/after','network':'none','checks':['verified fresh disposable identity','migration005 absent during old-schema seed','all old migration files byte-identical','all non-occurrence values and revisions unchanged','occurrence IDs original slot completion and history retained','independent snapshot title notes duration template revision added without guessed schedule'],'beforeSHA256':hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest(),'afterSHA256':hashlib.sha256(json.dumps(after,sort_keys=True).encode()).hexdigest(),'migrationSHA256':hashlib.sha256(migration.read_bytes()).hexdigest()}
 (q/'contract-upgrade-evidence.json').write_text(json.dumps(evidence,indent=2));state['stage']='completed';persist();docker('stop',name);print(json.dumps(evidence))

if state['stage']=='completed':
 evidence=json.loads((q/'contract-upgrade-evidence.json').read_text())
 assert evidence['runId']==run and evidence['migrationSHA256']==hashlib.sha256((repo/'backend/migrations/U1790380805__scheduling_contract.sql').read_bytes()).hexdigest()
 print('Persisted native migration proof is complete for this exact migration; no new migration executed on repeat.')
