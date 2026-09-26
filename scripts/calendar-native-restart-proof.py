# SPDX-License-Identifier: Apache-2.0
"""Independently admitted synthetic native socket-rebind proof; never production.
Uses existing acceptance volume without reset. Actual backend template/readiness
helper and Calendar isolation/dependency template, with a read-only MCP probe.
"""
import argparse,fcntl,hashlib,json,os,pathlib,shutil,stat,subprocess,time,uuid
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--admission',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[1];source=repo/'.qualification/release-calendar-acceptance';clean={'PATH':'/usr/bin:/bin'}
admission_path=pathlib.Path(a.admission);i=admission_path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600
admission=json.loads(admission_path.read_text());assert admission['status']=='approved-calendar-native-restart-synthetic' and admission['reviewer'] and admission['evidence']
assert admission['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
inputs=[*sorted((repo/'backend').glob('*.mjs')),repo/'scripts/production-ready.py',repo/'scripts/calendar-uid-check.py',repo/'deployment/meos-backend.service.in',repo/'deployment/meos-calendar.service.in',repo/'deployment/meos-calendar.socket']
hashes={str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs};assert hashes==admission['sourceFiles']
for name,key in [('runtime-launch.json','launchSHA256'),('synthetic-credentials.json','credentialsSHA256')]:assert hashlib.sha256((source/name).read_bytes()).hexdigest()==admission[key]
launch=json.loads((source/'runtime-launch.json').read_text());plan=launch['plan'];run=plan['runId']
assert plan['environment']=='acceptance' and plan['syntheticOnly'] is True and plan['network']=='none' and plan['origin']=='https://meos.aidans.computer'
assert len(run)==32 and all(c in '0123456789abcdef' for c in run)
locks=[]
for name,uid in [('meos-test-61001',61001),('meos-calendar-qualification-61004',61004)]:
 fd=os.open('/run/lock/'+name+'.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(fd)
 assert str(uid) not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env=clean,text=True).split()
def command(*args):
 r=subprocess.run(args,env=clean,capture_output=True,text=True,timeout=90);assert r.returncode==0,'Synthetic operation failed; reconcile retained artifacts';return r.stdout
def docker(*args):return command('/usr/bin/docker','--host','unix:///var/run/docker.sock',*args)
c=json.loads(docker('inspect',launch['containerId']))[0];v=json.loads(docker('volume','inspect',launch['volume']))[0];h=c['HostConfig']
assert c['Id']==launch['containerId'] and c['Image']==plan['image'] and c['State']['Running'] and c['Name']=='/meos-acceptance-'+run
assert c['Config']['User']=='10001:10001' and set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom') and h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges'] and not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
for labels in [c['Config']['Labels'],v['Labels']]:assert labels['meos.environment']=='acceptance' and labels['meos.acceptance.run']==run
mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name']==launch['volume']=='meos-acceptance-'+run+'-data' and mounts[0]['Source']==v['Mountpoint'] and mounts[0]['Destination']=='/data' and v['Driver']=='local' and not v['Options']
credentials=json.loads((source/'synthetic-credentials.json').read_text());assert credentials['runId']==run and all(u['email'].endswith('@example.invalid') for u in credentials['users'])
principal=credentials['calendarPrincipal'];assert principal['ownerId']==credentials['users'][0]['id'] and principal['agentId']!=principal['ownerId'] and set(principal['scopes'])=={'sync:read','sync:write'} and 'password' not in principal
prefix='meos-native-restart-proof-'+uuid.uuid4().hex;base=pathlib.Path('/var/lib')/prefix;base.mkdir(mode=0o700);release=base/'release';release.mkdir();(release/'backend').mkdir();(release/'scripts').mkdir()
for item in inputs:
 if item.parent.name in ['backend','scripts']:shutil.copyfile(item,release/item.relative_to(repo))
state=base/'state';state.mkdir(mode=0o700);os.chown(state,61004,61004)
runtime=base/'runtime.json';runtime.write_text(json.dumps({'environment':'acceptance','instanceId':run,'image':plan['image'],'containerId':c['Id'],'volume':v['Name'],'origin':plan['origin']}));runtime.chmod(0o600)
for name,value in [('config.json',{}),('oauth.json',{}),('principal.json',principal)]:
 target=base/name;target.write_text(json.dumps(value));os.chown(target,0,61004);target.chmod(0o440)
