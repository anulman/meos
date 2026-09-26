// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createCommands } from '../backend/commands.mjs'
import { validateResource, validatePreferences, coarseLocation } from '../backend/domain.mjs'
import { createWeatherStorage } from '../backend/weather-storage.mjs'

// Deliberately no URL/path/database option: these tests cannot target a real depot.
const migration=readFileSync(new URL('../backend/migrations/U1790380800__planner.sql',import.meta.url),'utf8')
const toBlob=id=>Buffer.from(id.replaceAll('-',''),'hex')
function fixture() {
 const db=new DatabaseSync(':memory:')
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user (id BLOB PRIMARY KEY NOT NULL) STRICT;')
 const owner=randomUUID(), other=randomUUID()
 for(const id of [owner,other])db.prepare('INSERT INTO _user VALUES (?)').run(toBlob(id))
 db.exec(migration)
 const begin=()=>{
  db.exec('BEGIN IMMEDIATE')
  return {
   query:(sql,params)=>db.prepare(sql).all(...params).map(row=>Object.values(row)),
   execute:(sql,params)=>Number(db.prepare(sql).run(...params).changes),
   commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')
  }
 }
 const commands=createCommands({now:()=>1790380800000,begin})
 return {db,owner,other,commands,begin,close:()=>db.close()}
}
const project=(extra={})=>({id:randomUUID(),title:'Synthetic project',notes:{type:'doc'},...extra})
const task=(extra={})=>({id:randomUUID(),title:'Synthetic task',completed:false,priority:'none',notes:{type:'doc'},...extra})
const routine=()=>({id:randomUUID(),title:'Synthetic routine',weekdays:[0,2],timezone:'America/Montreal',notes:{type:'doc'}})

test('same command layer: stable create, full update, CAS conflict and owner-scoped pagination',()=>{
 const f=fixture();try {
  const p=project(),t=task({projectId:p.id})
  f.commands.create(f.owner,'projects',p)
  assert.equal(f.commands.create(f.owner,'tasks',t).revision,1)
  assert.equal(f.commands.create(f.owner,'tasks',{...t}).revision,1)
  assert.throws(()=>f.commands.create(f.owner,'tasks',{...t,title:'different'}),{code:'conflict'})
  assert.throws(()=>f.commands.get(f.other,'tasks',t.id),{code:'not_found'})
  assert.deepEqual(f.commands.list(f.other,'tasks').items,[])
  const saved=f.commands.update(f.owner,'tasks',{...t,completed:true},1)
  assert.equal(saved.revision,2);assert.equal(saved.value.completed,true)
  assert.throws(()=>f.commands.update(f.owner,'tasks',t,1),{code:'conflict'})
  assert.equal(f.commands.get(f.owner,'tasks',t.id).value.completed,true)
  for(let i=0;i<5;i++)f.commands.create(f.owner,'tasks',task())
  const found=[];let cursor
  do {const page=f.commands.list(f.owner,'tasks',{limit:2,cursor});found.push(...page.items);cursor=page.nextCursor}while(cursor)
  assert.equal(found.length,6);assert.equal(new Set(found.map(row=>row.value.id)).size,6)
 }finally{f.close()}
})
test('foreign relationships and identity tampering denied by commands and database constraints',()=>{
 const f=fixture();try {
  const p=project(),t=task({projectId:p.id})
  f.commands.create(f.owner,'projects',p)
  assert.throws(()=>f.commands.create(f.other,'tasks',t),{code:'not_found'})
  assert.throws(()=>f.commands.create(f.owner,'tasks',{...t,owner_id:f.other}),{code:'validation'})
  f.commands.create(f.owner,'tasks',t)
  assert.throws(()=>f.db.prepare('UPDATE tasks SET owner_id=?,revision=revision+1 WHERE id=?').run(toBlob(f.other),toBlob(t.id)),/immutable/)
  assert.throws(()=>f.db.prepare('INSERT INTO tasks(id,owner_id,doc,created_at,updated_at) VALUES(?,?,?,?,?)').run(toBlob(randomUUID()),toBlob(f.other),JSON.stringify(task({projectId:p.id})),1,1),/same-owner/)
  assert.throws(()=>f.commands.update(f.other,'tasks',t,1),{code:'not_found'})
 }finally{f.close()}
})
test('archive atomically unassigns without deleting and injected failure rolls back entire operation',()=>{
 const f=fixture();try {
  const p=project(),t1=task({projectId:p.id}),t2=task({projectId:p.id})
  f.commands.create(f.owner,'projects',p)
  for(const t of [t1,t2])f.commands.create(f.owner,'tasks',t)
  f.db.exec("CREATE TRIGGER synthetic_failure BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT,'injected failure'); END;")
  assert.throws(()=>f.commands.archiveProject(f.owner,p.id,1),/injected failure/)
  assert.equal(f.commands.get(f.owner,'projects',p.id).value.archived,undefined)
  assert.equal(f.commands.get(f.owner,'tasks',t1.id).value.projectId,p.id)
  f.db.exec('DROP TRIGGER synthetic_failure')
  const result=f.commands.archiveProject(f.owner,p.id,1)
  assert.equal(result.project.value.archived,true);assert.equal(result.affectedTaskIds.length,2)
  for(const t of [t1,t2]){const row=f.commands.get(f.owner,'tasks',t.id);assert.equal(row.value.projectId,undefined);assert.equal(row.revision,2)}
  assert.equal(f.commands.list(f.owner,'tasks').items.length,2)
  assert.throws(()=>f.commands.create(f.owner,'tasks',task({projectId:p.id})),{code:'validation'})
 }finally{f.close()}
})
test('routine natural keys preserve independent occurrence history and reject cross-owner references',()=>{
 const f=fixture();try {
  const r=routine();f.commands.create(f.owner,'routines',r)
  const a={id:randomUUID(),routineId:r.id,date:'2026-09-27',completed:true}
  const b={...a,id:randomUUID(),date:'2026-09-29'}
  const first=f.commands.saveNatural(f.owner,'occurrences',a,0)
  const repeat=f.commands.saveNatural(f.owner,'occurrences',{...a,id:randomUUID()},0)
  assert.equal(first.value.id,repeat.value.id);assert.equal(repeat.revision,1)
  f.commands.saveNatural(f.owner,'occurrences',b,0)
  f.commands.saveNatural(f.owner,'occurrences',{...a,completed:false},1)
  assert.equal(f.commands.get(f.owner,'occurrences',b.id).value.completed,true)
  f.commands.update(f.owner,'routines',{...r,weekdays:[1]},1)
  assert.equal(f.commands.list(f.owner,'occurrences').items.length,2)
  assert.throws(()=>f.commands.update(f.owner,'occurrences',{...b,date:'2026-10-01'},1),{code:'validation'})
  assert.throws(()=>f.commands.saveNatural(f.owner,'occurrences',{...b,completed:false},0),{code:'conflict'})
  assert.throws(()=>f.commands.saveNatural(f.other,'occurrences',{...a,id:randomUUID()},0),{code:'not_found'})
 }finally{f.close()}
})

