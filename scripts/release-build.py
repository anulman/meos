# SPDX-License-Identifier: Apache-2.0
"""Trusted offline candidate builder. Imports a NEW image; never admits or deploys it.
Run with sudo after manual inspection. Fixed reviewed inputs, no credentials.
"""
import fcntl,grp,hashlib,importlib.util,json,os,pathlib,pwd,shutil,subprocess,sys,tarfile,time
assert os.geteuid()==0
assert sys.argv[1:] in [[],['--isolation-only']]
isolation_only=bool(sys.argv[1:])
BUILD_UID=BUILD_GID=61003
# This numeric identity is reserved to one isolated build at a time.
# Refuse to claim an existing account/group or reuse a live process credential.
for lookup in [pwd.getpwuid,grp.getgrgid]:
 try:lookup(BUILD_UID)
 except KeyError:pass
 else:raise AssertionError('Dedicated build UID/GID is assigned to a host account')
lease=os.open('/run/lock/meos-release-build-uid61003.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
assert os.fstat(lease).st_uid==0
fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
for process in pathlib.Path('/proc').glob('[0-9]*/status'):
 try:status=process.read_text()
 except FileNotFoundError:continue
 for line in status.splitlines():
  if line.startswith(('Uid:','Gid:','Groups:')):
   assert str(BUILD_UID) not in line.split()[1:], 'Dedicated build UID/GID already has a host process'
host_user_namespace=os.readlink('/proc/self/ns/user')
repo=pathlib.Path(__file__).resolve().parents[1]
source=repo.parent/'meos-backend';q=source/'.qualification';clean={'PATH':'/usr/bin:/bin'}
base='sha256:592e54a55bf2ce63de2669736aaa7153bd1dd712057989f3fdb0a230e19b3aff'
sha=lambda p:'sha256:'+hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
admission=json.loads((source/'backend/reviewed-artifacts.json').read_text())['artifacts'][0]
assert admission['image']==base
for key in ['inventory','source','notices']:
 assert sha(source/'backend'/admission[key+'File'])==admission[key+'Digest']
inventory=json.loads((source/'backend/retained-inventory.json').read_text());assert inventory['image']==base
rt=q/'runtime-root';expected={x['path']:x['digest'] for x in inventory['files']}
assert {str(p.relative_to(rt)) for p in rt.rglob('*') if p.is_file()}==set(expected)
for name,digest in expected.items():assert not (rt/name).is_symlink() and sha(rt/name)==digest
compiler=next((q/'qjs-source').glob('*/target/debug/componentize-qjs'))
compiler_hash=json.loads((repo/'backend/componentizer-qualification.json').read_text())['patch']['patchedBinarySHA256']
assert sha(compiler)=='sha256:'+compiler_hash
out=repo/'.qualification'/('release-'+str(time.time_ns()));out.mkdir(mode=0o700)
work=out/'work';work.mkdir();(work/'backend').mkdir();(work/'scripts').mkdir()
# Strict application-source selection, excluding private receipts and retained archives.
for p in (repo/'backend').rglob('*'):
 assert not p.is_symlink()
 if p.is_file() and (p.suffix in ['.mjs','.json','.sql','.patch']):
  target=work/'backend'/p.relative_to(repo/'backend');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
shutil.copyfile(repo/'scripts/release-bundle.mjs',work/'scripts/release-bundle.mjs')
source_manifest={str(p.relative_to(work)):sha(p) for p in work.rglob('*') if p.is_file()}
with tarfile.open(out/'application-source.tar.gz','w:gz') as t:
 t.add(work/'backend',arcname='backend');t.add(work/'scripts',arcname='scripts')
for p in [work,*work.rglob('*')]:os.chown(p,BUILD_UID,BUILD_GID)
up=next(q.glob('trailbase-*'));esbuild=up/'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild';esbuild_bin=(esbuild.parent/'@esbuild/linux-x64').resolve();node='/home/clawy/.local/share/mise/installs/node/24.19.0'
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /opt','InaccessiblePaths':'/mnt /var/lib /root -/etc/ssl/private -/etc/ssh','BindPaths':f'{work}:/work','BindReadOnlyPaths':f'{work}/scripts:/work/scripts {work}/backend:/work/backend {work}/isolation-input.json:/work/isolation-input.json {node}:/opt/node {esbuild}:/opt/esbuild {esbuild_bin}:/opt/esbuild-bin {q}/guest-deps:/opt/guest-deps {q}/guest-wit:/opt/guest-wit {compiler}:/opt/componentize-qjs','MemoryMax':'1100M','MemorySwapMax':'250M','CPUQuota':'100%','TasksMax':'128','RestrictNamespaces':'yes','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','AmbientCapabilities':'','WorkingDirectory':'/work'}
# Only inert synthetic decoys are host processes; no repository code executes here.
# The root-held lease and no-existing-UID preflight reserve61003 for this build.
# Host decoys use only backend/web identities; never share the build identity.
# Numeric systemd User without NSS fails here, so trusted setpriv drops first.
decoys=[]
try:
 for uid in [10001,61002]:
  decoy_file=out/('decoy-'+str(uid))
  fd=os.open(decoy_file,os.O_CREAT|os.O_EXCL|os.O_RDWR|os.O_NOFOLLOW,0o600)
  os.write(fd,b'meos-inert-decoy-not-a-credential');os.lseek(fd,0,os.SEEK_SET);os.fchown(fd,uid,uid)
  program="import os,sys;fd=int(sys.argv[1]);assert os.read(fd,100)==b'meos-inert-decoy-not-a-credential';print(str(os.getpid())+' '+str(fd),flush=True);sys.stdin.buffer.read()"
  child=subprocess.Popen(['/usr/bin/setpriv','--reuid='+str(uid),'--regid='+str(uid),'--clear-groups','/usr/bin/python3','-c',program,str(fd)],pass_fds=(fd,),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=clean)
  os.close(fd);decoys.append((uid,child))
  pid,held_fd=map(int,child.stdout.readline().split());assert pid==child.pid and child.poll() is None
  child.decoy_fd=held_fd
  assert pathlib.Path(f'/proc/{pid}/fd/{held_fd}').read_bytes()==b'meos-inert-decoy-not-a-credential'
  assert os.readlink(f'/proc/{pid}/root')=='/'
 isolation={'buildUid':BUILD_UID,'dedicatedUidPreflight':True,'exclusiveRootLease':True,'hostDecoyPositiveControl':True,'decoys':[{'uid':uid,'pid':child.pid,'fd':child.decoy_fd} for uid,child in decoys]}
 (work/'isolation-input.json').write_text(json.dumps(isolation));os.chmod(work/'isolation-input.json',0o444)
 cmd=['systemd-run','--unit=meos-release-build-'+str(time.time_ns()),'--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid='+str(BUILD_UID),'--regid='+str(BUILD_GID),'--clear-groups','--bounding-set=-all','--inh-caps=-all','--ambient-caps=-all','/usr/bin/env','-i','PATH=/opt/node/bin:/usr/bin:/bin','HOME=/tmp','LANG=C.UTF-8','ESBUILD_BINARY_PATH=/opt/esbuild-bin/bin/esbuild','/opt/node/bin/node','scripts/release-bundle.mjs']+(['--isolation-only'] if isolation_only else [])
 subprocess.run(cmd,env=clean,check=True)
 assert all(child.poll() is None for _,child in decoys), 'A decoy exited; denial proof invalid'
finally:
 for _,child in decoys:
  if child.stdin:child.stdin.close()
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.terminate();child.wait(timeout=5)
if isolation_only:
 print(json.dumps({'status':'isolation-only-no-build-no-import','proof':str(work/'isolation-proof.json')}));sys.exit(0)
target=out/'runtime-root';shutil.copytree(rt,target)
shutil.copyfile(work/'meos-guest.wasm',target/'data/wasm/meos.wasm')
(target/'data/config.textproto').write_text('server { application_name: "MeOS" site_url: "https://meos.aidans.computer" }\nauth { disable_password_auth: true enable_otp_signin: false enable_anonymous_signin: false }\n')
# Ship every current migration, preserving already-reviewed applied history.
sys.dont_write_bytecode=True
depot_helper=repo/'scripts/calendar-depot-runtime.py'
spec=importlib.util.spec_from_file_location('calendar_depot',depot_helper);depot=importlib.util.module_from_spec(spec);spec.loader.exec_module(depot)
depot.package_migrations(work/'backend/migrations',target/'data/migrations/main')
new_files={str(p.relative_to(target)):sha(p) for p in target.rglob('*') if p.is_file()}
changes={k:{'before':expected.get(k),'after':v} for k,v in new_files.items() if expected.get(k)!=v}
assert set(expected)<=set(new_files)
assert {'data/wasm/meos.wasm','data/config.textproto'}<=set(changes)
assert all(k in ['data/wasm/meos.wasm','data/config.textproto'] or (k.startswith('data/migrations/main/') and k not in expected) for k in changes)
with tarfile.open(out/'runtime-root.tar','w') as t:
 def ownership(i):
  i.uid=i.gid=10001 if i.name=='data' or i.name.startswith('data/') else 0;i.uname=i.gname='';return i
 for p in sorted(target.iterdir()):t.add(p,arcname=p.name,filter=ownership)
# Preserve referenced license closure locally without recompressing/changing it.
for name in ['retained-source.tar.gz','retained-notices.txt','retained-inventory.json']:
 shutil.copyfile(source/'backend'/name,out/name)
image=subprocess.check_output(['docker','--host','unix:///var/run/docker.sock','import','--change','USER 10001:10001','--change','ENV RUST_LOG=warn XDG_CACHE_HOME=/data/.cache',str(out/'runtime-root.tar')],env=clean,text=True).strip()
(out/'image-id.txt').write_text(image+'\n')
receipt={'schema':1,'status':'candidate-not-admitted-not-deployed','baseImage':base,'image':image,'origin':'https://meos.aidans.computer','compiledEnvironment':'production','compilerDigest':'sha256:'+compiler_hash,'depotHelperDigest':sha(depot_helper),'sourceCommit':subprocess.check_output(['git','-c','safe.directory='+str(repo),'-C',str(repo),'rev-parse','HEAD'],env=clean,text=True).strip(),'sourceFiles':source_manifest,'files':new_files,'changesFromReviewedRuntime':changes,'baseAdmission':admission,'artifacts':{n:sha(out/n) for n in ['application-source.tar.gz','retained-source.tar.gz','retained-notices.txt','retained-inventory.json','runtime-root.tar']},'isolationProof':json.loads((work/'isolation-proof.json').read_text())}
(out/'candidate.json').write_text(json.dumps(receipt,indent=2)+'\n')
owner=repo.stat();os.chown(out,owner.st_uid,owner.st_gid);os.chown(out/'candidate.json',owner.st_uid,owner.st_gid)
print(json.dumps({'candidate':str(out/'candidate.json'),'image':image,'status':receipt['status']}))
