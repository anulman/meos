# SPDX-License-Identifier: Apache-2.0
"""Synthetic host tests: no network, home, credentials, Docker or production paths."""
import os,pathlib,subprocess,hashlib,json,fcntl,time,tempfile
assert os.geteuid()==0
root=pathlib.Path(__file__).resolve().parents[1];uid=61007
lock=os.open('/run/lock/meos-host-test-61007.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert str(uid) not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],text=True,env={'PATH':'/usr/bin:/bin'}).split()
props={'PrivateNetwork':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /synthetic:mode=0700,uid=61007,gid=61007','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindReadOnlyPaths':str(root/'clients/meos-host')+':/source','MemoryMax':'256M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/source'}
proof=pathlib.Path(tempfile.mkdtemp(prefix='host-sandbox-',dir=root/'.qualification'));os.chown(proof,uid,uid)
for name in ['mcp','outbox']:
 folder=proof/name;folder.mkdir(mode=0o700);os.chown(folder,uid,uid)
sentinel=proof/'readonly';sentinel.write_text('synthetic');sentinel.chmod(0o600);os.chown(sentinel,uid,uid)
props['BindReadOnlyPaths']+=' '+str(proof)+':/fixture'
props['ReadWritePaths']='/fixture/mcp /fixture/outbox'
paths=sorted((root/'clients/meos-host').glob('*.py'));before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61007','--regid=61007','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/synthetic','TMPDIR=/synthetic','MEOS_SANDBOX_CREDENTIAL_DIR=/fixture/mcp','PYTHONDONTWRITEBYTECODE=1','/usr/bin/python3','-m','unittest','discover','-v','-s','/source']
r=subprocess.run(cmd,capture_output=True,text=True)
assert before=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'Source changed during proof'
out=root/'.qualification';out.mkdir(exist_ok=True);stem=out/('host-'+str(time.time_ns()));stem.with_suffix('.log').write_text(r.stdout+r.stderr);stem.with_suffix('.json').write_text(json.dumps({'exitCode':r.returncode,'sourceSHA256':before,'isolation':'systemd private network, protected paths, env-i, exclusive zero-capability UID61007','log':str(stem.with_suffix('.log'))},indent=2)+'\n')
for p in [stem.with_suffix('.log'),stem.with_suffix('.json')]:os.chown(p,root.stat().st_uid,root.stat().st_gid)
print(r.stdout+r.stderr);print(stem.with_suffix('.json'));raise SystemExit(r.returncode)
