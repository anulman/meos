# SPDX-License-Identifier: Apache-2.0
# Trusted bounded launcher: repository tests never see credentials or production networking.
import os,pathlib,subprocess,sys,hashlib,json,time,fcntl,tempfile
assert os.geteuid()==0
uid_lock=os.open('/run/lock/meos-test-61001.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(uid_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61001' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env={'PATH':'/usr/bin:/bin'},text=True).split(),'Dedicated test UID already active'
root=pathlib.Path(__file__).resolve().parents[1]
node=pathlib.Path('/home/clawy/.local/share/mise/installs/node/24.19.0')
props={'PrivateNetwork':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindReadOnlyPaths':' '.join(str(root/p) for p in ['backend','scripts','src','docs','deployment','package.json'])+' '+str(node),'MemoryMax':'700M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/tmp'}
typecheck=sys.argv[1:]==['--typecheck'];assert len(sys.argv)==1 or typecheck
compiler=root/'.qualification/trailbase-3dfb2f70d8266036f1e7e9db4902e8b81026f69d/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript'
if typecheck:props['BindReadOnlyPaths']+=' '+str(compiler)
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61001','--regid=61001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin',str(node/'bin/node'),'--test']+[str(p) for p in sorted((root/'scripts').glob('backend-*-tests.mjs'))]+[str(root/'scripts/backend-tests.mjs')]
if typecheck:
 marker=cmd.index('--test');cmd=cmd[:marker]+[str(compiler/'bin/tsc'),'--noEmit','--strict','--target','es2022','--module','esnext','--lib','es2022,dom',str(root/'src/lib/backend/generated.ts')]
inputs=sorted(p for part in ['backend','scripts','src','docs','deployment'] for p in (root/part).rglob('*') if p.is_file() and '__pycache__' not in p.parts)+[root/'package.json']
def digests():return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
decoydir=pathlib.Path(tempfile.mkdtemp(prefix='meos-backend-proc-denial-'));os.chmod(decoydir,0o755);decoyfile=decoydir/'synthetic.txt';decoyfile.write_text('Harmless isolation marker');os.chmod(decoyfile,0o644)
decoy=subprocess.Popen(['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','/usr/bin/python3','-c','import os,time;fd=os.open('+repr(str(decoyfile))+',os.O_RDONLY);print(fd,flush=True);time.sleep(300)'],env={'PATH':'/usr/bin:/bin'},stdout=subprocess.PIPE,text=True)
fd=int(decoy.stdout.readline());assert pathlib.Path('/proc/'+str(decoy.pid)+'/fd/'+str(fd)).read_text()=='Harmless isolation marker'
probe='import os,sys,pathlib;assert os.getuid()==61001;assert not os.path.exists("/run/docker.sock");p=pathlib.Path('+repr('/proc/'+str(decoy.pid)+'/fd/'+str(fd))+');assert not os.access(p,os.R_OK);os.execv(sys.argv[1],sys.argv[1:])'
node_index=cmd.index(str(node/'bin/node'));cmd[node_index:node_index]=['/usr/bin/python3','-c',probe]
before=digests()
try:
 result=subprocess.run(cmd,capture_output=True,text=True);assert decoy.poll() is None
finally:decoy.terminate();decoy.wait(timeout=5)
sys.stdout.write(result.stdout);sys.stderr.write(result.stderr);assert before==digests(),'Source changed during backend proof'
run=str(time.time_ns());base=root/'.qualification'/('backend-'+run);log=result.stdout+result.stderr;base.with_suffix('.log').write_text(log)
receipt={'exitCode':result.returncode,'sourceFiles':before,'logSHA256':hashlib.sha256(log.encode()).hexdigest(),'log':str(base.with_suffix('.log')),'isolation':'trusted systemd private network/protected paths, env-i and exclusive zero-capability UID61001 with backend-UID proc decoy denial','typecheckOnly':typecheck}
base.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n')
for p in [base.with_suffix('.log'),base.with_suffix('.json')]:os.chown(p,root.stat().st_uid,root.stat().st_gid)
print('Backend receipt: '+str(base.with_suffix('.json')))
sys.exit(result.returncode)
