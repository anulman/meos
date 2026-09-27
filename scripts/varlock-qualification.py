# SPDX-License-Identifier: Apache-2.0
"""Synthetic-only Varlock artifact qualification. Requires independent package
admission; no installation, real credentials, provider networking, or renderer run.
"""
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tempfile,time
assert os.geteuid()==0
repo=pathlib.Path(__file__).resolve().parents[1];source=repo/'.qualification/varlock-1.21.0'
a=json.loads((source/'admission.json').read_text());assert a['status']=='approved-varlock-isolated-qualification' and a['reviewer'] and a['licenseEvidence']
assert a['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
assert a['archiveSHA256']==hashlib.sha256((source/'package.tgz').read_bytes()).hexdigest()
files={str(p.relative_to(source/'package')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (source/'package').rglob('*') if p.is_file()}
assert files==a['packageFiles'] and all(not p.is_symlink() for p in (source/'package').rglob('*'))
lock=os.open('/run/lock/meos-test-61001.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61001' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env={'PATH':'/usr/bin:/bin'},text=True).split()
q=pathlib.Path(tempfile.mkdtemp(prefix='varlock-proof-',dir=repo/'.qualification'));shutil.copytree(source/'package',q/'varlock');shutil.copyfile(repo/'deployment/calendar.env.schema',q/'calendar.env.schema')
probe=r'''import os,pathlib,subprocess,json
assert os.getuid()==61001
assert not pathlib.Path('/home/clawy/.openclaw').exists() and not os.access('/var/lib',os.R_OK) and not pathlib.Path('/run/docker.sock').exists()
assert all(int(line.split()[1],16)==0 for line in pathlib.Path('/proc/self/status').read_text().splitlines() if line.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
base=pathlib.Path('/work');cli=['/opt/node/bin/node','/work/varlock/bin/cli.js']
secret='synthetic-secret-MEOS-qualification-7a13'
checks=[]
for name,values,allowed in [('valid',{'MEOS_PUBLIC_ORIGIN':'https://synthetic.example.invalid','MEOS_GOOGLE_CLIENT_ID':'synthetic.apps.googleusercontent.com','MEOS_GOOGLE_CLIENT_SECRET':secret},True),('missing',{'MEOS_PUBLIC_ORIGIN':'https://synthetic.example.invalid','MEOS_GOOGLE_CLIENT_ID':'synthetic.apps.googleusercontent.com'},False),('invalid-origin',{'MEOS_PUBLIC_ORIGIN':'not-a-url','MEOS_GOOGLE_CLIENT_ID':'synthetic.apps.googleusercontent.com','MEOS_GOOGLE_CLIENT_SECRET':secret},False)]:
 directory=base/name;directory.mkdir();(directory/'.env.schema').write_bytes((base/'calendar.env.schema').read_bytes());(directory/'.env').write_text('\n'.join(k+'='+v for k,v in values.items())+'\n')
 marker=directory/'child-ran';code='import os,pathlib;assert os.environ["MEOS_PUBLIC_ORIGIN"]=="https://synthetic.example.invalid";assert os.environ["MEOS_GOOGLE_CLIENT_SECRET"]=='+repr(secret)+';pathlib.Path('+repr(str(marker))+').write_text("yes");print(os.environ["MEOS_GOOGLE_CLIENT_SECRET"])'
 result=subprocess.run(cli+['run','--path',str(directory)+'/','--redact-stdout','--inject','vars','--','/usr/bin/python3','-c',code],capture_output=True,text=True,timeout=30)
 assert (result.returncode==0)==allowed,(name,result.returncode,result.stdout[-1000:],result.stderr[-1000:])
 assert marker.exists()==allowed
 assert secret not in result.stdout+result.stderr,'Sensitive output not redacted'
 checks.append(name)
(base/'proof.json').write_text(json.dumps({'checks':checks,'syntheticOnly':True,'network':'private','uid':61001,'secretOutputRedacted':True,'invalidConfigPreventsChild':True}))
'''
(q/'probe.py').write_text(probe)
for p in [q,*q.rglob('*')]:os.chown(p,61001,61001)
node='/home/clawy/.local/share/mise/installs/node/24.19.0'
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /opt','InaccessiblePaths':'/mnt /var/lib /root -/etc/ssl/private -/etc/ssh','BindPaths':str(q)+':/work','BindReadOnlyPaths':node+':/opt/node','MemoryMax':'400M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/work'}
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61001','--regid=61001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/opt/node/bin:/usr/bin:/bin','HOME=/tmp','VARLOCK_TELEMETRY_DISABLED=1','DO_NOT_TRACK=1','/usr/bin/python3','/work/probe.py']
r=subprocess.run(cmd,env={'PATH':'/usr/bin:/bin'},capture_output=True,text=True)
receipt={'exitCode':r.returncode,'packageArchiveSHA256':a['archiveSHA256'],'schemaSHA256':hashlib.sha256((repo/'deployment/calendar.env.schema').read_bytes()).hexdigest(),'scriptSHA256':a['scriptSHA256'],'sandbox':str(q),'proof':json.loads((q/'proof.json').read_text()) if (q/'proof.json').exists() else None}
(q/'launcher-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');(q/'launcher.log').write_text(r.stdout+r.stderr)
print(json.dumps({'exitCode':r.returncode,'receipt':str(q/'launcher-receipt.json')}));raise SystemExit(r.returncode)