probe="""import fs from 'node:fs';
import {createCalendarPlannerClient} from '../backend/calendar-planner-client.mjs';
import {unixUpstream} from '../backend/node-web-server.mjs';
const saved='/data/principal.json';
const credentials=JSON.parse(fs.readFileSync(fs.existsSync(saved)?saved:'/run/meos-calendar/planner.json'));
credentials.authToken='force-synthetic-native-refresh';
const planner=createCalendarPlannerClient({origin:'https://meos.aidans.computer',upstream:unixUpstream({origin:'https://meos.aidans.computer',socketPath:'/run/meos-planner/backend.sock'}),credentials,saveCredentials:value=>fs.writeFileSync(saved,JSON.stringify(value),{mode:0o600})});
const result=await planner.invoke('calendar_inventory',{kind:'tasks'});
if(!Array.isArray(result.items))throw Error('inventory');
fs.writeFileSync('/data/proof.json',JSON.stringify({pid:process.pid,uid:process.getuid(),inode:fs.statSync('/run/meos-planner/backend.sock').ino,inventoryRead:true,refreshPersisted:fs.existsSync(saved)}),{mode:0o600});
setInterval(()=>{},1000);
"""
(release/'scripts/probe.mjs').write_text(probe)
backend=(repo/'deployment/meos-backend.service.in').read_text()
for key,value in {'CONTAINER':c['Id'],'RELEASE':str(release),'STATE':str(runtime)}.items():backend=backend.replace('@'+key+'@',value)
socket_path='/run/'+prefix+'/control.sock';sock=(repo/'deployment/meos-calendar.socket').read_text().replace('/run/meos-calendar/control.sock',socket_path)
unit=(repo/'deployment/meos-calendar.service.in').read_text().replace('meos-calendar.socket',prefix+'.socket').replace('/app/scripts/serve-calendar.mjs','/app/scripts/probe.mjs')
values={'PLANNER_DEPENDENCY':'Requires='+prefix+'-backend.service\nAfter='+prefix+'-backend.service\nPartOf='+prefix+'-backend.service','PLANNER_BIND':'BindReadOnlyPaths='+v['Mountpoint']+'/server.sock:/run/meos-planner/backend.sock '+str(base/'principal.json')+':/run/meos-calendar/planner.json','RELEASE':str(release),'NODE_DIR':'/home/clawy/.local/share/mise/installs/node/24.19.0','CONFIG':str(base/'config.json'),'OAUTH':str(base/'oauth.json'),'STATE':str(state),'GOOGLE_ALLOW':'PrivateNetwork=yes'}
for key,value in values.items():unit=unit.replace('@'+key+'@',value)
assert '@' not in unit+backend
units={prefix+'.service':unit,prefix+'.socket':sock,prefix+'-backend.service':backend};installed=[];stopped=False
def proof(previous=None):
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  try:
   data=json.loads((state/'proof.json').read_text())
   if data['pid']!=previous and data['uid']==61004 and data['inventoryRead'] and data['refreshPersisted']:return data
  except FileNotFoundError:pass
  time.sleep(.1)
 raise RuntimeError('Native socket rebind proof failed; artifacts retained')
try:
 for name,text in units.items():
  target=pathlib.Path('/run/systemd/system')/name;assert not target.exists();target.write_text(text);installed.append(target)
 command('/usr/bin/systemctl','daemon-reload');docker('stop','--time','20',c['Id']);stopped=True
 command('/usr/bin/systemctl','start',prefix+'.service');before=proof()
 status=pathlib.Path('/proc/'+str(before['pid'])+'/status').read_text().splitlines();assert all(int(x.split()[1],16)==0 for x in status if x.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
 command('/usr/bin/systemctl','restart',prefix+'-backend.service');after=proof(before['pid']);assert before['inode']!=after['inode']
 assert after['inode']==(pathlib.Path(v['Mountpoint'])/'server.sock').stat().st_ino
 receipt={'status':'passed-synthetic-native-restart','runId':run,'sourceFiles':hashes,'scriptSHA256':admission['scriptSHA256'],'before':before,'after':after,'checks':['actual backend socket recreated','production-ready reapplied socket ACL','Calendar template dependency restarted isolated UID61004 probe','new inode bind and native MCP inventory succeeds','native refresh survives protected store restart'],'notActualCalendarProcess':True,'productionTouched':False}
 (base/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'receipt':str(base/'receipt.json')}))
finally:
 for suffix in ['.service','.socket','-backend.service']:subprocess.run(['/usr/bin/systemctl','stop',prefix+suffix],env=clean,capture_output=True,timeout=35)
 for target in installed:target.unlink()
 subprocess.run(['/usr/bin/systemctl','daemon-reload'],env=clean,capture_output=True,timeout=30)
 if stopped:
  docker('start',c['Id'])
  command('/usr/bin/systemd-run','--wait','--pipe','--collect','--property=BindReadOnlyPaths='+str(runtime)+':/etc/meos/runtime-state.json','/usr/bin/python3',str(release/'scripts/production-ready.py'))
  command('/usr/bin/setfacl','-m','u:61001:rw',str(pathlib.Path(v['Mountpoint'])/'server.sock'))
