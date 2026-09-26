# SPDX-License-Identifier: Apache-2.0
# Trusted host entrypoint. Tests/build run only in private network/path namespace.
import pathlib,subprocess,os,json,hashlib,time,fcntl,sys
assert os.geteuid()==0
root=pathlib.Path(__file__).resolve().parents[1]
release=sys.argv[1:]==['--release'];assert not sys.argv[1:] or release
pin=json.loads((root/'clients/meos-agent/toolchain.json').read_text());assert hashlib.sha256((root/'.qualification/go1.27.1/go1.27.1.linux-amd64.tar.gz').read_bytes()).hexdigest()==pin['sha256']
lock=os.open('/run/lock/meos-client-61005.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61005' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],text=True,env={'PATH':'/usr/bin:/bin'}).split()
props={'PrivateNetwork':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindReadOnlyPaths':str(root/'clients/meos-agent')+' '+str(root/'.qualification/go1.27.1/go')+':/opt/go','MemoryMax':'700M','TasksMax':'64','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':str(root/'clients/meos-agent')}
if release:
 output=root/'.qualification'/('client-release-'+str(time.time_ns()));output.mkdir(mode=0o700);os.chown(output,61005,61005);props['BindPaths']=str(output)+':/output';props['BindReadOnlyPaths']+=' '+str(root/'scripts/agent-client-release.py')+' '+str(root/'LICENSE')
inputs={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'clients/meos-agent').rglob('*') if p.is_file()}
base=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61005','--regid=61005','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/tmp','GOCACHE=/tmp/go-cache','GOPATH=/tmp/go-path','GOTOOLCHAIN=local','GOPROXY=off','GOSUMDB=off','CGO_ENABLED=0','GOMAXPROCS=2','/opt/go/bin/go','test','-v','-count=1','./...']
if release:
 marker=base.index('/opt/go/bin/go');base[marker:]=['MEOS_GO=/opt/go/bin/go','MEOS_OUTPUT=/output','MEOS_VERSION=0.1.0-candidate','/usr/bin/python3',str(root/'scripts/agent-client-release.py')]
r=subprocess.run(base,capture_output=True,text=True);run=str(time.time_ns());out=root/'.qualification'/('agent-client-'+run);log=r.stdout+r.stderr;out.with_suffix('.log').write_text(log);out.with_suffix('.json').write_text(json.dumps({'exitCode':r.returncode,'sourceFiles':inputs,'logSHA256':hashlib.sha256(log.encode()).hexdigest(),'isolation':'private network/path namespace, exclusive zero-capability UID61005, env-i; synthetic loopback TLS only','toolchain':'go1.27.1 pinned upstream archive'},indent=2)+'\n')
for p in [out.with_suffix('.log'),out.with_suffix('.json')]:os.chown(p,root.stat().st_uid,root.stat().st_gid)
if release:
 os.chown(output,root.stat().st_uid,root.stat().st_gid)
 for p in output.rglob('*'):os.chown(p,root.stat().st_uid,root.stat().st_gid)
 print('Artifacts: '+str(output))
print(log);print(out.with_suffix('.json'));raise SystemExit(r.returncode)
