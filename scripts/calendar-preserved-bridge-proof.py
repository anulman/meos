# SPDX-License-Identifier: Apache-2.0
"""Admitted synthetic bridge proof on the actually upgraded retained depot.
No Google/network access; real native scoped Calendar operations and synthetic
provider. Creates/deletes one new synthetic task via existing fixture writer;
 tombstone/receipts remain honest. Calendar principal itself stays sync-only.
"""
import argparse,fcntl,hashlib,json,os,pathlib,shutil,stat,subprocess,tempfile
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--fixture',required=True);p.add_argument('--admission',required=True);p.add_argument('--state',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[1];fixture=pathlib.Path(a.fixture).absolute();clean={'PATH':'/usr/bin:/bin'}
def secure(path):
 i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022 and i.st_nlink==1
 for parent in path.parents:
  i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
admission_path=pathlib.Path(a.admission).absolute();secure(admission_path);admission=json.loads(admission_path.read_text());assert admission['status']=='approved-calendar-preserved-bridge-synthetic' and admission['reviewer'] and admission['evidence']
assert admission['scriptSHA256']==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
paths={'stateSHA256':pathlib.Path(a.state).absolute(),'principalSHA256':fixture/'principal/planner-credentials.json','runtimeManifestSHA256':fixture/'runtime/runtime-manifest.json'}
for key,path in paths.items():secure(path);assert hashlib.sha256(path.read_bytes()).hexdigest()==admission[key]
state=json.loads(paths['stateSHA256'].read_text());principal=json.loads(paths['principalSHA256'].read_text());runtime=json.loads(paths['runtimeManifestSHA256'].read_text())
assert state['environment']=='acceptance' and state['image']==runtime['image'] and state['origin']=='https://meos.aidans.computer'
assert principal['agentId']!=principal['ownerId'] and set(principal['scopes'])=={'sync:read','sync:write'} and 'password' not in principal
writer_path=repo/'.qualification/release-hardened-acceptance/synthetic-credentials.json';assert hashlib.sha256(writer_path.read_bytes()).hexdigest()==admission['writerCredentialsSHA256']
writer_fixture=json.loads(writer_path.read_text());assert writer_fixture['runId']==state['instanceId'] and all(u['email'].endswith('@example.invalid') for u in writer_fixture['users'])
writers=[u for u in writer_fixture['users'] if u['email'].startswith('agent-')];assert len(writers)==1
source={str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (repo/'backend').glob('*.mjs')};assert source==admission['sourceFiles']
lock=os.open('/run/lock/meos-test-61001.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert '61001' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env=clean,text=True).split()
def inspect(kind,name):return json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock',kind,'inspect',name],env=clean))[0]
c=inspect('container',state['containerId']);v=inspect('volume',state['volume']);h=c['HostConfig'];run=state['instanceId']
assert c['State']['Running'] and c['Image']==state['image'] and c['Name']=='/meos-acceptance-'+run and v['Name']=='meos-acceptance-'+run+'-data'
assert c['Config']['User']=='10001:10001' and set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
assert h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom') and h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges'] and not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
for labels in [c['Config']['Labels'],v['Labels']]:assert labels['meos.environment']=='acceptance' and labels['meos.acceptance.run']==run
mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data' and mounts[0]['Source']==v['Mountpoint'] and v['Driver']=='local' and not v['Options']
loaded=pathlib.Path('/proc')/str(c['State']['Pid'])/'root/data'
for name,digest in runtime['files'].items():assert hashlib.sha256((loaded/name).read_bytes()).hexdigest()==digest
assert shutil.disk_usage(repo/'.qualification').free>=356*1024*1024
q=pathlib.Path(tempfile.mkdtemp(prefix='preserved-bridge-',dir=repo/'.qualification'));(q/'backend').mkdir()
for name in source:shutil.copyfile(repo/name,q/name)
(q/'principal.json').write_text(json.dumps(principal));(q/'principal.json').chmod(0o600)
(q/'writer.json').write_text(json.dumps(writers[0]));(q/'writer.json').chmod(0o600)
probe=r"""import assert from 'node:assert/strict';import fs from 'node:fs';
import {createCalendarPlannerClient} from './backend/calendar-planner-client.mjs';
import {createCalendarPlanner} from './backend/calendar-planner.mjs';
import {unixUpstream} from './backend/node-web-server.mjs';
assert.equal(process.getuid(),61001);for(const line of fs.readFileSync('/proc/self/status','utf8').split('\n').filter(x=>/^Cap(Eff|Prm|Bnd|Amb):/.test(x)))assert.equal(BigInt('0x'+line.trim().split(/\s+/)[1]),0n);
assert(!fs.existsSync('/run/docker.sock')&&!fs.existsSync('/home/clawy/.openclaw'));
const credentials=JSON.parse(fs.readFileSync('/work/principal.json'));credentials.authToken='force-native-refresh';let refreshed=false;
const native=createCalendarPlannerClient({origin:'https://meos.aidans.computer',upstream:unixUpstream({origin:'https://meos.aidans.computer',socketPath:'/run/planner.sock'}),credentials,saveCredentials:value=>{fs.writeFileSync('/work/rotated.json',JSON.stringify(value),{mode:0o600});refreshed=true}});
const page=await native.invoke('calendar_inventory',{kind:'tasks'});assert(Array.isArray(page.items));
const writer=JSON.parse(fs.readFileSync('/work/writer.json'));const upstream=unixUpstream({origin:'https://meos.aidans.computer',socketPath:'/run/planner.sock'});
const login=await upstream(new Request('https://meos.aidans.computer/api/auth/v1/login',{method:'POST',headers:{Origin:'https://meos.aidans.computer','Content-Type':'application/json'},body:JSON.stringify({email:writer.email,password:writer.password})}));assert.equal(login.status,200);const tokens=await login.json();
const writerInvoke=async(name,input)=>{const response=await upstream(new Request('https://meos.aidans.computer/api/meos/v1/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.auth_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:input}})}));assert.equal(response.status,200);const body=await response.json();assert(!body.result?.isError);assert(body.result?.structuredContent);return body.result.structuredContent};
const id=crypto.randomUUID(),value={id,title:'Synthetic preserved-depot task',notes:{type:'doc',content:[]},completed:false,priority:'none',schedule:{date:new Date().toISOString().slice(0,10),time:'12:00',timezone:'UTC'},durationMinutes:60,actualDurationMinutes:45,location:'Synthetic studio'};
const intent={value,idempotencyKey:crypto.randomUUID()};fs.writeFileSync('/work/task-intent.json',JSON.stringify(intent),{mode:0o600});const original=await writerInvoke('create_task',intent);
const planner={invoke:async(name,input)=>name==='calendar_inventory'?{items:input.kind==='tasks'?[await native.invoke('calendar_current',{kind:'tasks',id}).then(x=>x.record)]:[]}:name==='calendar_changes'?{items:[],cursor:0}:native.invoke(name,input)};
const records=new Map(),remotes=new Map();const store={get:k=>structuredClone(records.get(k)),transaction:fn=>fn({get:k=>structuredClone(records.get(k)),set:(k,v)=>records.set(k,structuredClone(v))})};
const broker={getEvent:async({eventId})=>{if(!remotes.has(eventId))throw Object.assign(Error(),{status:404});return structuredClone(remotes.get(eventId))},insertEvent:async({event})=>{const e={...event,status:'confirmed',etag:'exported'};remotes.set(e.id,e);return structuredClone(e)},patchEvent:async()=>{throw Error('Unexpected echo')},deleteEvent:async()=>{throw Error('Unexpected delete')}};
const bridge=createCalendarPlanner({store,planner,broker,connection:()=>({managedCalendarId:'synthetic-only'}),accessToken:async()=> 'synthetic-only'});const tick=()=>bridge.sync({renew(){},fenced(){},generation:'synthetic'});
let passed=false;
try{
 await tick();assert.equal(remotes.size,1);const [eventId,remote]=[...remotes][0];assert.equal(remote.summary,original.value.title);
 const current=await native.invoke('calendar_current',{kind:'tasks',id});await native.invoke('calendar_apply',{kind:'tasks',id,expectedRevision:current.revision,schedule:current.record.value.schedule,title:'Synthetic displaced local intent',idempotencyKey:crypto.randomUUID()});
 remotes.set(eventId,{...remote,summary:'Synthetic Google winner',etag:'google-winner'});await tick();
 const winner=await native.invoke('calendar_current',{kind:'tasks',id});assert.equal(winner.record.value.title,'Synthetic Google winner');assert.deepEqual(winner.record.value.notes,original.value.notes);assert.equal(winner.record.value.actualDurationMinutes,original.value.actualDurationMinutes);assert.equal(remotes.get(eventId).etag,'google-winner');assert(refreshed);passed=true;
}finally{
 const latest=await native.invoke('calendar_current',{kind:'tasks',id});await writerInvoke('delete_task',{id,expectedRevision:latest.revision,idempotencyKey:crypto.randomUUID()});assert((await native.invoke('calendar_current',{kind:'tasks',id})).deleted);
}
assert(passed);fs.writeFileSync('/work/proof.json',JSON.stringify({nativeCalendarInventory:true,realEntityExport:true,realGoogleWinsCASImport:true,noProviderEcho:true,newSyntheticTaskDeleted:true,nativeRefresh:true,syntheticProviderOnly:true}),{mode:0o600});
"""
(q/'probe.mjs').write_text(probe)
for path in [q,*q.rglob('*')]:os.chown(path,61001,61001)
sock=pathlib.Path(v['Mountpoint'])/'server.sock';subprocess.run(['/usr/bin/setfacl','-m','u:61001:rw',str(sock)],env=clean,check=True)
node='/home/clawy/.local/share/mise/installs/node/24.19.0';props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run /opt','InaccessiblePaths':'/mnt /var/lib /root -/etc/ssl/private -/etc/ssh','BindPaths':str(q)+':/work','BindReadOnlyPaths':node+':/opt/node '+str(sock)+':/run/planner.sock','MemoryMax':'400M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/work'}
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=61001','--regid=61001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/opt/node/bin:/usr/bin:/bin','HOME=/tmp','/opt/node/bin/node','/work/probe.mjs']
result=subprocess.run(cmd,env=clean,capture_output=True,text=True);(q/'launcher.log').write_text(result.stdout+result.stderr)
receipt={'exitCode':result.returncode,'runId':run,'image':state['image'],'mountVisibleRuntimeFiles':runtime['files'],'sourceFiles':source,'scriptSHA256':admission['scriptSHA256'],'proof':json.loads((q/'proof.json').read_text()) if (q/'proof.json').exists() else None,'sandbox':str(q)};(q/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'exitCode':result.returncode,'receipt':str(q/'receipt.json')}));raise SystemExit(result.returncode)
