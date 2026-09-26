# SPDX-License-Identifier: Apache-2.0
"""Trusted acceptance launcher. Inspect/review before running with sudo. No endpoint overrides."""
import os,pathlib,json,subprocess,shutil,sys,stat,tempfile,time,hashlib,fcntl
assert os.geteuid()==0
uid_lock=os.open('/run/lock/meos-test-61001.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(uid_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61001' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env={'PATH':'/usr/bin:/bin'},text=True).split(),'Dedicated test UID already active'
repo=pathlib.Path(__file__).resolve().parents[1]
raw_mode=sys.argv[1] if len(sys.argv)==2 else 'probe';candidate=raw_mode.startswith('candidate-');mode=raw_mode.removeprefix('candidate-');assert mode in ['probe','build','browser','demo','checks','restart','production-smoke'];prefix='candidate-' if candidate else ''
source=repo/'.qualification/release-acceptance' if candidate else repo.parent/'meos-backend'/'.qualification'
r=json.loads((source/'runtime-launch.json').read_text());p=r['plan'];run=p['runId']
assert len(run)==32 and all(c in '0123456789abcdef' for c in run)
assert p['environment']=='acceptance' and p['network']=='none' and p['syntheticOnly'] is True
assert p['volume']=='fresh-managed' and p['credentials']=='fresh-in-container' and p['identity']=='fresh-synthetic' and p['endpoint']=='container-unix-socket'
if candidate:
 admission=json.loads((source/'admission.json').read_text());assert admission['status']=='approved-for-isolated-qualification' and admission['image']==p['image']
 endpoint=json.loads((source/'acceptance-endpoint.json').read_text());assert endpoint['origin']=='https://meos.aidans.computer' and endpoint['runtimeEnvironment']=='production'
clean={'PATH':'/usr/bin:/bin'}
def inspect(kind,name):return json.loads(subprocess.check_output(['docker','--host','unix:///var/run/docker.sock',kind,'inspect',name],env=clean))[0]
name='meos-acceptance-'+run;c=inspect('container',name);v=inspect('volume',name+'-data')
assert c['Id']==r['containerId'] and c['Image']==p['image'] and c['State']['Running']
h=c['HostConfig'];assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom')
assert set(c['NetworkSettings']['Networks'])=={'none'} and c['Config']['User']=='10001:10001'
assert h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges']
assert not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
for obj in [c['Config'],v]:assert obj['Labels']['meos.acceptance.run']==run and obj['Labels']['meos.environment']=='acceptance'
assert v['Driver']=='local' and not v['Options']
mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data'
assert all(e.split('=')[0] in ['PATH','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR','RUST_LOG','XDG_CACHE_HOME'] for e in c['Config']['Env'])
sock=pathlib.Path(v['Mountpoint'])/'server.sock';assert stat.S_ISSOCK(sock.lstat().st_mode)

if mode=='restart':
 evidence=json.loads((repo/'.qualification'/(prefix+'integration-evidence.json')).read_text());assert evidence['runId']==run
 subprocess.run(['docker','--host','unix:///var/run/docker.sock','restart',c['Id']],env=clean,check=True,stdout=subprocess.DEVNULL)
 deadline=time.monotonic()+30
 while not sock.is_socket() and time.monotonic()<deadline:time.sleep(0.1)
 assert sock.is_socket()
# Grant only this verified acceptance server socket to the dedicated test UID.
subprocess.run(['/usr/bin/setfacl','-m','u:61001:rw',str(sock)],env=clean,check=True)
q=repo/'.qualification';assert not q.is_symlink();q.mkdir(exist_ok=True);sandbox=pathlib.Path(tempfile.mkdtemp(prefix='integration-',dir=q));(q/'last-sandbox-path.txt').write_text(str(sandbox))
# Copy only project source and public static assets. Never copy git metadata, host env, or private qualification trees.
for part in ['src','backend','scripts','public','docs']+(['deployment'] if (repo/'deployment').is_dir() else []):
 assert not (repo/part).is_symlink() and all(not child.is_symlink() for child in (repo/part).rglob('*'));shutil.copytree(repo/part,sandbox/part)
for part in ['package.json','pnpm-lock.yaml','tsconfig.json','vite.config.ts']:
 assert not (repo/part).is_symlink();shutil.copyfile(repo/part,sandbox/part)
source_files=sorted(p for p in sandbox.rglob('*') if p.is_file());source_hashes={str(p.relative_to(sandbox)):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files};source_digest=hashlib.sha256(json.dumps(source_hashes,sort_keys=True).encode()).hexdigest()
private=sandbox/'private';private.mkdir(exist_ok=True)
if mode=='production-smoke':
 assert candidate
 (sandbox/'dist').mkdir()
 (private/'runtime.json').write_text(json.dumps({'origin':endpoint['origin'],'environment':'production','instanceId':run}))
