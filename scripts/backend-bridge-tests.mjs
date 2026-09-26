// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createBridge} from '../backend/bridge.mjs'
import {createWeatherStorage} from '../backend/weather-storage.mjs'
import {createSynchronousWeather} from '../backend/weather.mjs'
import {createSynchronousHttpHandler} from '../backend/http-handler.mjs'
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY NOT NULL) STRICT;')
 const ids=Array.from({length:3},()=>randomUUID()),blob=id=>Buffer.from(id.replaceAll('-',''),'hex')
 for(const id of ids)db.prepare('INSERT INTO _user VALUES(?)').run(blob(id))
 for(const name of ['U1790380801__weather.sql','U1790380803__bridge.sql','U1790380804__bridge_seal.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+name,import.meta.url),'utf8'))
 db.prepare('INSERT INTO _meos_bridge_binding VALUES(?,?)').run(blob(ids[1]),blob(ids[0]))
 const database={begin(){db.exec('BEGIN IMMEDIATE');return {query:(sql,p)=>db.prepare(sql).all(...p).map(Object.values),execute:(sql,p)=>Number(db.prepare(sql).run(...p).changes),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}}
 const storage=createWeatherStorage(database),weather=createSynchronousWeather({storage,fetcher:()=>{throw Error('No network')},readText:()=>''}),bridge=createBridge({database,weather})
 return {db,ids,storage,bridge}
}
test('sealed bridge identity writes only its owner latest coarse observation',()=>{
 const f=fixture();try{
  const observation={latitude:45.501234,longitude:-73.569876,observedAt:new Date(Date.now()-1000).toISOString(),source:'bridge'}
  assert.equal(f.bridge.ownerFor(f.ids[1]),f.ids[0]);assert.equal(f.bridge.ownerFor(f.ids[0]),undefined)
  const result=f.bridge.ingest(f.ids[1],observation);assert.equal(result.latitude,45.5);assert.equal(result.longitude,-73.57)
  assert.equal(f.storage.latest(f.ids[2]),undefined)
  assert.throws(()=>f.bridge.ingest(f.ids[0],observation),{code:'forbidden'})
  assert.throws(()=>f.bridge.ingest(f.ids[1],{...observation,ownerId:f.ids[2]}),{code:'validation'})
  assert.throws(()=>f.bridge.ingest(f.ids[1],observation),{code:'conflict'})
  assert.throws(()=>f.db.exec('DELETE FROM _meos_bridge_binding'),/sealed/)
  const bytes=id=>Buffer.from(id.replaceAll('-',''),'hex')
  assert.equal(f.db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0)
  assert.throws(()=>f.db.prepare('INSERT OR REPLACE INTO _meos_bridge_binding VALUES(?,?)').run(bytes(f.ids[1]),bytes(f.ids[2])),/sealed/)
  assert.throws(()=>f.db.prepare('INSERT OR REPLACE INTO _meos_bridge_binding VALUES(?,?)').run(bytes(f.ids[2]),bytes(f.ids[0])),/sealed/)
  f.db.prepare('INSERT INTO _meos_bridge_binding VALUES(?,?) ON CONFLICT DO NOTHING').run(bytes(f.ids[1]),bytes(f.ids[0]))
  assert.equal(f.bridge.ownerFor(f.ids[1]),f.ids[0])
 }finally{f.db.close()}
})
test('bridge is excluded from planner commands and HTTP mutation still requires CSRF',()=>{
 const f=fixture(),origin='https://meos-acceptance.invalid';try{
  const handle=createSynchronousHttpHandler({commands:{},bridge:f.bridge,origin},{readText:r=>r.commandText})
  const user={id:f.ids[1],csrf:'synthetic'}
  assert.equal(handle(new Request(origin+'/api/meos/v1/resources/tasks'),user).status,403)
  const request=new Request(origin+'/api/meos/v1/bridge/location',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'}});request.commandText='{}'
  assert.equal(handle(request,user).status,403)
 }finally{f.db.close()}
})

test('maintenance requires private host Job context and fixed job identity',async()=>{
 const {isWeatherMaintenance,pruneWeather}=await import('../backend/maintenance.mjs')
 const context={kind:'Job',registered_path:'meos-weather-prune',user:null},target={authority:'__job',method:'GET'}
 assert.equal(isWeatherMaintenance(context,target),true)
 assert.equal(isWeatherMaintenance({...context,kind:'Http'},target),false)
 assert.equal(isWeatherMaintenance(context,{...target,authority:'meos-acceptance.invalid'}),false)
 let before;pruneWeather({maintenancePurge:value=>{before=value}},100000000);assert.equal(before,13600000)
})
