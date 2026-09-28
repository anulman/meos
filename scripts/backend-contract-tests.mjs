// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createCommands} from '../backend/commands.mjs'
import {createHttpHandler} from '../backend/http-handler.mjs'
import {createMcpHandler} from '../backend/mcp.mjs'
import {scheduledInstant,localDay,interpretPreferredTime,interpretRecurrence} from '../backend/scheduling.mjs'
import {schemas,validateSchema,operations,inlineSchema} from '../backend/contract.mjs'
const blob=id=>Buffer.from(id.replaceAll('-',''),'hex'),notes={type:'doc'},id=()=>randomUUID()
const task=(extra={})=>({id:id(),title:'Synthetic',notes,completed:false,priority:'none',...extra})
const routine=(extra={})=>({id:id(),title:'Routine',notes,recurrenceIntent:{text:'every day',anchorDate:'2020-01-01'},timezone:'America/Toronto',...extra})
function fixture({now=Date.parse('2026-09-26T15:00:00Z'),upgrade=false}={}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT;')
 const owner=id(),other=id(),agent=id();for(const v of [owner,other,agent])db.prepare('INSERT INTO _user VALUES(?)').run(blob(v))
 db.exec(readFileSync(new URL('../backend/migrations/U1790380800__planner.sql',import.meta.url),'utf8'))
 db.exec(readFileSync(new URL('../backend/migrations/U1790380803__bridge.sql',import.meta.url),'utf8'))
 const begin=()=>{db.exec('BEGIN IMMEDIATE');return {query:(sql,p=[])=>db.prepare(sql).all(...p).map(Object.values),execute:(sql,p=[])=>Number(db.prepare(sql).run(...p).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}
 const migrate=()=>db.exec(readFileSync(new URL('../backend/migrations/U1790380805__scheduling_contract.sql',import.meta.url),'utf8'))
 if(!upgrade)migrate()
 const commands=createCommands({begin,now:()=>now})
 return {db,owner,other,agent,commands,migrate,clock:t=>now=t,close:()=>db.close(),invoke:(name,input)=>commands.invoke(owner,name,input)}
}
const schedule=(date='2026-09-26',time='09:00',timezone='America/Toronto')=>({date,time,timezone})
const key=()=>id()
const materialize=(f,r,through='2026-09-28')=>f.invoke('materialize_routine',{routineId:r.id,through,ids:Object.fromEntries(Array.from({length:15},(_,i)=>[new Date(Date.parse('2026-09-26T00:00Z')+i*86400000).toISOString().slice(0,10),id()])),idempotencyKey:key()})
test('trusted launcher denies production paths and host networking',async()=>{
 assert.equal(process.env.DATABASE_URL,undefined);assert.equal(process.env.HOME,undefined)
 assert.throws(()=>readFileSync('/home/clawy/.openclaw/openclaw.json'))
 assert.throws(()=>readFileSync('/var/run/docker.sock'))
 const {createConnection}=await import('node:net')
 await new Promise((resolve,reject)=>{const s=createConnection({host:'192.0.2.1',port:5432});s.on('connect',()=>{s.destroy();reject(Error('network accessible'))});s.on('error',()=>resolve());s.setTimeout(1000,()=>{s.destroy();reject(Error('network denial not immediate'))})})
})
test('migration preserves IDs, completion/history and immutable original recurrence slots',()=>{
 const f=fixture({upgrade:true});try{
  const r=routine();f.db.prepare('INSERT INTO routines(id,owner_id,doc,created_at,updated_at) VALUES(?,?,?,?,?)').run(blob(r.id),blob(f.owner),JSON.stringify(r),1,1)
  const occurrence={id:id(),routineId:r.id,date:'2026-08-01',completed:true}
  f.db.prepare('INSERT INTO occurrences(id,owner_id,doc,created_at,updated_at) VALUES(?,?,?,?,?)').run(blob(occurrence.id),blob(f.owner),JSON.stringify(occurrence),1,1)
  f.migrate();const result=f.commands.get(f.owner,'occurrences',occurrence.id)
  assert.equal(result.value.completed,true);assert.equal(result.value.date,occurrence.date);assert.equal(result.value.title,r.title);assert.equal(result.value.schedule,undefined);assert.equal(result.revision,2)
  assert.throws(()=>f.db.prepare("UPDATE occurrences SET doc=json_set(doc,'$.date','2026-08-02'),revision=revision+1").run(),/immutable occurrence/)
 }finally{f.close()}
})
test('occurrence edits survive template changes and repeated materialization without touching siblings',()=>{
 const f=fixture();try{
  const r=routine();f.commands.create(f.owner,'routines',r)
  const rows=materialize(f,r).items,a=rows[0],b=rows[1]
  const moved=f.invoke('move_occurrence',{id:a.value.id,expectedRevision:1,idempotencyKey:key(),schedule:schedule('2026-09-29','11:30'),title:'Independent',skipped:true})
  assert.equal(moved.value.date,'2026-09-26');assert.equal(moved.value.id,a.value.id)
  f.invoke('update_routine',{value:{...r,title:'New template',preferredTime:{text:'at 15:00'}},expectedRevision:1,idempotencyKey:key()})
  materialize(f,{...r,title:'New template'})
  assert.deepEqual(f.commands.get(f.owner,'occurrences',a.value.id),moved)
  assert.deepEqual(f.commands.get(f.owner,'occurrences',b.value.id),b)
  assert.equal(f.commands.list(f.owner,'occurrences').items.length,3)
  assert.throws(()=>f.commands.get(f.other,'occurrences',a.value.id),{code:'not_found'})
 }finally{f.close()}
})
test('rolling horizon enforced against actual local clock across generic, materialization and schedule APIs',()=>{
 const f=fixture({now:Date.parse('2026-09-27T01:00:00Z')});try{
  const r=routine({timezone:'America/Los_Angeles'});f.commands.create(f.owner,'routines',r)
  assert.equal(localDay(Date.parse('2026-09-27T01:00Z'),r.timezone),'2026-09-26')
  for(const through of ['2026-10-11','2027-01-01'])assert.throws(()=>materialize(f,r,through),{code:'validation'})
  const last={id:id(),routineId:r.id,date:'2026-10-10',completed:false};f.commands.create(f.owner,'occurrences',last)
  assert.throws(()=>f.commands.create(f.owner,'occurrences',{...last,id:id(),date:'2026-10-11'}),{code:'validation'})
  assert.throws(()=>f.invoke('move_occurrence',{id:last.id,expectedRevision:1,idempotencyKey:key(),schedule:schedule('2026-10-11','12:00',r.timezone)}),{code:'validation'})
  assert.throws(()=>f.invoke('apply_schedule',{changes:[{kind:'occurrences',id:last.id,expectedRevision:1,schedule:schedule('2026-10-11','12:00',r.timezone)}],idempotencyKey:key()}),{code:'validation'})
 }finally{f.close()}
})
test('DST nonexistent/fold times fail closed, explicit fold offsets resolve and zones define daily agenda',()=>{
 assert.throws(()=>scheduledInstant(schedule('2026-03-08','02:30')),{code:'validation'})
 assert.throws(()=>scheduledInstant(schedule('2026-11-01','01:30')),{code:'validation'})
 const early=scheduledInstant({...schedule('2026-11-01','01:30'),offsetMinutes:-240}),late=scheduledInstant({...schedule('2026-11-01','01:30'),offsetMinutes:-300})
 assert.equal(late-early,3600000)
 assert.throws(()=>scheduledInstant({...schedule(),offsetMinutes:0}),{code:'validation'})
 assert.throws(()=>scheduledInstant(schedule('2041-01-01')),{code:'validation'})
 const f=fixture();try{
  f.commands.create(f.owner,'tasks',task());f.commands.create(f.owner,'tasks',task({schedule:schedule('2026-09-27','00:30','UTC')}))
  assert.equal(f.invoke('list_agenda',{date:'2026-09-26',timezone:'America/Toronto'}).items.length,1)
  assert.equal(f.invoke('list_agenda',{date:'2026-09-27',timezone:'America/Toronto'}).items.length,0)
 }finally{f.close()}
})
test('language remains preference; contextual/ambiguous text cannot silently become assigned times',()=>{
 assert.equal(interpretPreferredTime('in the morning').interpretation.kind,'daypart')
 assert.equal(interpretPreferredTime('before lunch').status,'context_required')
 assert.equal(interpretPreferredTime('whenever is best').status,'ambiguous')
 const fixed=interpretRecurrence('every other monday','2026-09-28');assert.equal(fixed.intervalWeeks,2)
 const flex=interpretRecurrence('three times a week, preferably on weekdays','2026-09-26');assert.equal(flex.kind,'flexible');assert.equal(flex.frequency,3)
 const f=fixture();try{
  const r=routine({recurrenceIntent:{text:'three times a week, preferably on weekdays',anchorDate:'2026-09-26'},preferredTime:{text:'before lunch',status:'validated',interpretation:{kind:'clock',value:'12:00'}}})
  const saved=f.commands.create(f.owner,'routines',r);assert.equal(saved.value.preferredTime.status,'context_required')
  assert.deepEqual(materialize(f,r).items,[])
  assert.equal(f.commands.create(f.owner,'tasks',task({preferredTime:{text:'in the morning'}})).value.schedule,undefined)
 }finally{f.close()}
})
test('command retry conflicts, stale writers and atomic schedule/outbox rollback',()=>{
 const f=fixture();try{
  const a=task(),b=task(),input={value:a,idempotencyKey:key()}
  const first=f.invoke('create_task',input);assert.deepEqual(f.invoke('create_task',input),first)
  assert.throws(()=>f.invoke('create_task',{...input,value:{...a,title:'changed'}}),{code:'conflict'})
  f.commands.create(f.owner,'tasks',b)
  const before=f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n
  const changes=[a,b].map(t=>({kind:'tasks',id:t.id,expectedRevision:1,schedule:schedule()}))
  assert.equal(f.invoke('preview_schedule',{changes}).applied,false)
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n,before)
  f.commands.update(f.owner,'tasks',{...b,title:'Concurrent writer'},1)
  assert.throws(()=>f.invoke('apply_schedule',{changes,idempotencyKey:key()}),{code:'conflict'})
  assert.equal(f.commands.get(f.owner,'tasks',a.id).revision,1)
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n,before+1)
  changes[1].expectedRevision=2;const apply={changes,idempotencyKey:key()},result=f.invoke('apply_schedule',apply)
  assert.deepEqual(f.invoke('apply_schedule',apply),result)
  assert.equal(f.commands.get(f.owner,'tasks',a.id).revision,2)
  f.db.exec("CREATE TRIGGER inject_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT,'injected');END;")
  assert.throws(()=>f.invoke('create_task',{value:task(),idempotencyKey:key()}),/injected/)
  assert.equal(f.commands.list(f.owner,'tasks').items.length,2)
 }finally{f.close()}
})
test('stable external mapping and deletion tombstones prevent resurrection and preserve retry',()=>{
 const f=fixture();try{
  const a=task(),b=task();for(const t of [a,b])f.commands.create(f.owner,'tasks',t)
  const mapping={kind:'tasks',entityId:a.id,expectedRevision:1,provider:'google',calendarId:'synthetic',eventId:'event-1',remoteRevision:'etag-1',idempotencyKey:key()}
  f.invoke('bind_external_event',mapping)
  assert.throws(()=>f.invoke('bind_external_event',{...mapping,remoteRevision:'etag-2',idempotencyKey:key()}),{code:'conflict'})
  f.invoke('bind_external_event',{...mapping,remoteRevision:'etag-2',expectedRemoteRevision:'etag-1',idempotencyKey:key()})
  assert.throws(()=>f.invoke('bind_external_event',{...mapping,remoteRevision:'etag-3',expectedRemoteRevision:'etag-1',idempotencyKey:key()}),{code:'conflict'})
  assert.throws(()=>f.invoke('bind_external_event',{...mapping,entityId:b.id,idempotencyKey:key()}),{code:'conflict'})
  const deletion={id:a.id,expectedRevision:1,idempotencyKey:key()};f.invoke('delete_task',deletion);assert.deepEqual(f.invoke('delete_task',deletion),{deleted:true,id:a.id})
  assert.equal(f.db.prepare('SELECT deleted FROM external_events').get().deleted,1)
  assert.equal(f.db.prepare("SELECT count(*) n FROM sync_outbox WHERE operation='delete'").get().n,1)
  assert.throws(()=>f.invoke('create_task',{value:a,idempotencyKey:key()}),{code:'conflict'})
 }finally{f.close()}
})
test('MCP initialization/discovery/calls use identical domain, owner scopes and separate bearer identity',async()=>{
 const f=fixture();try{
  f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.agent),blob(f.owner),JSON.stringify(['agenda:read','tasks:write']),Date.parse('2027-01-01'))
  const origin='https://acceptance.invalid',headers={'Authorization':'Bearer synthetic-native-token','Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'}
  const handle=createMcpHandler({commands:f.commands,origin,readText:r=>r.text})
  const call=(message,opts={})=>handle({method:'POST',url:origin+'/api/meos/v1/mcp',headers:new Headers({...headers,...opts.headers}),text:JSON.stringify(message)},opts.user??{id:f.agent})
  let result=call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}});assert.equal((await result.json()).result.protocolVersion,'2025-11-25')
  assert.equal(call({jsonrpc:'2.0',method:'notifications/initialized'}).status,202)
  const discovered=(await call({jsonrpc:'2.0',id:2,method:'tools/list'}).json()).result.tools
  assert.deepEqual(discovered.map(x=>x.name),['list_calendar_events','list_agenda','create_task','delete_task'])
  assert.equal(discovered[2].inputSchema.properties.value.type,'object')
  const t=task({schedule:schedule()}),args={value:t,idempotencyKey:key()}
  result=await call({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'create_task',arguments:args}}).json();assert.equal(result.result.structuredContent.value.id,t.id)
  assert.equal(f.commands.list(f.owner,'tasks').items.length,1);assert.equal(f.commands.list(f.agent,'tasks').items.length,0)
  assert.equal(call({jsonrpc:'2.0',id:4,method:'tools/list'},{user:{id:f.other}}).status,200)
  assert.equal(call({jsonrpc:'2.0',id:4,method:'tools/list'},{headers:{Cookie:'auth_token=synthetic'}}).status,401)
  assert.equal(call({jsonrpc:'2.0',id:4,method:'tools/list'},{headers:{Origin:'https://evil.invalid'}}).status,403)
  assert.equal((await call({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'apply_schedule',arguments:{changes:[],idempotencyKey:key()}}}).json()).result.isError,true)
  const http=createHttpHandler({commands:f.commands,origin})
  assert.equal((await http(new Request(origin+'/api/meos/v1/resources/tasks'),{id:f.agent})).status,403)
  assert.throws(()=>f.db.prepare('UPDATE _meos_agent_grants SET owner_id=? WHERE agent_id=?').run(blob(f.other),blob(f.agent)),/immutable agent owner/)
  assert.throws(()=>f.db.prepare('DELETE FROM _meos_agent_grants').run(),/binding is permanent/)
  f.clock(Date.parse('2027-01-02'));assert.equal(call({jsonrpc:'2.0',id:5,method:'tools/list'}).status,403);f.clock(Date.parse('2026-09-26T15:00Z'))
  f.db.prepare('UPDATE _meos_agent_grants SET revoked=1 WHERE agent_id=?').run(blob(f.agent));assert.equal(call({jsonrpc:'2.0',id:5,method:'tools/list'}).status,403)
 }finally{f.close()}
})
test('generated OpenAPI/client have no drift and schemas reject owner injection',()=>{
 const result=spawnSync(process.execPath,[new URL('./generate-contract.mjs',import.meta.url).pathname,'--check'],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8'});assert.equal(result.status,0,result.stderr)
 const spec=JSON.parse(readFileSync(new URL('../docs/openapi.json',import.meta.url)))
 assert.equal(spec.openapi,'3.1.0');for(const name of Object.keys(operations))assert.ok(spec.paths['/api/meos/v1/operations/'+name])
 assert.throws(()=>validateSchema(operations.create_task.input,{value:task(),idempotencyKey:key(),ownerId:id()}),{code:'validation'})
})
test('two actual SQLite writers serialize and exactly one revision wins',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{Worker}=await import('node:worker_threads')
 const dir=mkdtempSync(join(tmpdir(),'meos-concurrency-')),path=join(dir,'disposable.db'),owner=id(),t=task()
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT;');db.prepare('INSERT INTO _user VALUES(?)').run(blob(owner))
 for(const filename of ['U1790380800__planner.sql','U1790380805__scheduling_contract.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+filename,import.meta.url),'utf8'))
 db.prepare('INSERT INTO tasks(id,owner_id,doc,created_at,updated_at) VALUES(?,?,?,?,?)').run(blob(t.id),blob(owner),JSON.stringify(t),1,1);db.close()
 const worker=`const {parentPort,workerData:d}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');(async()=>{const {createCommands}=await import(d.module);const db=new DatabaseSync(d.path);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=3000');const commands=createCommands({begin:()=>{db.exec('BEGIN IMMEDIATE');return {query:(s,p)=>db.prepare(s).all(...p).map(Object.values),execute:(s,p)=>Number(db.prepare(s).run(...p).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}});try{const r=commands.invoke(d.owner,'apply_schedule',{changes:[{kind:'tasks',id:d.task,expectedRevision:1,schedule:{date:'2026-09-26',time:'09:00',timezone:'UTC'}}],idempotencyKey:d.key});parentPort.postMessage({revision:r.items[0].revision})}catch(e){parentPort.postMessage({code:e.code})}finally{db.close()}})()`
 try{
  const run=()=>new Promise((resolve,reject)=>{const w=new Worker(worker,{eval:true,workerData:{path,owner,task:t.id,key:key(),module:new URL('../backend/commands.mjs',import.meta.url).href}});w.on('message',resolve);w.on('error',reject)})
  const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r.revision===2).length,1);assert.equal(results.filter(r=>r.code==='conflict').length,1)
  const verify=new DatabaseSync(path);assert.equal(verify.prepare('SELECT count(*) n FROM command_receipts').get().n,1);assert.equal(verify.prepare('SELECT count(*) n FROM sync_outbox').get().n,2);verify.close()
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('Calendar sync scope reads owner outbox/current tombstones and applies only revision-checked Calendar fields',()=>{const f=fixture();try{const a=task({schedule:schedule(),durationMinutes:120,location:'Office',durationIntent:'A long working block',actualDurationMinutes:95,notes:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'rich',marks:[{type:'strong'}]}]}]}});f.commands.create(f.owner,'tasks',a);f.commands.create(f.other,'tasks',task());const page=f.invoke('calendar_changes',{cursor:0});assert.equal(page.items.length,1);assert.equal(page.items[0].id,a.id);assert.equal(f.invoke('calendar_current',{kind:'tasks',id:a.id}).revision,1);const result=f.invoke('calendar_apply',{kind:'tasks',id:a.id,expectedRevision:1,schedule:schedule('2026-09-27'),title:'Google title',location:'New office',idempotencyKey:key()});assert.equal(result.value.durationIntent,a.durationIntent);assert.equal(result.value.actualDurationMinutes,95);assert.deepEqual(result.value.notes,a.notes);assert.equal(result.value.completed,false);assert.throws(()=>f.invoke('calendar_apply',{kind:'tasks',id:a.id,expectedRevision:1,schedule:null,idempotencyKey:key()}),e=>e.code==='conflict');assert.throws(()=>f.invoke('calendar_apply',{kind:'tasks',id:a.id,expectedRevision:2,schedule:null,completed:true,idempotencyKey:key()}),e=>e.code==='validation');f.invoke('delete_task',{id:a.id,expectedRevision:2,idempotencyKey:key()});assert.deepEqual(f.invoke('calendar_current',{kind:'tasks',id:a.id}),{record:null,deleted:true,revision:3});assert.throws(()=>f.commands.invoke(f.other,'calendar_current',{kind:'tasks',id:a.id}),e=>e.code==='not_found')}finally{f.close()}});
test('Calendar materialization snapshots location and duration intent without changing siblings',()=>{const f=fixture();try{const r=routine({location:'Studio',durationIntent:'At least two hours'});f.commands.create(f.owner,'routines',r);const rows=materialize(f,r).items;assert.equal(rows[0].value.location,'Studio');assert.equal(rows[0].value.durationIntent,r.durationIntent);assert.equal(rows[0].value.durationMinutes,undefined);assert.equal(rows[0].value.schedule,undefined);f.invoke('calendar_apply',{kind:'occurrences',id:rows[0].value.id,expectedRevision:1,schedule:schedule('2026-09-27','15:00'),location:'Remote',durationMinutes:135,idempotencyKey:key()});assert.equal(f.commands.get(f.owner,'occurrences',rows[1].value.id).value.location,'Studio');assert.equal(f.commands.get(f.owner,'routines',r.id).value.location,'Studio')}finally{f.close()}});
test('dedicated Calendar sync grant cannot create arbitrary tasks or access browser APIs',async()=>{const f=fixture();try{f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.agent),blob(f.owner),JSON.stringify(['sync:read','sync:write']),Date.parse('2027-01-01'));const origin='https://acceptance.invalid',headers=new Headers({Authorization:'Bearer synthetic','Content-Type':'application/json',Accept:'application/json, text/event-stream'});const handle=createMcpHandler({commands:f.commands,origin,readText:r=>r.text});const call=msg=>handle({method:'POST',url:origin+'/api/meos/v1/mcp',headers,text:JSON.stringify({jsonrpc:'2.0',id:1,...msg})},{id:f.agent});const names=(await call({method:'tools/list'}).json()).result.tools.map(t=>t.name);assert(names.includes('calendar_apply'));assert(!names.includes('create_task'));assert.equal((await call({method:'tools/call',params:{name:'create_task',arguments:{value:task(),idempotencyKey:key()}}}).json()).result.isError,true);assert.equal((await createHttpHandler({commands:f.commands,origin})(new Request(origin+'/api/meos/v1/resources/tasks'),{id:f.agent})).status,403)}finally{f.close()}});

