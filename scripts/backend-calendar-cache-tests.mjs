// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createCommands} from '../backend/commands.mjs';
import {createMcpHandler} from '../backend/mcp.mjs';
import {createHttpHandler} from '../backend/http-handler.mjs';
import {schemas,validateSchema} from '../backend/contract.mjs';
import {createCalendarMirror} from '../backend/calendar-mirror.mjs';
const blob=id=>Buffer.from(id.replaceAll('-',''),'hex');
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT');
 const owner=randomUUID(),other=randomUUID(),agent=randomUUID();for(const id of [owner,other,agent])db.prepare('INSERT INTO _user VALUES(?)').run(blob(id));
 for(const name of ['U1790380800__planner.sql','U1790380803__bridge.sql','U1790380805__scheduling_contract.sql','U1790380811__calendar_cache.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+name,import.meta.url),'utf8'));
 let time=Date.parse('2026-09-27T16:00Z');const commands=createCommands({now:()=>time,begin(){db.exec('BEGIN IMMEDIATE');return {query:(s,p)=>db.prepare(s).all(...p).map(Object.values),execute:(s,p)=>Number(db.prepare(s).run(...p).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}});
 const publish=input=>commands.invoke(owner,'calendar_cache_publish',JSON.parse(JSON.stringify(input))),read=()=>commands.calendarCache(owner);
 return {db,owner,other,agent,commands,publish,read,now:()=>time,setTime:v=>time=v};
}
const event=(id,extra={})=>({id,role:'primary',etag:'etag',summary:id,location:'Studio',description:'Bring notes',start:{dateTime:'2026-09-27T10:00:00-04:00'},end:{dateTime:'2026-09-27T11:00:00-04:00'},linked:false,recurring:false,...extra});
const metadata={available:true,state:'connected',syncActive:true,lastSyncAt:Date.parse('2026-09-27T16:00Z'),plannerLastSyncAt:null,windowStart:'2026-08-26T16:00:00Z',windowEnd:'2026-11-30T16:00:00Z'};
const page=(sequence,items,extra={})=>({sequence,generation:'generation-a',page:0,pages:1,items,drafts:[],conflicts:[],metadata,...extra});
test('atomic complete cache, owner separation, partial failure retains old records, deletion/replacement and exact replay',t=>{
 const f=fixture(t);assert.equal(f.read().status,'unavailable');
 const first=page(1,[event('old')]);assert.equal(f.publish(first).committed,true);assert.deepEqual(f.publish(first),{sequence:1,committed:true});assert.equal(f.read().status,'fresh');
 assert.deepEqual(f.commands.calendarCache(f.other).items,[]);
 const start=page(2,[event('new')],{pages:2});assert.equal(f.publish(start).committed,false);assert.equal(f.read().items[0].id,'old');
 assert.throws(()=>f.publish(page(2,[],{page:1,pages:2,generation:'other',metadata:undefined})),{code:'conflict'});assert.equal(f.read().items[0].id,'old');
 assert.equal(f.publish(page(2,[],{page:1,pages:2,metadata:undefined})).committed,true);assert.equal(f.read().items[0].id,'new');
 assert.throws(()=>f.publish(first),{code:'conflict'});
 f.publish(page(3,[]));assert.deepEqual(f.read().items,[]);assert.equal(f.read().status,'fresh');
});
test('pending generation fencing, validation rollback and unavailable/stale never masquerade as empty',t=>{
 const f=fixture(t);f.publish(page(1,[event('kept')]));f.publish(page(3,[],{pages:2,generation:'new'}));
 assert.throws(()=>f.publish(page(2,[event('old-generation')])),{code:'conflict'});
 assert.throws(()=>f.publish(page(4,[event('dup'),event('dup')])),{code:'validation'});assert.equal(f.read().items[0].id,'kept');
 f.publish(page(4,[event('kept')],{metadata:{...metadata,state:'disconnected',syncActive:false}}));assert.equal(f.read().status,'stale');
 f.setTime(f.now()+300000);assert.equal(f.read().status,'stale');
 assert.throws(()=>f.publish(page(5,[{...event('x'),accessToken:'forbidden'}])),{code:'validation'});
 assert.throws(()=>f.publish({...page(5,[]),ownerId:f.other}),{code:'validation'});
});
test('agenda-scope cache reads include all-day context, expanded recurrence, linked identity and cross-midnight overlap',t=>{
 const f=fixture(t);f.publish(page(1,[event('all-day',{start:{date:'2026-09-27'},end:{date:'2026-09-28'}}),event('overnight',{start:{dateTime:'2026-09-26T23:30:00-04:00'},end:{dateTime:'2026-09-27T00:30:00-04:00'}}),event('linked',{linked:true,role:'managed'}),event('expanded',{recurring:true}),event('ended',{start:{dateTime:'2026-09-26T23:00:00-04:00'},end:{dateTime:'2026-09-27T00:00:00-04:00'}})]));
 const input={period:{start:'2026-09-27',end:'2026-09-27'},timezone:'America/Montreal',limit:2};
 const a=f.commands.invoke(f.owner,'list_calendar_events',input),b=f.commands.invoke(f.owner,'list_calendar_events',{...input,cursor:a.nextCursor});
 assert.equal(a.status,'fresh');assert.deepEqual([...a.items,...b.items].map(e=>e.id).sort(),['all-day','expanded','linked','overnight']);
 assert.deepEqual(f.commands.invoke(f.other,'list_calendar_events',input).items,[]);
});
test('normal agent can read scheduling cache but not publish; sync agent cannot impersonate browser or scheduling scope',async t=>{
 const f=fixture(t),origin='https://fixture.invalid';f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.agent),blob(f.owner),JSON.stringify(['agenda:read']),f.now()+100000);
 const handler=createMcpHandler({commands:f.commands,origin,readText:r=>r.text}),call=(name,args)=>handler({method:'POST',headers:new Headers({Authorization:'Bearer synthetic','Content-Type':'application/json',Accept:'application/json, text/event-stream'}),text:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})},{id:f.agent});
 assert.equal((await call('list_calendar_events',{period:{start:'2026-09-27',end:'2026-09-27'},timezone:'UTC'}).json()).result.structuredContent.status,'unavailable');
 assert.equal((await call('calendar_cache_publish',page(1,[])).json()).result.isError,true);
 const http=createHttpHandler({commands:f.commands,origin});assert.equal((await http(new Request(origin+'/api/meos/v1/calendar-cache'),{id:f.agent})).status,403);assert.equal((await http(new Request(origin+'/api/meos/v1/calendar-cache'),{id:f.owner})).status,200);
 f.db.prepare('UPDATE _meos_agent_grants SET scopes=? WHERE agent_id=?').run(JSON.stringify(['sync:read','sync:write']),blob(f.agent));assert.equal((await call('list_calendar_events',{period:{start:'2026-09-27',end:'2026-09-27'},timezone:'UTC'}).json()).result.isError,true);
});
test('mirror publishes bounded pages, backfills on startup, retries uncertain outcomes and fences connection changes',async t=>{
 const f=fixture(t),values=new Map(),store={get:k=>values.get(k),transaction:fn=>fn({get:k=>values.get(k),set:(k,v)=>values.set(k,v)})};let generation='g1',fail=false,calls=0;
 const items=Array.from({length:260},(_,i)=>event('event-'+i));let value={items,drafts:[],conflicts:[],metadata};
 const planner={async invoke(name,input){assert.equal(name,'calendar_cache_publish');assert.ok(Buffer.byteLength(JSON.stringify(input))<150000);calls++;const r=f.publish(input);if(fail){fail=false;throw Error('lost response')}return r}};
 const mirror=createCalendarMirror({store,planner,connection:()=>({generation}),snapshot:()=>value});
 await mirror.publish();assert.equal(f.read().items.length,260);assert.equal(calls,2);await mirror.publish();assert.equal(calls,2);
 value={...value,items:[event('replacement')]};fail=true;await assert.rejects(mirror.publish());await mirror.publish();assert.equal(f.read().items[0].id,'replacement');
 const next=createCalendarMirror({store,planner,connection:()=>({generation}),snapshot:()=>value});await next.publish();assert.ok(f.read().sequence>1);
 const fenced=createCalendarMirror({store,connection:()=>({generation}),snapshot:()=>({...value,items}),planner:{async invoke(name,input){const r=f.publish(input);generation='g2';return r}}});await assert.rejects(fenced.publish(),/generation_changed/);assert.equal(f.read().items.length,1);
});
test('existing service poll mirrors its durable snapshot, removals, drafts and provider outage without a second provider loop',async t=>{
 const {createCalendarService}=await import('../backend/calendar-service.mjs'),{createHash}=await import('node:crypto');
 const f=fixture(t),values=new Map(),store={get:k=>structuredClone(values.get(k)),transaction:fn=>{const copy=new Map([...values].map(([k,v])=>[k,structuredClone(v)]));const result=fn({get:k=>structuredClone(copy.get(k)),set:(k,v)=>copy.set(k,structuredClone(v)),delete:k=>copy.delete(k)});values.clear();for(const [k,v]of copy)values.set(k,v);return result}};
 const connection='connection:'+createHash('sha256').update(f.owner).digest('hex');
 store.transaction(tx=>tx.set(connection,{generation:'initial',state:'connected',managedCalendarId:'managed',credentials:{accessToken:'synthetic-secret',expiresAt:f.now()+3600000}}));
 let round=0,providerCalls=0,offline=false;
 const broker={tokenExchange:async()=>{},refreshExchange:async()=>{},verifyIdentity:async()=>{},async listEvents({calendarId}){providerCalls++;if(offline)throw Error('provider unavailable');return {items:calendarId==='primary'?[{...event('provider-event'),status:round?'cancelled':'confirmed'}]:[],nextSyncToken:'token-'+round}},async listWindow(){return {items:[]}}};
 const config={ownerId:f.owner,clientId:'synthetic.apps.googleusercontent.com',ownerEmail:'owner@example.invalid',origin:'https://fixture.invalid',redirectUri:'https://fixture.invalid/api/calendar/google/callback'};
 const service=createCalendarService({config,store,broker,now:f.now,planner:{invoke:async(name,input)=>f.commands.invoke(f.owner,name,input)}});
 await service.poll();assert.equal(providerCalls,2);assert.equal(f.read().items[0].id,'provider-event');assert.ok(!JSON.stringify(f.read()).includes('synthetic-secret'));
 await service.poll();assert.equal(providerCalls,2);round=1;f.setTime(f.now()+70000);await service.poll();assert.deepEqual(f.read().items,[]);
 round=0;f.setTime(f.now()+70000);await service.poll();assert.equal(f.read().items.length,1);
 offline=true;f.setTime(f.now()+70000);await assert.rejects(service.poll());assert.equal(f.read().items.length,1);assert.equal(f.read().status,'stale');
 await service.disconnect({ownerId:f.owner});assert.equal(f.read().state,'disconnected');assert.equal(f.read().items.length,1);assert.equal(f.read().status,'stale');
});