test('weather SQL storage enforces latest-only ordering, owner separation and physical cache expiry',()=>{
 const f=fixture();try {
  f.db.exec(readFileSync(new URL('../backend/migrations/U1790380801__weather.sql',import.meta.url),'utf8'))
  const store=createWeatherStorage({begin:f.begin})
  const first={latitude:0.12,longitude:0.99,source:'bridge',observedAt:'2026-09-26T10:00:00.000Z'}
  store.replaceLatest(f.owner,first,undefined)
  assert.equal(store.latest(f.other),undefined)
  assert.throws(()=>store.replaceLatest(f.owner,first,undefined),{code:'conflict'})
  const second={...first,latitude:0.13,observedAt:'2026-09-26T11:00:00.000Z'}
  store.replaceLatest(f.owner,second,first.observedAt)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM latest_location').get().n,1)
  assert.equal(store.latest(f.owner).latitude,0.13)
  assert.throws(()=>store.replaceLatest(f.owner,first,second.observedAt),/non-increasing/)
  const snapshot={fetchedAt:'2026-09-26T11:00:00.000Z',expiresAt:'2026-09-26T11:30:00.000Z'}
  store.save(f.owner,'synthetic-key',snapshot)
  assert.equal(store.cached(f.other,'synthetic-key'),undefined)
  store.purgeBefore(Date.parse('2026-09-26T11:00:00.000Z'))
  assert.equal(store.cached(f.owner,'synthetic-key'),undefined)
 }finally{f.close()}
})
test('inclusive period notes and outcome associations remain separate from task priority/preferences',()=>{
 const f=fixture();try {
  const t=task({priority:'low'});f.commands.create(f.owner,'tasks',t)
  const period={start:'2026-09-27',end:'2026-10-03'}
  const outcome={id:randomUUID(),taskId:t.id,period,position:0}
  f.commands.create(f.owner,'outcomes',outcome)
  assert.throws(()=>f.commands.create(f.owner,'outcomes',{...outcome,id:randomUUID()}),{code:'conflict'})
  assert.equal(f.commands.get(f.owner,'tasks',t.id).value.priority,'low')
  const note={id:randomUUID(),kind:'week',period,notes:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Synthetic note'}]}]}}
  f.commands.saveNatural(f.owner,'periodNotes',note,0)
  const prefs={timezone:'America/Montreal',weekStartsOn:0,weather:{enabled:false,source:'latest',units:'celsius'}}
  f.commands.savePreferences(f.owner,prefs,0);f.commands.savePreferences(f.owner,{...prefs,weekStartsOn:1},1)
  assert.deepEqual(f.commands.get(f.owner,'periodNotes',note.id).value.period,period)
  f.commands.removeOutcome(f.owner,outcome.id,1)
  assert.equal(f.commands.get(f.owner,'tasks',t.id).value.priority,'low')
 }finally{f.close()}
})
test('server validator rejects rolled dates, unsafe references/documents, bad timezone and ownership fields',()=>{
 for(const bad of [
  task({schedule:{date:'2026-02-29',timezone:'UTC'}}),
  task({schedule:{date:'2026-03-08',timezone:'Not/AZone'}}),
  task({schedule:{date:'2026-03-08',timezone:'UTC',time:'24:00'}}),
  task({notes:{type:'doc',content:[{type:'text',text:'bad nesting'}]}}),
  task({notes:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'link',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}}),
  task({references:[{id:randomUUID(),label:'bad',url:'https://user:password@example.invalid'}]}),
  task({ownerId:randomUUID()})
 ])assert.throws(()=>validateResource('tasks',bad),{code:'validation'})
 assert.throws(()=>validatePreferences({timezone:'UTC',weekStartsOn:2,weather:{enabled:false,source:'latest',units:'celsius'}}),{code:'validation'})
 assert.deepEqual(coarseLocation({latitude:45.51234,longitude:-73.61234}),{latitude:45.51,longitude:-73.61})
})