test('delegated owner MCP has freshness/receipts without service grants and cannot impersonate another owner',async()=>{
 const f=fixture();try{
  const origin='https://acceptance.invalid',handle=createMcpHandler({commands:f.commands,origin,readText:r=>r.text})
  const call=(user,method,args)=>handle({method:'POST',url:origin+'/api/meos/v1/mcp',headers:new Headers({Authorization:'Bearer synthetic','Content-Type':'application/json',Accept:'application/json, text/event-stream'}),text:JSON.stringify({jsonrpc:'2.0',id:1,method,...args})},{id:user})
  const tools=(await call(f.owner,'tools/list').json()).result.tools.map(t=>t.name)
  assert(tools.includes('get_current'));assert(tools.includes('get_command_receipt'));assert(!tools.includes('calendar_apply'))
  const t=task(),k=key();f.invoke('create_task',{value:t,idempotencyKey:k})
  assert.equal(f.invoke('get_current',{kind:'tasks',id:t.id}).revision,1)
  const receipt=f.invoke('get_command_receipt',{key:k});assert.equal(receipt.found,true);assert.equal(receipt.result.value.id,t.id)
  assert.deepEqual(f.commands.invoke(f.other,'get_command_receipt',{key:k}),{found:false})
  assert.throws(()=>f.commands.invoke(f.other,'get_current',{kind:'tasks',id:t.id}),{code:'not_found'})
  f.invoke('delete_task',{id:t.id,expectedRevision:1,idempotencyKey:key()});assert.equal(f.invoke('get_current',{kind:'tasks',id:t.id}).deleted,true)
  f.db.prepare('INSERT INTO _meos_bridge_binding VALUES(?,?)').run(blob(f.agent),blob(f.owner));assert.equal(call(f.agent,'tools/list').status,403)
  assert.equal(f.db.prepare('SELECT count(*) n FROM _meos_agent_grants').get().n,0)
 }finally{f.close()}
})

