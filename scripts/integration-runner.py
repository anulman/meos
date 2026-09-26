# SPDX-License-Identifier: Apache-2.0
"""Trusted acceptance launcher. Inspect/review before running with sudo. No endpoint overrides."""
import os,pathlib,json,subprocess,shutil,sys,stat,tempfile
assert os.geteuid()==0
repo=pathlib.Path(__file__).resolve().parents[1]
source=repo.parent/'meos-backend' / '.qualification'
r=json.loads((source/'runtime-launch.json').read_text());p=r['plan'];run=p['runId']
assert len(run)==32 and all(c in '0123456789abcdef' for c in run)
assert p['environment']=='acceptance' and p['network']=='none' and p['syntheticOnly'] is True
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
mode=sys.argv[1] if len(sys.argv)==2 else 'probe';assert mode in ['probe','build','browser','demo','checks']
q=repo/'.qualification';assert not q.is_symlink();q.mkdir(exist_ok=True);sandbox=pathlib.Path(tempfile.mkdtemp(prefix='integration-',dir=q));(q/'last-sandbox-path.txt').write_text(str(sandbox))
# Copy only project source and public static assets. Never copy git metadata, host env, or private qualification trees.
for part in ['src','backend','scripts','public','docs']:
 assert not (repo/part).is_symlink() and all(not child.is_symlink() for child in (repo/part).rglob('*'));shutil.copytree(repo/part,sandbox/part)
for part in ['package.json','pnpm-lock.yaml','tsconfig.json','vite.config.ts']:
 assert not (repo/part).is_symlink();shutil.copyfile(repo/part,sandbox/part)
private=sandbox/'private';private.mkdir(exist_ok=True)
for part in ['acceptance-endpoint.json','synthetic-credentials.json']:
 data=json.loads((source/part).read_text());assert data['runId']==run
 (private/part).write_text(json.dumps(data));os.chmod(private/part,0o600)
for path in [sandbox,*sandbox.rglob('*')]:
 if not path.is_symlink():os.chown(path,10001,10001)
node='/home/clawy/.local/share/mise/installs/node/24.19.0'
deps=repo.parent/'meos'/'node_modules';assert deps.is_dir() and not deps.is_symlink()
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /opt /work/node_modules/.vite-temp:mode=1777 /work/node_modules/.vite:mode=1777','InaccessiblePaths':'/mnt /var/lib /root -/etc/ssl/private -/etc/ssh','BindPaths':str(sandbox)+':/work','BindReadOnlyPaths':f'{sock}:/run/meos-acceptance-data/server.sock {deps}:/work/node_modules {node}:/opt/node /opt/playwright:/opt/playwright','MemoryMax':'1800M','TasksMax':'180','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/work'}
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={value}' for k,value in props.items()]+['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/opt/node/bin:/usr/bin:/bin','HOME=/tmp','MEOS_ACCEPTANCE_RUN='+run,'/opt/node/bin/node','scripts/integration-harness.mjs',mode]
result=subprocess.run(cmd,env=clean)
for part in ['isolation-proof.json','integration-evidence.json']:
 path=sandbox/part
 if path.is_file():
  assert path.stat().st_size<1000000 and not path.is_symlink();shutil.copyfile(path,q/part);os.chown(q/part,repo.stat().st_uid,repo.stat().st_gid)
sys.exit(result.returncode)
