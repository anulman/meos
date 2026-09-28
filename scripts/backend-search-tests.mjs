// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createCommands} from '../backend/commands.mjs'
import {createEmbeddingProvider,runEmbeddingBatch} from '../backend/search-worker.mjs'
import {createMcpHandler} from '../backend/mcp.mjs'
import {embeddingInput} from '../backend/embedding-input.mjs'
const commit=(job,embedding)=>Object.fromEntries([...['id','revision','model','dimensions','indexVersion','inputVersion','inputHash'].map(k=>[k,job[k]]),['embedding',embedding]])
const vector=Array.from({length:1536},(_,i)=>i===0?1:0)
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT;')
 const owner=randomUUID(),other=randomUUID(),bytes=id=>Buffer.from(id.replaceAll('-',''),'hex')
 for(const id of [owner,other])db.prepare('INSERT INTO _user VALUES(?)').run(bytes(id))
 for(const n of ['0800__planner','0803__bridge','0805__scheduling_contract','0812__search']){
  let sql=readFileSync(new URL('../backend/migrations/U179038'+n+'.sql',import.meta.url),'utf8')
  // Unit adapter only: exact-image migration proof separately exercises native vec0.
  sql=sql.replace('CREATE VIRTUAL TABLE search_vectors USING vec0(embedding float[1536] distance_metric=cosine);','CREATE TABLE search_vectors(rowid INTEGER PRIMARY KEY,embedding TEXT);')
  db.exec(sql)
 }
 db.function('vec_distance_cosine',(a,b)=>{a=JSON.parse(a);b=JSON.parse(b);return 1-a.reduce((s,x,i)=>s+x*b[i],0)/Math.sqrt(a.reduce((s,x)=>s+x*x,0)*b.reduce((s,x)=>s+x*x,0))})
 let clock=1790380800000
 const commands=createCommands({now:()=>clock,begin(){db.exec('BEGIN');return {query:(s,p)=>db.prepare(s).all(...p).map(Object.values),execute:(s,p)=>Number(db.prepare(s).run(...p).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}})
 const call=(name,args)=>commands.invoke(owner,name,args)
 const task=(title,notes='Synthetic note')=>({id:randomUUID(),title,notes:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:notes}]}]},completed:false,priority:'none'})
 return {db,owner,other,commands,call,task,tick:n=>clock+=n}
}
test('FTS updates transactionally; title boost, owner/kind/archive filters, deletion and literal queries',()=>{
 const f=fixture(),a=f.task('Orchard apples'),b=f.task('Shopping','apples'),secret=f.task('Private apples')
 try{
  f.commands.create(f.owner,'tasks',a);f.commands.create(f.owner,'tasks',b);f.commands.create(f.other,'tasks',secret)
  let r=f.call('search',{query:'apples'});assert.equal(r.semantic,'disabled');assert.equal(r.items[0].id,a.id);assert.equal(r.items.length,2)
  f.commands.update(f.owner,'tasks',{...a,title:'Peaches',archived:true},1)
  assert.equal(f.call('search',{query:'apples'}).items.length,1)
  assert.equal(f.call('search',{query:'peaches'}).items.length,0)
  assert.equal(f.call('search',{query:'peaches',includeArchived:true}).items.length,1)
  assert.equal(f.call('search',{query:'apples',kinds:['projects']}).items.length,0)
  assert.doesNotThrow(()=>f.call('search',{query:'" OR * : NOT'}))
  f.call('delete_task',{id:b.id,expectedRevision:1,idempotencyKey:'delete-search-1'})
  assert.equal(f.call('search',{query:'apples'}).items.length,0)
 }finally{f.db.close()}
})
test('revision jobs reject stale commits; leases retry; semantic cache is owner-bound and expires',()=>{
 const f=fixture(),a=f.task('Apple')
 try{
  f.commands.create(f.owner,'tasks',a);f.call('configure_search',{enabled:true})
  const old=f.call('search_index_batch',{}).items[0];assert.equal(f.call('search_index_batch',{}).items.length,0)
  f.commands.update(f.owner,'tasks',{...a,title:'Orange'},1)
  assert.deepEqual(f.call('search_index_commit',commit(old,vector)),{accepted:false})
  const current=f.call('search_index_batch',{}).items[0];f.tick(60001)
  assert.equal(f.call('search_index_batch',{}).items[0].attempt,2)
  assert.equal(f.call('search_index_commit',commit(current,vector)).accepted,true)
  assert.equal(f.call('search_index_commit',commit(current,vector)).accepted,true)
  assert.equal(f.call('search',{query:'fruit'}).semantic,'pending')
  const q=f.call('search_index_batch',{}).items[0];f.call('search_index_commit',commit(q,vector))
  const result=f.call('search',{query:'fruit'});assert.equal(result.semantic,'ready');assert.equal(result.items[0].id,a.id)
  assert.equal(f.commands.invoke(f.other,'search',{query:'fruit'}).items.length,0)
  f.tick(3600001);assert.equal(f.call('search',{query:'fruit'}).semantic,'pending')
  f.call('delete_task',{id:a.id,expectedRevision:2,idempotencyKey:'search-delete-2'})
  assert.equal(f.db.prepare('SELECT count(*) n FROM search_vectors').get().n,0)
  f.call('configure_search',{enabled:false});assert.equal(f.call('search_index_batch',{}).enabled,false)
 }finally{f.db.close()}
})
test('query cache stays bounded and provider failures leave retryable jobs',async()=>{
 const f=fixture();try{f.call('configure_search',{enabled:true});for(let i=0;i<105;i++)f.call('search',{query:'q'+i});assert.equal(f.db.prepare('SELECT count(*) n FROM search_jobs WHERE query IS NOT NULL').get().n,100)
 const result=await runEmbeddingBatch({call:f.call,embed:async()=>{throw Error('provider down')}});assert.equal(result.failed,8)
 }finally{f.db.close()}
})
test('provider request is fixed-origin, no redirects, validated model/dimension',async()=>{
 let request
 const embed=createEmbeddingProvider({apiKey:'synthetic',fetcher:async(url,options)=>{request={url,...options};return new Response(JSON.stringify({model:'text-embedding-3-small',data:[{embedding:vector}]}))}})
 assert.deepEqual(await embed('synthetic text'),vector);assert.equal(request.url,'https://api.openai.com/v1/embeddings');assert.equal(request.redirect,'error');assert.equal(JSON.parse(request.body).dimensions,1536)
 await assert.rejects(createEmbeddingProvider({apiKey:'synthetic',fetcher:async()=>new Response(JSON.stringify({model:'wrong',data:[]}))})('x'))
})
test('search:read cannot lease/index; sync:read cannot search; MCP returns serialized contract',async()=>{
 const f=fixture(),origin='https://example.test',user={id:randomUUID()}
 try{let scopes=['search:read'];const commands={...f.commands,mcpGrant:()=>({active:true,owner:f.owner,scopes})}
 const handle=createMcpHandler({commands,origin,readText:r=>r.bodyText})
 function req(name,args){return {method:'POST',headers:new Headers({Authorization:'Bearer synthetic',Accept:'application/json, text/event-stream','Content-Type':'application/json'}),bodyText:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}}
 assert.equal((await handle(req('search_index_batch',{}),user).json()).result.isError,true)
 assert.equal((await handle(req('search',{query:'test'}),user).json()).result.structuredContent.semantic,'disabled')
 scopes=['sync:read'];assert.equal((await handle(req('search',{query:'test'}),user).json()).result.isError,true)
 }finally{f.db.close()}
})
test('period notes and routine snapshots stay searchable; malformed vectors cannot commit',()=>{
 const f=fixture();try{
 const note={id:randomUUID(),kind:'week',period:{start:'2026-09-21',end:'2026-09-27'},notes:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Reflection: protect focus time'}]}]}}
 f.commands.saveNatural(f.owner,'periodNotes',note,0)
 const routine={id:randomUUID(),title:'Focused practice',notes:{type:'doc'},recurrenceIntent:{text:'every day',anchorDate:'2020-01-01'},timezone:'UTC'}
 f.commands.create(f.owner,'routines',routine)
 f.commands.saveNatural(f.owner,'occurrences',{id:randomUUID(),routineId:routine.id,date:'2026-09-26',completed:false},0)
 assert.equal(f.call('search',{query:'Reflection',kinds:['periodNotes']}).items.length,1)
 assert.equal(f.call('search',{query:'Focused'}).items.length,2)
 f.call('configure_search',{enabled:true});const job=f.call('search_index_batch',{}).items[0]
 assert.throws(()=>f.call('search_index_commit',commit(job,[1])),{code:'validation'})
 assert.throws(()=>f.call('search_index_commit',commit(job,Array(1536).fill(0))),{code:'validation'})
 f.commands.invoke(f.other,'configure_search',{enabled:true});assert.equal(f.commands.invoke(f.other,'search_index_commit',commit(job,vector)).accepted,false)
 }finally{f.db.close()}
})
test('completion and schedule edits preserve vectors and leased unchanged-content jobs',()=>{
 const f=fixture(),a=f.task('Stable text')
 try{
  f.commands.create(f.owner,'tasks',a);f.call('configure_search',{enabled:true})
  const job=f.call('search_index_batch',{}).items[0]
  f.commands.update(f.owner,'tasks',{...a,completed:true},1)
  assert.equal(f.call('search_index_commit',commit(job,vector)).accepted,true)
  assert.equal(f.db.prepare('SELECT count(*) n FROM search_vectors').get().n,1)
  const scheduled={...a,completed:true,schedule:{date:'2026-09-26',time:'10:00',timezone:'UTC'}}
  f.commands.update(f.owner,'tasks',scheduled,2)
  assert.equal(f.db.prepare('SELECT count(*) n FROM search_vectors').get().n,1)
  assert.equal(f.call('search_index_batch',{}).items.length,0)
  assert.equal(f.call('search',{query:'Stable text',mode:'keyword'}).items[0].revision,3)
  f.commands.update(f.owner,'tasks',{...scheduled,title:'New text'},3)
  assert.equal(f.db.prepare('SELECT count(*) n FROM search_vectors').get().n,0)
  assert.equal(f.call('search_index_commit',commit(job,vector)).accepted,false)
 }finally{f.db.close()}
})

test('canonical input SHA256 preserves Unicode/BOM and truncates once at 6000 UTF8 bytes',()=>{
 for(const text of ['', 'abc', '\ufeffhello', '🍎'.repeat(2000), 'a'.repeat(5999)+'🍎']){
  const input=embeddingInput(text),bytes=Buffer.from(input.text)
  assert(bytes.length<=6000);assert(!input.text.endsWith('\ufffd'))
  assert.equal(input.inputHash,createHash('sha256').update(bytes).digest('hex'))
 }
 assert.equal(embeddingInput('a'.repeat(5999)+'🍎').text.length,5999)
})
test('full identity is checked before replay; targeted claims and query commits are owner/type scoped',()=>{
 const f=fixture();try{
  f.call('configure_search',{enabled:true});const a=f.task('Immutable'),b=f.task('Other');f.commands.create(f.owner,'tasks',a);f.commands.create(f.owner,'tasks',b)
  const job=f.call('search_index_batch',{source:{kind:'tasks',id:a.id},limit:1}).items[0]
  assert.equal(job.source.id,a.id);assert.equal(job.type,'document')
  assert.equal(f.call('search_query_commit',commit(job,vector)).accepted,false)
  for(const [key,value]of Object.entries({model:'other',dimensions:4,indexVersion:'v2',inputVersion:'v2',inputHash:'0'.repeat(64),revision:999}))assert.equal(f.call('search_index_commit',{...commit(job,vector),[key]:value}).accepted,false)
  const outbox=f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n
  assert.equal(f.call('search_index_commit',commit(job,vector)).accepted,true)
  assert.equal(f.call('search_index_commit',{...commit(job,vector),inputHash:'0'.repeat(64)}).accepted,false)
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n,outbox)
  const q=f.call('search',{query:'related'}).queryJob;assert.equal(q.type,'query');assert.equal(q.source,undefined)
  assert.equal(f.call('search_query_commit',commit(q,vector)).accepted,true)
  assert.equal(f.call('search',{query:'related'}).semantic,'ready')
  f.tick(3600001);assert.equal(f.call('search_query_commit',commit(q,vector)).accepted,false)
 }finally{f.db.close()}
})
test('search-read MCP principal can commit its query but not a document descriptor',async()=>{
 const f=fixture();try{
  f.call('configure_search',{enabled:true});f.commands.create(f.owner,'tasks',f.task('Document'))
  const d=f.call('search_index_batch',{}).items[0],q=f.call('search',{query:'Query'}).queryJob
  const handle=createMcpHandler({commands:{...f.commands,mcpGrant:()=>({active:true,owner:f.owner,scopes:['search:read']})},origin:'https://example.test',readText:r=>r.bodyText})
  const call=async job=>(await handle({method:'POST',headers:new Headers({Authorization:'Bearer synthetic',Accept:'application/json, text/event-stream','Content-Type':'application/json'}),bodyText:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_query_commit',arguments:commit(job,vector)}})},{id:randomUUID()}).json()).result
  assert.equal((await call(d)).structuredContent.accepted,false);assert.equal((await call(q)).structuredContent.accepted,true)
 }finally{f.db.close()}
})

test('delegated owner search needs no service identity and cannot read another owner',async()=>{
 const f=fixture();try{
  const task=f.task('Private orchard');f.commands.create(f.owner,'tasks',task)
  const handle=createMcpHandler({commands:f.commands,origin:'https://example.test',readText:r=>r.bodyText})
  const call=async(owner,name,args)=>(await handle({method:'POST',headers:new Headers({Authorization:'Bearer synthetic',Accept:'application/json, text/event-stream','Content-Type':'application/json'}),bodyText:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})},{id:owner}).json()).result
  assert.equal((await call(f.owner,'configure_search',{enabled:true})).structuredContent.enabled,true)
  assert.equal((await call(f.owner,'search',{query:'orchard'})).structuredContent.items[0].id,task.id)
  assert.equal((await call(f.other,'search',{query:'orchard'})).structuredContent.items.length,0)
  assert.equal(f.db.prepare('SELECT count(*) n FROM _meos_agent_grants').get().n,0)
 }finally{f.db.close()}
})