test('freshness uses pinned scheduling rules for both DST offsets and case-insensitive timezone names',()=>{
 const f=fixture();try{for(const offsetMinutes of [-240,-300]){
  const value=task({schedule:{date:'2026-11-01',time:'01:30',timezone:'america/montreal',offsetMinutes},durationMinutes:30})
  f.invoke('create_task',{value,idempotencyKey:key()})
  const current=f.invoke('get_current',{kind:'tasks',id:value.id})
  assert.equal(Date.parse(current.scheduledAt),scheduledInstant(value.schedule))
  assert.equal(current.scheduledAt,offsetMinutes===-240?'2026-11-01T05:30:00.000Z':'2026-11-01T06:30:00.000Z')
 }}finally{f.close()}
})

test('explicit batch planning is atomic, revision checked, owner scoped and replayable',()=>{
 const f=fixture();try{
  const a=routine(),b=routine();f.commands.create(f.owner,'routines',a);f.commands.create(f.owner,'routines',b)
  const select=r=>({routineId:r.id,expectedRevision:1,period:{start:'2026-09-26',end:'2026-09-28'},ids:Object.fromEntries(['2026-09-26','2026-09-27','2026-09-28'].map(day=>[day,id()]))})
  const input={routines:[select(a),select(b)],idempotencyKey:key()}
  assert.throws(()=>f.invoke('plan_routines',{...input,routines:[input.routines[0],{...input.routines[1],expectedRevision:2}]}),{code:'conflict'})
  assert.equal(f.commands.list(f.owner,'occurrences').items.length,0)
  const result=f.invoke('plan_routines',input);assert.deepEqual(result,{routines:2,created:6,preserved:0})
  const original=f.commands.list(f.owner,'occurrences').items[0]
  f.invoke('move_occurrence',{id:original.value.id,expectedRevision:original.revision,schedule:null,skipped:true,title:'Edited',idempotencyKey:key()})
  f.clock(Date.parse('2026-09-29T15:00Z'))
  assert.deepEqual(f.invoke('plan_routines',input),result,'receipt replay precedes current-day validation')
  assert.equal(f.commands.list(f.owner,'occurrences').items.length,6)
  assert.equal(f.commands.get(f.owner,'occurrences',original.value.id).value.title,'Edited')
  f.clock(Date.parse('2026-09-26T15:00Z'))
  assert.deepEqual(f.invoke('plan_routines',{...input,idempotencyKey:key()}),{routines:2,created:0,preserved:6})
  assert.equal(f.commands.get(f.owner,'occurrences',original.value.id).value.skipped,true)
  assert.throws(()=>f.commands.invoke(f.other,'plan_routines',{...input,idempotencyKey:key()}),{code:'not_found'})
  assert.throws(()=>f.invoke('plan_routines',{...input,routines:[input.routines[0],input.routines[0]],idempotencyKey:key()}),{code:'validation'})
  assert.throws(()=>f.invoke('plan_routines',{...input,routines:[{...input.routines[0],period:{start:'2026-09-25',end:'2026-09-28'}}],idempotencyKey:key()}),{code:'validation'})
  assert.throws(()=>f.invoke('plan_routines',{...input,routines:[{...input.routines[0],ids:{}}],idempotencyKey:key()}),{code:'validation'})
  assert.throws(()=>f.invoke('plan_routines',{...input,routines:[{...input.routines[0],period:{start:'2026-09-26',end:'2026-10-11'}}],idempotencyKey:key()}),{code:'validation'})
  assert.equal(operations.calendar_materialize,undefined,'sync credentials cannot generate routines')
 }finally{f.close()}
})
test('bootstrap and revisions are pure owner reads and reflect deletes/preferences',async()=>{
 const f=fixture();try{
  const prefs={timezone:'America/Toronto',weekStartsOn:1,weather:{enabled:false,source:'latest',units:'celsius'}}
  f.commands.savePreferences(f.owner,prefs,0)
  const row=f.commands.create(f.owner,'tasks',task())
  const before=f.db.prepare('SELECT total_changes() AS n').get().n
  const boot=f.commands.bootstrap(f.owner);validateSchema(schemas.Bootstrap,{...boot,user:{id:f.owner},csrf:'synthetic'})
  assert.equal(boot.preferences.value.timezone,prefs.timezone);assert.ok(boot.revisions.tasks>0)
  assert.deepEqual(f.commands.revisions(f.owner),boot.revisions)
  assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,before)
  f.invoke('delete_task',{id:row.value.id,expectedRevision:row.revision,idempotencyKey:key()})
  assert.ok(f.commands.revisions(f.owner).tasks>boot.revisions.tasks)
  assert.equal(f.commands.revisions(f.other).tasks,0)
  const handle=createHttpHandler({commands:f.commands,origin:'https://acceptance.invalid'})
  assert.equal((await handle(new Request('https://acceptance.invalid/api/meos/v1/bootstrap'),null)).status,401)
  const response=await handle(new Request('https://acceptance.invalid/api/meos/v1/bootstrap'),{id:f.owner,csrf:'synthetic'})
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).user.id,f.owner)
 }finally{f.close()}
})

