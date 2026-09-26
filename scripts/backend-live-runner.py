# SPDX-License-Identifier: Apache-2.0
# Trusted launcher. Repository tests see only a verified disposable UDS, never Docker/production.
import pathlib,json,subprocess,sys,re,os,stat
assert os.geteuid()==0, "Run this trusted launcher with sudo; test process drops all capabilities"
repo=pathlib.Path(__file__).resolve().parents[1];q=repo/'.qualification';r=json.loads((q/'runtime-launch.json').read_text());plan=r['plan'];run=plan['runId']
assert re.fullmatch('[a-f0-9]{32}',run) and plan['environment']=='acceptance' and plan['network']=='none' and plan['syntheticOnly'] is True
name='meos-acceptance-'+run
clean={'PATH':'/usr/bin:/bin'}
def inspect(kind,value):return json.loads(subprocess.check_output(['docker','--host','unix:///var/run/docker.sock',kind,'inspect',value],env=clean))[0]
c=inspect('container',name);v=inspect('volume',name+'-data')
assert c['Id']==r['containerId']
assert c['Image']==plan['image'] and c['State']['Running'] and c['HostConfig']['NetworkMode']=='none' and c['HostConfig']['ReadonlyRootfs'] and c['Config']['User']=='10001:10001'
assert set(c['NetworkSettings']['Networks'])=={'none'}, 'additional runtime network attached'
assert c['Config']['Labels']['meos.acceptance.run']==run and c['Config']['Labels']['meos.environment']=='acceptance'
assert v['Labels']['meos.acceptance.run']==run and v['Labels']['meos.environment']=='acceptance' and v['Driver']=='local' and not v.get('Options')
assert not c['HostConfig'].get('Binds') and not c['HostConfig'].get('PortBindings') and not c['HostConfig'].get('Privileged')
mounts=[x for x in c['Mounts'] if x['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data'
sandbox=q/('live-sandbox-'+run);assert not sandbox.is_symlink();sandbox.mkdir(exist_ok=True);os.chown(sandbox,10001,10001);os.chmod(sandbox,0o755)
for filename in ['synthetic-credentials.json','acceptance-endpoint.json']:
 data=(q/filename).read_bytes();assert json.loads(data)['runId']==run
 fd=os.open(sandbox/filename,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
 os.chown(sandbox/filename,10001,10001);os.chmod(sandbox/filename,0o600)
proxy=sys.argv[1:]==['--proxy'];assert len(sys.argv)==1 or proxy,'no operator endpoint/script override'
script='backend-proxy-live.mjs' if proxy else 'backend-live-tests.py'
node='/home/clawy/.local/share/mise/installs/node/24.19.0'
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','NoNewPrivileges':'yes','PrivateTmp':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindPaths':str(sandbox)+':'+str(q),'BindReadOnlyPaths':v['Mountpoint']+':/run/meos-acceptance-data '+str(repo/'scripts')+' '+str(repo/'backend')+' '+node,'MemoryMax':'256M','TasksMax':'32','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':str(q)}
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={x}' for k,x in props.items()]+['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin',node+'/bin/node' if proxy else '/usr/bin/python3',str(repo/'scripts'/script)]
result=subprocess.run(cmd)
if result.returncode==0:
 for filename in (['proxy-live-checks.json'] if proxy else ['live-checks.json','live-fixture.json']):
  source=sandbox/filename;assert stat.S_ISREG(source.lstat().st_mode) and source.stat().st_size<1000000
  data=source.read_bytes();assert json.loads(data)['runId']==run
  (q/filename).write_bytes(data);owner=q.stat();os.chown(q/filename,owner.st_uid,owner.st_gid)
sys.exit(result.returncode)