if mode=='restart':
 data=json.loads((q/(prefix+'persistence-fixture.json')).read_text());assert data['runId']==run;(private/'persistence-fixture.json').write_text(json.dumps(data))
for part in ['acceptance-endpoint.json','synthetic-credentials.json']:
 data=json.loads((source/part).read_text());assert data['runId']==run
 (private/part).write_text(json.dumps(data));os.chmod(private/part,0o600)
# Harmless backend-UID process models the /proc root/fd escape, with no secrets.
decoydir=pathlib.Path(tempfile.mkdtemp(prefix='meos-proc-denial-',dir='/tmp'));os.chmod(decoydir,0o755)
decoyfile=decoydir/'synthetic.txt';decoyfile.write_text('public synthetic isolation marker');os.chmod(decoyfile,0o644)
decoy=subprocess.Popen(['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','/usr/bin/python3','-c','import os,time;fd=os.open('+repr(str(decoyfile))+',os.O_RDONLY);print(fd,flush=True);time.sleep(300)'],env=clean,stdout=subprocess.PIPE,text=True)
decoyfd=int(decoy.stdout.readline());assert pathlib.Path('/proc/'+str(decoy.pid)+'/fd/'+str(decoyfd)).read_text()=='public synthetic isolation marker'
(private/'isolation-decoy.json').write_text(json.dumps({'pid':decoy.pid,'fd':decoyfd,'path':str(decoyfile),'uid':10001}))
for path in [sandbox,*sandbox.rglob('*')]:
 if not path.is_symlink():os.chown(path,61001,61001)
node='/home/clawy/.local/share/mise/installs/node/24.19.0'
deps=repo.parent/'meos'/'node_modules';assert deps.is_dir() and not deps.is_symlink()
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /opt /work/node_modules/.vite-temp:mode=1777 /work/node_modules/.vite:mode=1777','InaccessiblePaths':'/mnt /var/lib /root -/etc/ssl/private -/etc/ssh','BindPaths':str(sandbox)+':/work','BindReadOnlyPaths':f'{sock}:/run/meos-acceptance-data/server.sock {deps}:/work/node_modules {node}:/opt/node /opt/playwright:/opt/playwright','MemoryMax':'1800M','TasksMax':'180','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/work'}
if mode=='production-smoke':
 props['BindReadOnlyPaths']+=f' {sock}:/run/meos/backend.sock {private}/runtime.json:/run/meos/runtime.json'
 props['BindPaths']+=f' {sandbox}/dist:/app'
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={value}' for k,value in props.items()]+['/usr/bin/setpriv','--reuid=61001','--regid=61001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/opt/node/bin:/usr/bin:/bin','HOME=/tmp','MEOS_ACCEPTANCE_RUN='+run,'/opt/node/bin/node','scripts/integration-harness.mjs',mode]
try:
 result=subprocess.run(cmd,env=clean)
 assert decoy.poll() is None,'Decoy exited; proc denial is unproven'
finally:
 decoy.terminate();decoy.wait(timeout=5)
for part in ['isolation-proof.json','integration-evidence.json','demo-evidence.json','persistence-fixture.json','persistence-evidence.json','production-path-evidence.json']:
 path=sandbox/part
 if path.is_file():
  assert path.stat().st_size<1000000 and not path.is_symlink();shutil.copyfile(path,q/(prefix+part));os.chown(q/(prefix+part),repo.stat().st_uid,repo.stat().st_gid)
artifacts={}
if (sandbox/'dist/client').is_dir():
 for artifact in sorted((sandbox/'dist/client').rglob('*')):
  assert not artifact.is_symlink()
  if artifact.is_file():artifacts[str(artifact.relative_to(sandbox/'dist/client'))]=hashlib.sha256(artifact.read_bytes()).hexdigest()
receipt={'runId':run,'mode':mode,'exitCode':result.returncode,'sourceDigest':source_digest,'sourceFiles':source_hashes,'clientArtifactDigest':hashlib.sha256(json.dumps(artifacts,sort_keys=True).encode()).hexdigest(),'clientFiles':artifacts,'sandbox':str(sandbox),'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(q/('run-evidence-'+raw_mode+'.json')).write_text(json.dumps(receipt,indent=2));os.chown(q/('run-evidence-'+raw_mode+'.json'),repo.stat().st_uid,repo.stat().st_gid)
sys.exit(result.returncode)