test('MCP routine creation reuses domain validation, owner scope and retry receipts without planning',async()=>{
 const f=fixture();try{
  f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.agent),blob(f.owner),JSON.stringify(['routines:write']),Date.parse('2027-01-01'))
  const origin='https://acceptance.invalid',handle=createMcpHandler({commands:f.commands,origin,readText:r=>r.text})
  const call=async(method,params,user=f.agent)=>(await handle({method:'POST',headers:new Headers({Authorization:'Bearer synthetic','Content-Type':'application/json',Accept:'application/json, text/event-stream'}),text:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},{id:user}).json())
  const invoke=async args=>(await call('tools/call',{name:'create_routine',arguments:args})).result
  const tools=(await call('tools/list')).result.tools
  assert.deepEqual(tools.map(t=>t.name),['create_routine','update_routine'])
  assert.equal(tools[0].annotations.readOnlyHint,false);assert.equal(tools[0].annotations.idempotentHint,true)
  assert.equal(tools[0].inputSchema.properties.value.type,'object')
  const value=routine({title:'  Walk  ',recurrenceIntent:{text:'every friday, monday',anchorDate:'2020-01-01'},preferredTime:{text:'before lunch'}});delete value.time
  const input={value,idempotencyKey:key()},result=await invoke(input)
  assert.equal(result.isError,undefined)
  const saved=result.structuredContent;validateSchema(schemas.RoutineEnvelope,saved)
  assert.equal(saved.revision,1);assert.equal(saved.value.title,'Walk');assert.deepEqual(saved.value.recurrenceIntent.weekdays,[1,5])
  assert.equal(saved.value.time,undefined);assert.equal(saved.value.preferredTime.status,'context_required')
  assert.deepEqual(f.commands.get(f.owner,'routines',value.id),saved)
  assert.equal(f.commands.list(f.agent,'routines').items.length,0);assert.equal(f.commands.list(f.other,'routines').items.length,0)
  assert.equal(f.commands.list(f.owner,'occurrences').items.length,0)
  const replay=await invoke(input);assert.deepEqual(replay.structuredContent,saved)
  assert.deepEqual(JSON.parse(replay.content[0].text),saved)
  assert.equal(f.db.prepare('SELECT count(*) n FROM command_receipts').get().n,1)
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n,1)
  const error=async(args,code)=>{const r=await invoke(args);assert.equal(r.isError,true);assert.equal(JSON.parse(r.content[0].text).error.code,code)}
  await error({...input,value:{...value,title:'Changed'}},'conflict')
  for(const invalid of [{recurrenceIntent:{text:'',anchorDate:'2020-01-01'}},{recurrenceIntent:{text:'every day',anchorDate:'bad'}},{weekdays:[1]},{durationMinutes:30},{actualDurationMinutes:30},{timezone:'Not/A_Zone'},{time:'25:00'},{title:' '},{ownerId:f.other},{notes:{type:'doc',content:[{type:'image'}]}}]){
   await error({value:routine(invalid),idempotencyKey:key()},'validation')
  }
  await error({value:routine(),idempotencyKey:key(),ownerId:f.other},'validation')
  const foreign=routine();f.commands.create(f.other,'routines',foreign)
  await error({value:foreign,idempotencyKey:key()},'conflict')
  assert.equal(f.commands.list(f.owner,'routines').items.length,1)
  assert.equal(f.db.prepare('SELECT count(*) n FROM command_receipts').get().n,1)
  f.db.prepare('UPDATE _meos_agent_grants SET scopes=? WHERE agent_id=?').run(JSON.stringify(['agenda:read']),blob(f.agent))
  assert.equal((await call('tools/list')).result.tools.some(t=>t.name==='create_routine'),false)
  assert.equal((await invoke({value:routine(),idempotencyKey:key()})).isError,true)
  assert.equal(f.commands.list(f.owner,'routines').items.length,1)
  const ownerInput={value:routine(),idempotencyKey:key()}
  assert.equal((await call('tools/call',{name:'create_routine',arguments:ownerInput},f.owner)).result.structuredContent.value.id,ownerInput.value.id)
 }finally{f.close()}
})


test('explicit commute classification preserves project and schedule, without classifying titles',()=>{
 const f=fixture();try{
  const project=f.commands.create(f.owner,'projects',{id:id(),title:'Band',notes});
  const schedule={date:'2026-09-28',time:'17:00',timezone:'America/Toronto'};
  const value=task({type:'commute',projectId:project.value.id,schedule,durationMinutes:30});
  const saved=f.commands.create(f.owner,'tasks',value);assert.deepEqual(saved.value,value);
  assert.throws(()=>f.commands.create(f.owner,'tasks',task({type:'routine'})),/Schema/);
  assert.throws(()=>f.commands.create(f.owner,'tasks',task({type:'commute',projectId:id()})),/Record not found/);
  const ordinary=f.commands.create(f.owner,'tasks',task({title:'Travel research'}));assert.equal(ordinary.value.type,undefined);
  const {type,...rest}=saved.value;const cleared=f.commands.update(f.owner,'tasks',rest,saved.revision);
  assert.equal(cleared.value.type,undefined);assert.deepEqual(cleared.value.schedule,schedule);assert.equal(cleared.value.projectId,project.value.id);
 }finally{f.close()}
});
