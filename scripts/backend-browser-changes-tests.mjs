// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import http from 'node:http'
import {once} from 'node:events'
import {createProtectedApiProxy} from '../backend/protected-proxy.mjs'
import {unixUpstream,createNodeWebHandler} from '../backend/node-web-server.mjs'
const origin='https://meos-acceptance.invalid'
const migration=n=>readFileSync(new URL('../backend/migrations/'+n,import.meta.url),'utf8')
test('notification projection covers domain/delete/preferences/calendar, isolates owners and rolls back',()=>{
 const db=new DatabaseSync(':memory:');db.function('is_uuid',value=>value?.length===16?1:0)
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT;')
  for(const n of ['U1790380800__planner.sql','U1790380805__scheduling_contract.sql','U1790380811__calendar_cache.sql','U1790380815__browser_changes.sql'])db.exec(migration(n))
  const owner=Buffer.alloc(16,1),other=Buffer.alloc(16,2),id=Buffer.alloc(16,3),uuid='03030303-0303-0303-0303-030303030303'
  for(const v of [owner,other])db.prepare('INSERT INTO _user VALUES(?)').run(v)
  const current=()=>db.prepare('SELECT kind,sequence FROM browser_changes WHERE id=?').get(owner)
  db.prepare('INSERT INTO tasks(id,owner_id,doc,revision,created_at,updated_at) VALUES(?,?,?,1,1,1)').run(id,owner,JSON.stringify({id:uuid,title:'Private text',completed:false,priority:1,notes:{type:'doc',content:[]}}))
  assert.deepEqual({...current()},{kind:'tasks',sequence:1})
  db.prepare('DELETE FROM tasks WHERE id=?').run(id);assert.equal(current().sequence,2)
  db.prepare("INSERT INTO preferences VALUES(?,'{}',1,1,1)").run(owner);assert.deepEqual({...current()},{kind:'preferences',sequence:3})
  db.prepare('UPDATE preferences SET revision=revision+1 WHERE owner_id=?').run(owner);assert.equal(current().sequence,4)
  db.prepare('DELETE FROM preferences WHERE owner_id=?').run(owner);assert.equal(current().sequence,5)
  db.prepare('INSERT INTO calendar_cache_state(owner_id) VALUES(?)').run(owner)
  db.prepare('UPDATE calendar_cache_state SET pending_sequence=1 WHERE owner_id=?').run(owner);assert.equal(current().sequence,5)
  db.prepare('UPDATE calendar_cache_state SET sequence=1 WHERE owner_id=?').run(owner);assert.deepEqual({...current()},{kind:'calendar-window',sequence:6})
  db.prepare('UPDATE calendar_cache_state SET sequence=1 WHERE owner_id=?').run(owner);assert.equal(current().sequence,6)
  db.exec('BEGIN');db.prepare('UPDATE calendar_cache_state SET sequence=2 WHERE owner_id=?').run(owner);db.exec('ROLLBACK');assert.equal(current().sequence,6)
  db.prepare("INSERT INTO preferences VALUES(?,'{}',1,1,1)").run(other);assert.equal(current().sequence,6)
  assert.equal(db.prepare('SELECT count(*) n FROM browser_changes').get().n,2)
  assert.deepEqual(db.prepare('PRAGMA table_info(browser_changes)').all().map(c=>c.name),['id','kind','sequence'])
 }finally{db.close()}
})

test('stream alias is narrow, origin checked, metadata stream unbuffered and cancellation forwarded',async()=>{
 let forwarded,cancelled=false
 const handle=createProtectedApiProxy({origin,upstream:async req=>{forwarded=req;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(': ping\n\n'))},cancel(){cancelled=true}}),{headers:{'Content-Type':'text/event-stream'}})}})
 for(const [path,init] of [['/api/meos/v1/changes?ws=true',{}],['/api/meos/v1/changes',{method:'POST'}],['/api/meos/v1/changes',{headers:{Origin:'https://foreign.invalid'}}],['/api/meos/v1/changes',{headers:{'Sec-Fetch-Site':'cross-site'}}]])assert.equal((await handle(new Request(origin+path,init))).status,403)
 assert.equal(forwarded,undefined)
 const controller=new AbortController()
 const result=await handle(new Request(origin+'/api/meos/v1/changes',{signal:controller.signal,headers:{Cookie:'auth_token=fixture',Authorization:'Bearer forged','__context':'forged',Origin:origin}}))
 assert.equal(forwarded.url,origin+'/api/records/v1/browser_changes/subscribe/*');assert.equal(forwarded.headers.get('Cookie'),'auth_token=fixture');assert.equal(forwarded.headers.has('Authorization'),false);assert.equal(forwarded.headers.has('__context'),false)
 assert.equal(result.headers.get('X-Accel-Buffering'),'no')
 const reader=result.body.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),': ping\n\n')
 controller.abort();assert.equal(forwarded.signal.aborted,true);await reader.cancel();assert.equal(cancelled,true)
})

test('full Node/Unix SSE path flushes before EOF, keeps bytes intact and cancels disconnected subscriber',async()=>{
 const root=mkdtempSync(tmpdir()+'/meos-sse-'),socketPath=root+'/backend.sock'
 let nativeResponse,closedResolve;const closed=new Promise(resolve=>closedResolve=resolve)
 const native=http.createServer((req,res)=>{assert.equal(req.url,'/api/records/v1/browser_changes/subscribe/*');nativeResponse=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': ping\n\n');res.once('close',closedResolve)})
 const web=http.createServer(createNodeWebHandler({origin,root,upstream:unixUpstream({origin,socketPath})}))
 try{
  native.listen(socketPath);await once(native,'listening');web.listen(0,'127.0.0.1');await once(web,'listening')
  const response=await new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:web.address().port,path:'/api/meos/v1/changes',headers:{Host:new URL(origin).host}},resolve);req.on('error',reject)})
  assert.equal(response.headers['content-type'],'text/event-stream')
  const first=await once(response,'data');assert.equal(first[0].toString(),': ping\n\n')
  const next=once(response,'data');nativeResponse.write('data: {"Update":{"kind":"tasks","sequence":1},"seq":0}\n\n');assert.match((await next)[0].toString(),/"kind":"tasks"/)
  response.destroy();await closed
 }finally{web.closeAllConnections();native.closeAllConnections();await Promise.all([new Promise(r=>web.close(r)),new Promise(r=>native.close(r))]);rmSync(root,{recursive:true,force:true})}
})

test('native SSE lifetime forces reauthentication within sixty seconds even while active',{timeout:62000},async()=>{
 const root=mkdtempSync(tmpdir()+'/meos-sse-expiry-'),socketPath=root+'/backend.sock'
 let keepalive,closedResolve;const closed=new Promise(resolve=>closedResolve=resolve)
 const native=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': ping\n\n');keepalive=setInterval(()=>res.write(': ping\n\n'),1000);res.once('close',()=>{clearInterval(keepalive);closedResolve()})})
 try{
  native.listen(socketPath);await once(native,'listening')
  const started=Date.now(),response=await unixUpstream({origin,socketPath})(new Request(origin+'/api/records/v1/browser_changes/subscribe/*'))
  const reader=response.body.getReader();await assert.rejects(async()=>{while(!(await reader.read()).done){}})
  await closed;const elapsed=Date.now()-started;assert.ok(elapsed>=54000&&elapsed<60000,'active subscription expires within the authentication bound')
 }finally{clearInterval(keepalive);native.closeAllConnections();await new Promise(r=>native.close(r));rmSync(root,{recursive:true,force:true})}
})
