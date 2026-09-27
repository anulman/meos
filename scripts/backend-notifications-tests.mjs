// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import http from 'node:http'
import {GuestHeaders} from '../backend/guest/platform.mjs'
import {createNotifications,createNotificationGuestHandler} from '../backend/notifications.mjs'
import {createNotificationHost,notificationNodeHandler} from '../backend/notification-host.mjs'
import {createCommands} from '../backend/commands.mjs'
const blob=id=>Buffer.from(id.replaceAll('-',''),'hex'),consumer='a'.repeat(32),otherConsumer='b'.repeat(32),origin='https://meos.invalid'
function fixture(){
 const directory=mkdtempSync(tmpdir()+'/meos-notification-'),file=directory+'/db',owner=randomUUID(),agent=randomUUID(),other=randomUUID();let time=Date.parse('2026-09-26T12:00:00Z'),db
 function open(){db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON')}
 open();db.exec('CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT');for(const id of [owner,agent,other])db.prepare('INSERT INTO _user VALUES(?)').run(blob(id))
 for(const name of ['U1790380800__planner.sql','U1790380803__bridge.sql','U1790380805__scheduling_contract.sql','U1790380806__notifications.sql','U1790380807__delegated_notifications.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+name,import.meta.url),'utf8'))
 db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(agent),blob(owner),'["notifications:consume"]',time+30*86400000)
 const port={now:()=>time,begin(){db.exec('BEGIN IMMEDIATE');return {query:(s,p)=>db.prepare(s).all(...p).map(Object.values),execute:(s,p)=>db.prepare(s).run(...p).changes,commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}}
 const notifications=createNotifications(port),commands=createCommands(port)
 return {file,owner,agent,other,commands,notifications,get db(){return db},get time(){return time},set time(v){time=v},poll:(extra={})=>notifications.invoke(agent,{op:'poll',consumer,...extra}),ack:token=>notifications.invoke(agent,{op:'ack',consumer,ackToken:token}),reopen(){db.close();open()},close(){db.close();rmSync(directory,{recursive:true})}}
}
const task=(time,extra={})=>({id:randomUUID(),title:'Synthetic $(touch /tmp/pwn); `id`',notes:{type:'doc'},priority:'none',completed:false,durationMinutes:30,schedule:{date:new Date(time).toISOString().slice(0,10),time:new Date(time).toISOString().slice(11,16),timezone:'UTC'},...extra})
const request=(body={},signal)=>new Request(origin+'/api/meos/agent/poll',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({consumer,...body}),signal})
test('durable on-disk replay, exact scoped tokens and idempotent ack',()=>{const f=fixture();try{f.commands.create(f.owner,'tasks',task(f.time+60000));assert.equal(f.poll().items.length,0);f.time+=60000;const p=f.poll();assert.equal(p.items[0].starts.length,1);f.reopen();assert.deepEqual(f.poll(),p);assert.throws(()=>f.ack('f'.repeat(64)),{code:'conflict'});f.ack(p.ackToken);assert.deepEqual(f.ack(p.ackToken),{acked:true});f.reopen();assert.equal(f.poll().items.length,0)}finally{f.close()}})
test('shared start/end cancellation rebuild retains unaffected due members',()=>{const f=fixture();try{const a=task(f.time+60000),b=task(f.time+31*60000);f.commands.create(f.owner,'tasks',a);f.commands.create(f.owner,'tasks',b);f.poll();f.time+=31*60000;const boundary=f.poll().items.find(v=>v.at===f.time);assert.equal(boundary.starts.length,1);assert.equal(boundary.ends.length,1);f.time+=1000;f.commands.update(f.owner,'tasks',{...b,archived:true},1);const next=f.poll();assert(!next.items.some(v=>v.id===boundary.id));assert(next.items.some(v=>v.ends.some(x=>x.id===a.id)));assert(!next.items.some(v=>v.starts.some(x=>x.id===b.id)))}finally{f.close()}})
test('lease takeover fences old ack; revocation and retention survive reopen',()=>{const f=fixture();try{f.commands.create(f.owner,'tasks',task(f.time+60000));f.poll();f.time+=60000;const p=f.poll();assert.throws(()=>f.poll({consumer:otherConsumer}),{code:'conflict'});f.time+=120001;const next=f.poll({consumer:otherConsumer});assert.equal(next.fence,p.fence+1);assert.equal(next.items[0].id,p.items[0].id);assert.throws(()=>f.ack(p.ackToken),{code:'conflict'});f.db.prepare('UPDATE _meos_agent_grants SET revoked=1 WHERE agent_id=?').run(blob(f.agent));assert.throws(()=>f.poll({consumer:otherConsumer}),{code:'forbidden'});f.db.prepare('UPDATE _meos_agent_grants SET revoked=0 WHERE agent_id=?').run(blob(f.agent));f.time+=8*86400000;assert(f.poll().retentionGap);f.reopen();assert(f.poll().retentionGap);f.notifications.invoke(f.agent,{op:'reconcile',consumer});assert.equal(f.poll().retentionGap,false)}finally{f.close()}})
test('explicit empty offsets, per-instance override, history and seven-day horizon',()=>{const f=fixture();try{f.notifications.invoke(f.agent,{op:'configure',consumer,preferences:{preMinutes:[]}});const a=task(f.time+15*60000);f.commands.create(f.owner,'tasks',a);f.commands.create(f.owner,'tasks',task(f.time-86400000));f.commands.create(f.owner,'tasks',task(f.time+8*86400000));assert.equal(f.poll().items.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_events').get().n,2);f.notifications.invoke(f.agent,{op:'configure',consumer,preferences:{preMinutes:[],instances:{[a.id]:[15]}}});assert.equal(f.poll().items[0].type,'pre');assert.throws(()=>f.notifications.invoke(f.agent,{op:'configure',consumer,preferences:{preMinutes:null}}),{code:'validation'})}finally{f.close()}})
test('failed acknowledgement rolls back event and token atomically',()=>{const f=fixture();try{f.commands.create(f.owner,'tasks',task(f.time));const p=f.poll();f.db.exec("CREATE TRIGGER fail_ack BEFORE UPDATE OF acked ON notification_batches BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");assert.throws(()=>f.ack(p.ackToken));assert.equal(f.poll().items[0].id,p.items[0].id)}finally{f.close()}})
test('native guest header surface; anonymous, owner spoof and cookies rejected',()=>{const f=fixture();try{const guest=createNotificationGuestHandler({notifications:f.notifications,origin,readText:r=>r.body}),r={method:'POST',headers:new GuestHeaders({Authorization:'Bearer synthetic'}),body:JSON.stringify({op:'poll',consumer})};assert.equal(guest(r,{id:f.agent}).status,200);assert.equal(guest(r,null).status,401);assert.equal(guest(r,{id:f.owner}).status,200);assert.equal(guest({...r,body:JSON.stringify({op:'poll',consumer,owner:f.owner})},{id:f.agent}).status,400);assert.equal(guest({...r,headers:new GuestHeaders({Authorization:'Bearer synthetic',Cookie:'a=b'})},{id:f.agent}).status,401)}finally{f.close()}})
test('HTTP abort releases wait; denied grant never returns data',async()=>{let calls=0;const host=createNotificationHost({origin,upstream:async()=>{calls++;return Response.json({items:[],ackToken:null,retryAfterMs:1000})}}),controller=new AbortController(),pending=host(request({},controller.signal));setTimeout(()=>controller.abort(),20);await assert.rejects(pending);assert.equal(calls,1);const denied=createNotificationHost({origin,upstream:async()=>new Response(null,{status:403})});assert.equal((await denied(request())).status,403)})
test('real socket disconnect stops underlying wait',async()=>{let calls=0;const host=createNotificationHost({origin,upstream:async()=>{calls++;return Response.json({items:[],ackToken:null,retryAfterMs:1000})}}),server=http.createServer(notificationNodeHandler({origin,handle:host}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await new Promise(resolve=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/meos/agent/poll',method:'POST',headers:{Host:'meos.invalid',Authorization:'Bearer synthetic','Content-Type':'application/json'}},()=>{});req.on('error',()=>resolve());req.end(JSON.stringify({consumer}));setTimeout(()=>req.destroy(),30)});const count=calls;await new Promise(r=>setTimeout(r,50));assert.equal(calls,count)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}})
test('SIGKILL rolls back uncommitted ack; persisted event replays',()=>{const f=fixture();try{f.commands.create(f.owner,'tasks',task(f.time));const p=f.poll(),script="const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE; UPDATE notification_events SET acked=1');process.kill(process.pid,'SIGKILL')";const child=spawnSync(process.execPath,['-e',script,f.file],{env:{PATH:'/usr/bin:/bin'}});assert.equal(child.signal,'SIGKILL');f.reopen();assert.equal(f.poll().items[0].id,p.items[0].id)}finally{f.close()}})
test('empty bounded wait returns success rather than timeout',async()=>{let calls=0;const host=createNotificationHost({origin,upstream:async()=>{calls++;return Response.json({items:[],ackToken:null,retryAfterMs:1000})}}),start=performance.now(),result=await host(request({waitMs:30}));assert.equal(result.status,200);assert.deepEqual((await result.json()).items,[]);assert(performance.now()-start>=25);assert(calls<=2)})
test('same-owner second agent cannot ack original token; revoked ack fails',()=>{const f=fixture();try{f.commands.create(f.owner,'tasks',task(f.time));const first=f.poll();f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.other),blob(f.owner),'["notifications:consume"]',f.time+86400000);f.notifications.invoke(f.other,{op:'poll',consumer});assert.throws(()=>f.notifications.invoke(f.other,{op:'ack',consumer,ackToken:first.ackToken}),{code:'conflict'});f.db.prepare('UPDATE _meos_agent_grants SET revoked=1 WHERE agent_id=?').run(blob(f.agent));assert.throws(()=>f.ack(first.ackToken),{code:'forbidden'})}finally{f.close()}})

test('completion does not cancel scheduled start/end machine signals',()=>{const f=fixture();try{const value=task(f.time+60000,{completed:true});f.commands.create(f.owner,'tasks',value);f.poll();f.time+=60000;const start=f.poll();assert.equal(start.items[0].starts[0].completed,true);f.ack(start.ackToken);f.time+=30*60000;assert.equal(f.poll().items[0].ends[0].id,value.id)}finally{f.close()}})
test('archived template does not cancel independently scheduled materialized instance',()=>{const f=fixture();try{const routine={id:randomUUID(),title:'Template',notes:{type:'doc'},weekdays:[6],timezone:'UTC',durationMinutes:30};f.commands.create(f.owner,'routines',routine);const occurrence={id:randomUUID(),routineId:routine.id,date:'2026-09-26',completed:false,schedule:task(f.time+60000).schedule};f.commands.create(f.owner,'occurrences',occurrence);f.poll();f.commands.update(f.owner,'routines',{...routine,archived:true},1);f.time+=60000;assert(f.poll().items.some(v=>v.starts.some(x=>x.id===occurrence.id)))}finally{f.close()}})

test('delegated owner notification lease needs no extra identity; service and bridge boundaries retained',()=>{
 const f=fixture();try{
  const userCount=f.db.prepare('SELECT count(*) n FROM _user').get().n
  f.commands.create(f.owner,'tasks',task(f.time));const p=f.notifications.invoke(f.owner,{op:'poll',consumer})
  assert.equal(p.items.length,1);f.notifications.invoke(f.owner,{op:'ack',consumer,ackToken:p.ackToken})
  assert.equal(f.notifications.invoke(f.other,{op:'poll',consumer}).items.length,0)
  f.db.prepare('UPDATE _meos_agent_grants SET revoked=1 WHERE agent_id=?').run(blob(f.agent));assert.throws(()=>f.poll(),{code:'forbidden'})
  f.db.prepare('INSERT INTO _meos_bridge_binding VALUES(?,?)').run(blob(f.other),blob(f.owner));assert.throws(()=>f.notifications.invoke(f.other,{op:'poll',consumer}),{code:'forbidden'})
  assert.equal(f.db.prepare('SELECT count(*) n FROM _user').get().n,userCount)
  assert.equal(f.db.prepare('SELECT count(*) n FROM _meos_agent_grants').get().n,1)
 }finally{f.close()}
})

test('forward migration preserves existing leases, event IDs, ack tokens and indexes',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT');const owner=randomUUID(),agent=randomUUID();for(const id of [owner,agent])db.prepare('INSERT INTO _user VALUES(?)').run(blob(id))
  for(const name of ['U1790380800__planner.sql','U1790380805__scheduling_contract.sql','U1790380806__notifications.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+name,import.meta.url),'utf8'))
  db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(agent),blob(owner),'["notifications:consume"]',12345)
  db.prepare('INSERT INTO notification_consumers VALUES(?,?,?,?,?,?,?)').run(blob(agent),consumer,7,999,500,'{}',1)
  db.prepare('INSERT INTO notification_events VALUES(?,?,?,?,?,?,?)').run(blob(agent),'event','bucket',501,'{}',1,0)
  db.prepare('INSERT INTO notification_batches VALUES(?,?,?,?,?,?)').run('token',blob(agent),7,'["event"]',0,501)
  const tables=['notification_consumers','notification_events','notification_batches'],before=tables.map(t=>db.prepare('SELECT * FROM '+t).all())
  db.exec('BEGIN');db.exec(readFileSync(new URL('../backend/migrations/U1790380807__delegated_notifications.sql',import.meta.url),'utf8'));db.exec('COMMIT')
  assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  for(const t of tables)assert.equal(db.prepare('PRAGMA foreign_key_list('+t+')').get().table,'_user')
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND name IN ('notification_due','notification_batch_agent')").get().n,2)
 }finally{db.close()}
})