test('first partial publication stays a schema-valid unavailable cache',t=>{const f=fixture(t);f.publish(page(1,[event('pending')],{pages:2}));const cache=f.read();assert.equal(cache.status,'unavailable');assert.deepEqual(cache.items,[]);validateSchema(schemas.CalendarCache,cache)});

test('browser windows: exact exclusive overlap, timezone changes, DST and validation',t=>{
 const f=fixture(t);f.publish(page(1,[
  event('all-day',{start:{date:'2026-09-27'},end:{date:'2026-09-28'}}),
  event('ended',{start:{dateTime:'2026-09-26T23:00:00-04:00'},end:{dateTime:'2026-09-27T00:00:00-04:00'}}),
  event('overnight',{start:{dateTime:'2026-09-26T23:30:00-04:00'},end:{dateTime:'2026-09-27T00:30:00-04:00'}}),
  event('later',{start:{dateTime:'2026-09-28T00:00:00-04:00'},end:{dateTime:'2026-09-28T01:00:00-04:00'}}),
  event('fold',{start:{dateTime:'2026-11-01T01:30:00-04:00'},end:{dateTime:'2026-11-01T01:30:00-05:00'}}),
  event('gap',{start:{dateTime:'2026-03-08T01:30:00-05:00'},end:{dateTime:'2026-03-08T03:30:00-04:00'}})
 ]));
 const input={period:{start:'2026-09-27',end:'2026-09-27'},timezone:'America/Montreal'};
 const read=input=>f.commands.calendarWindow(f.owner,input);
 assert.deepEqual(read(input).items.map(x=>x.id),['all-day','overnight']);
 assert.deepEqual(read({...input,timezone:'Asia/Tokyo'}).items.map(x=>x.id),['all-day','ended','overnight']);
 for(const [day,id]of [['2026-11-01','fold'],['2026-03-08','gap']])assert.deepEqual(read({...input,period:{start:day,end:day}}).items.map(x=>x.id),[id]);
 assert.deepEqual(f.commands.calendarWindow(f.other,input).items,[]);
 for(const invalid of [{timezone:'Invalid/Zone'},{sequence:-1},{period:{start:'2026-09-28',end:'2026-09-27'}},{period:{start:'2026-01-01',end:'2026-12-31'}}])assert.throws(()=>read({...input,...invalid}),{code:'validation'});
});
test('unchanged polls skip event query, refresh freshness, and fence pages across publications',t=>{
 const f=fixture(t),input={period:{start:'2026-09-27',end:'2026-09-27'},timezone:'UTC'};
 f.publish(page(1,Array.from({length:250},(_,i)=>event('a-'+String(i).padStart(3,'0'))),{pages:2}));
 f.publish(page(1,[event('last')],{page:1,pages:2,metadata:undefined}));
 const first=f.commands.calendarWindow(f.owner,input);validateSchema(schemas.CalendarWindow,first);assert.equal(first.items.length,250);assert.ok(first.nextCursor);
 const last=f.commands.calendarWindow(f.owner,{...input,cursor:first.nextCursor,sequence:first.sequence});assert.equal(last.items.length,1);assert.equal(last.nextCursor,undefined);
 const unchanged=f.commands.calendarWindow(f.owner,{...input,sequence:1});assert.equal(unchanged.unchanged,true);assert.deepEqual(unchanged.items,[]);
 f.setTime(f.now()+180001);assert.equal(f.commands.calendarWindow(f.owner,{...input,sequence:1}).status,'stale');
 f.publish(page(2,[]));assert.throws(()=>f.commands.calendarWindow(f.owner,{...input,cursor:first.nextCursor,sequence:1}),{code:'conflict'});
 const changed=f.commands.calendarWindow(f.owner,{...input,sequence:1});assert.equal(changed.unchanged,false);assert.deepEqual(changed.items,[]);assert.equal(changed.sequence,2);
});
test('browser window route retains identity boundary and rejects malformed query',async t=>{
 const f=fixture(t),origin='https://fixture.invalid',http=createHttpHandler({commands:f.commands,origin});
 const url=origin+'/api/meos/v1/calendar-window?start=2026-09-27&end=2026-09-27&timezone=UTC';
 assert.equal((await http(new Request(url),null)).status,401);
 assert.equal((await http(new Request(url),{id:f.owner})).status,200);
 f.db.prepare('INSERT INTO _meos_agent_grants VALUES(?,?,?,?,0)').run(blob(f.agent),blob(f.owner),JSON.stringify(['agenda:read']),f.now()+100000);
 assert.equal((await http(new Request(url),{id:f.agent})).status,403);
 for(const suffix of ['&timezone=UTC','&unexpected=x','&sequence=bad'])assert.equal((await http(new Request(url+suffix),{id:f.owner})).status,422);
 assert.equal((await http(new Request(origin+'/api/meos/v1/calendar-window'),{id:f.owner})).status,422);
});
