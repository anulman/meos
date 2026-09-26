// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createCommands } from '../backend/commands.mjs'
import { createHttpHandler } from '../backend/http-handler.mjs'
registerHooks({resolve(specifier,context,next){if(context.parentURL?.includes('/src/lib/')&&specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);return next(specifier,context)}})
const { JsonTransport }=await import('../src/lib/backend/transport.ts')
const { FetchMeosRepository }=await import('../src/lib/backend/fetch-repository.ts')
const { decodeWeather }=await import('../src/lib/backend/weather-codec.ts')
const origin='https://acceptance.invalid',base='/api/meos/v1'
function fixture(){
 const db=new DatabaseSync(':memory:'),owner=randomUUID()
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY NOT NULL) STRICT;')
 db.prepare('INSERT INTO _user VALUES(?)').run(Buffer.from(owner.replaceAll('-',''),'hex'))
 db.exec(readFileSync(new URL('../backend/migrations/U1790380800__planner.sql',import.meta.url),'utf8'))
 const commands=createCommands({begin:()=>{db.exec('BEGIN IMMEDIATE');return {
  query:(sql,params)=>db.prepare(sql).all(...params).map(Object.values),execute:(sql,params)=>Number(db.prepare(sql).run(...params).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')
 }}})
 const handle=createHttpHandler({commands,origin}),user={id:owner,csrf:'synthetic-csrf'}
 const http=new JsonTransport(base,()=>user.csrf,(url,init)=>handle(new Request(origin+url,{...init,headers:{...init.headers,Origin:origin}}),user))
 return {db,handle,user,repository:new FetchMeosRepository(http)}
}
test('same real fetch repository and command handler preserve committed CRUD/CAS/archive behavior',async()=>{
 const f=fixture();try{
  const p={id:randomUUID(),title:'Synthetic project',notes:{type:'doc'}}
  const t={id:randomUUID(),title:'Synthetic task',completed:false,priority:'none',projectId:p.id,notes:{type:'doc'}}
  await f.repository.create('projects',p)
  const created=await f.repository.create('tasks',t);assert.equal(created.revision,1)
  const updated=await f.repository.update('tasks',{...t,completed:true},{expectedRevision:1});assert.equal(updated.revision,2)
  await assert.rejects(f.repository.update('tasks',t,{expectedRevision:1}),{code:'conflict'})
  await f.repository.archiveProject(p.id,{expectedRevision:1})
  const saved=await f.repository.get('tasks',t.id);assert.equal(saved.value.projectId,undefined);assert.equal(saved.value.completed,true)
  assert.equal((await f.repository.list('tasks',{limit:1})).items.length,1)
 }finally{f.db.close()}
})
test('HTTP boundary rejects anonymous, wrong-origin and missing-CSRF mutations',async()=>{
 const f=fixture();try{
  const request=headers=>new Request(origin+base+'/resources/tasks',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'})
  assert.equal((await f.handle(request({Origin:origin,'X-CSRF-Token':f.user.csrf}),null)).status,401)
  assert.equal((await f.handle(request({Origin:'https://production.invalid','X-CSRF-Token':f.user.csrf}),f.user)).status,403)
  assert.equal((await f.handle(request({Origin:origin}),f.user)).status,403)
  assert.equal((await f.handle(request({Origin:origin,'X-CSRF-Token':f.user.csrf,'Sec-Fetch-Site':'cross-site'}),f.user)).status,403)
 }finally{f.db.close()}
})
test('HTTP boundary rejects owner envelope injection and oversized streamed bodies; errors redact internals',async()=>{
 const f=fixture();try{
  const headers={Origin:origin,'X-CSRF-Token':f.user.csrf,'Content-Type':'application/json'}
  const injected=await f.handle(new Request(origin+base+'/resources/tasks',{method:'POST',headers,body:JSON.stringify({ownerId:f.user.id,value:{}})}),f.user)
  assert.equal(injected.status,422)
  const large=await f.handle(new Request(origin+base+'/resources/tasks',{method:'POST',headers,body:'a'.repeat(150001)}),f.user)
  assert.equal(large.status,422)
  const broken=createHttpHandler({origin,commands:{list(){throw Error('secret database path and credential')}}})
  const response=await broken(new Request(origin+base+'/resources/tasks'),f.user)
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret|credential|database/)
 }finally{f.db.close()}
})
test('weather decoder rejects malformed success payloads rather than trusting server shape',()=>{
 const empty={status:'unavailable',units:'celsius',timezone:'UTC',attribution:{label:'Open-Meteo',url:'https://open-meteo.com/'},hourly:[],daily:[]}
 assert.equal(decodeWeather(empty).status,'unavailable')
 assert.throws(()=>decodeWeather({...empty,status:'fresh'}),{code:'invalid_response'})
 assert.throws(()=>decodeWeather({...empty,hourly:[{at:'2026-02-31T12:00',temperature:20,rainProbability:5,windSpeed:1}]}),{code:'invalid_response'})
 assert.throws(()=>decodeWeather({...empty,location:{latitude:0.123456,longitude:0,source:'bridge',observedAt:'2026-09-26T12:00:00.000Z'}}),{code:'invalid_response'})
})
