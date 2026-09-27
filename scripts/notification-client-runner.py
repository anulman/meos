# SPDX-License-Identifier: Apache-2.0
# Trusted synthetic-only transport launcher. Exact hashes require independent admission.
import fcntl,hashlib,json,os,pathlib,sqlite3,stat,subprocess,tarfile,time
assert os.geteuid()==0
repo=pathlib.Path(__file__).resolve().parents[1];q=repo/'.qualification/release-notification-acceptance';clean={'PATH':'/usr/bin:/bin'}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
admission_path=q/'admission.json';info=admission_path.lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600
admission=json.loads(admission_path.read_text());assert admission['status']==admission['reviewStatus']=='approved-for-isolated-qualification' and admission['reviewer'] and admission['evidence']
for field,name in [('clientRunnerSHA256','notification-client-runner.py'),('clientLiveSHA256','notification-client-live.mjs'),('clientAdapterSHA256','notification-durable-adapter.mjs')]:assert admission[field]==digest(repo/'scripts'/name)
lock=os.open('/run/lock/meos-client-61005.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61005' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env=clean,text=True).split()
r=json.loads((q/'runtime-launch.json').read_text());candidate=json.loads((q/'candidate.json').read_text());checks=json.loads((q/'native-notification-checks.json').read_text());run=r['plan']['runId'];name='meos-acceptance-'+run
assert r['state']=='started' and r['plan']['syntheticOnly'] is True and r['plan']['environment']=='acceptance' and checks['runId']==run and checks['candidateSHA256']==admission['candidateSHA256'] and r['plan']['image']==admission['image']==candidate['image']
def docker(*args):return subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args],env=clean)
def verify():
 c=json.loads(docker('inspect',name))[0];v=json.loads(docker('volume','inspect',r['volume']))[0];h=c['HostConfig']
 assert c['Id']==r['containerId'] and c['Image']==candidate['image'] and c['State']['Running'] and c['Config']['User']=='10001:10001'
 assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and h['CapDrop']==['ALL'] and h['SecurityOpt']==['no-new-privileges']
 assert v['Name']==r['volume']==name+'-data' and v['Driver']=='local' and not v['Options']
 for labels in [c['Config']['Labels'],v['Labels']]:assert labels['meos.environment']=='acceptance' and labels['meos.acceptance.run']==run
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Source']==v['Mountpoint'] and mounts[0]['Destination']=='/data'
 return pathlib.Path(v['Mountpoint'])
root=verify();credentials=json.loads((q/'synthetic-credentials.json').read_text());assert credentials['runId']==run
users={u['email'].split('-')[0]:u for u in credentials['users']};agent=users['notification'];import uuid
manifest_path=pathlib.Path(admission['clientManifestPath']).resolve();assert manifest_path.is_relative_to(repo/'.qualification') and manifest_path.name=='manifest.json'
assert digest(manifest_path)==admission['clientManifestSHA256']
manifest=json.loads(manifest_path.read_text());archive_name=next(n for n in manifest['archives'] if n.endswith('-linux-amd64.tar.gz'));assert pathlib.Path(archive_name).name==archive_name;archive=manifest_path.parent/archive_name
assert digest(archive)==manifest['archives'][archive_name]==admission['clientArchiveSHA256']
for relative,sha in manifest['sourceFiles'].items():assert digest(repo/relative)==sha
out=q/('client-live-'+str(time.time_ns()));out.mkdir(mode=0o700);private=out/'private';private.mkdir(mode=0o700);result=out/'result';result.mkdir(mode=0o700);os.chown(result,61005,61005)
with tarfile.open(archive) as t:
 member=t.getmember('meos-agent');assert member.isfile() and member.size<33554432;binary=private/'meos-agent';binary.write_bytes(t.extractfile(member).read());binary.chmod(0o555)
fixture=private/'fixture.json';fixture.write_text(json.dumps({'runId':run,'origin':candidate['origin'],'owner':users['owner'],'notification':agent}));fixture.chmod(0o600);os.chown(fixture,61005,61005)
subprocess.run(['/usr/bin/openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(private/'tls.key'),'-out',str(private/'tls.crt'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],env=clean,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for n in ['tls.key','tls.crt']:os.chmod(private/n,0o600);os.chown(private/n,61005,61005)
# Delayed-boundary fixture seed only, fenced to the verified fresh synthetic DB.
with sqlite3.connect(verify()/'data/main.db') as db:
 assert db.execute('SELECT instance_id,environment FROM _meos_instance').fetchall()==[(run,'production')]
 grant=db.execute('SELECT scopes,revoked FROM _meos_agent_grants WHERE agent_id=?',(uuid.UUID(agent['id']).bytes,)).fetchone();assert json.loads(grant[0])==['notifications:consume'] and grant[1]==0
 db.execute('UPDATE notification_consumers SET lease_until=0,planned_at=? WHERE agent_id=?',(int(time.time()//60)*60000,uuid.UUID(agent['id']).bytes))
node=pathlib.Path('/home/clawy/.local/share/mise/installs/node/24.19.0');sock=root/'server.sock';acl=subprocess.check_output(['/usr/bin/getfacl','--absolute-names',str(sock)],env=clean)
props={'PrivateNetwork':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindPaths':str(result)+':/output','BindReadOnlyPaths':f'{repo}/backend:/app/backend {repo}/scripts/notification-client-live.mjs:/app/scripts/notification-client-live.mjs {repo}/scripts/notification-durable-adapter.mjs:/app/scripts/notification-durable-adapter.mjs {node}:/opt/node {binary}:/opt/meos-agent {fixture}:/private/fixture.json {private}/tls.key:/private/tls.key {private}/tls.crt:/private/tls.crt {sock}:/run/native.sock','MemoryMax':'256M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/output','RuntimeMaxSec':'60'}
command=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61005','--regid=61005','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin','/opt/node/bin/node','/app/scripts/notification-client-live.mjs']
try:
 subprocess.run(['/usr/bin/setfacl','-m','u:61005:rw',str(sock)],env=clean,check=True)
 completed=subprocess.run(command,env=clean,capture_output=True,text=True);verify()
finally:subprocess.run(['/usr/bin/setfacl','--restore=-'],input=acl,env=clean,check=True)
log=completed.stdout+completed.stderr;(out/'run.log').write_text(log)
receipt={'runId':run,'exitCode':completed.returncode,'image':candidate['image'],'admissionSHA256':digest(admission_path),'clientArchiveSHA256':digest(archive),'logSHA256':digest(out/'run.log'),'syntheticCheckpointSeed':True,'isolation':'exclusive UID61005, private network/protected paths, only verified synthetic native socket and synthetic identities','checks':json.loads((result/'client-live-checks.json').read_text()) if completed.returncode==0 else None}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');os.chown(out,repo.stat().st_uid,repo.stat().st_gid);os.chown(out/'receipt.json',repo.stat().st_uid,repo.stat().st_gid)
print(json.dumps({'receipt':str(out/'receipt.json'),'exitCode':completed.returncode}));raise SystemExit(completed.returncode)
