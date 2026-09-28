// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {notes,validateResource} from '../backend/domain.mjs'
const bytes=id=>Buffer.from(id.replaceAll('-',''),'hex')
const migration=name=>readFileSync(new URL(`../backend/migrations/U179038${name}.sql`,import.meta.url),'utf8')
function fixture(){
 const db=new DatabaseSync(':memory:')
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT;')
 db.exec(migration('0800__planner'));db.exec(migration('0805__scheduling_contract'))
 const owner=bytes(randomUUID());db.prepare('INSERT INTO _user VALUES(?)').run(owner)
 const insert=(kind,doc)=>db.prepare(`INSERT INTO ${kind}(id,owner_id,doc,revision,created_at,updated_at) VALUES(?,?,?,4,100,200)`).run(bytes(doc.id),owner,JSON.stringify(doc))
 const get=id=>db.prepare('SELECT * FROM routines WHERE uuid=?').get(id)
 const migrate=()=>db.exec(migration('0813__routine_intent'))
 return {db,insert,get,migrate,close:()=>db.close()}
}
const routine=(extra={})=>({id:randomUUID(),title:'Synthetic routine',notes:{type:'doc'},timezone:'America/Montreal',weekdays:[2,0],...extra})
const value=row=>JSON.parse(row.doc)

test('legacy template becomes intent while exact historical occurrences remain byte-for-byte unchanged',()=>{
 const f=fixture();try{
  const r=routine({time:'09:15',durationMinutes:45});f.insert('routines',r)
  const occurrence={id:randomUUID(),routineId:r.id,date:'2026-09-27',completed:true,edited:true,skipped:false,templateRevision:2,title:'Historical title',notes:{type:'doc'},durationMinutes:65,schedule:{date:'2026-09-28',time:'13:00',timezone:'America/Montreal'},actualDurationMinutes:70}
  f.insert('occurrences',occurrence)
  const before=f.db.prepare('SELECT * FROM occurrences').all()
  const cursor=f.db.prepare('SELECT MAX(sequence) AS n FROM sync_outbox').get().n
  f.migrate()
  const row=f.get(r.id),doc=value(row)
  assert.deepEqual(doc.recurrenceIntent,{text:'every sunday, tuesday',status:'validated',kind:'fixed',weekdays:[0,2],intervalWeeks:1,anchorDate:'2020-01-01'})
  assert.equal(doc.durationIntent,'45 minutes');assert.equal(doc.preferredTime,undefined)
  assert.match(doc.notes.content[0].content[0].text,/hard time constraint: exactly 09:15 \(America\/Montreal\)/)
  assert.match(doc.notes.content[0].content[0].text,/not a soft preference/)
  for(const field of ['weekdays','time','durationMinutes'])assert.equal(Object.hasOwn(doc,field),false)
  assert.equal(row.revision,5);assert.ok(row.updated_at>=200)
  assert.deepEqual(f.db.prepare('SELECT * FROM occurrences').all(),before)
  const events=f.db.prepare('SELECT * FROM sync_outbox WHERE sequence>?').all(cursor)
  assert.equal(events.length,1);assert.equal(events[0].kind,'routines');assert.equal(events[0].revision,5);assert.equal(events[0].doc,row.doc)
  f.migrate();assert.deepEqual(f.get(r.id),row)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sync_outbox WHERE sequence>?').get(cursor).n,1)
 }finally{f.close()}
})

test('existing intents and rich notes win; discarded duration and hard time remain explicit',()=>{
 const f=fixture();try{
  const recurrenceIntent={text:'three times a week',status:'validated',kind:'flexible',frequency:3,period:'week',anchorDate:'2026-09-27'}
  const preferredTime={text:'before lunch',status:'context_required'}
  const paragraph={type:'paragraph',content:[{type:'text',text:'Original note',marks:[{type:'strong'}]}]}
  const r=routine({recurrenceIntent,preferredTime,durationIntent:'At least two hours',durationMinutes:30,time:'07:00',notes:{type:'doc',content:[paragraph]},archived:true})
  f.insert('routines',r);f.migrate();const doc=value(f.get(r.id))
  assert.deepEqual(doc.recurrenceIntent,recurrenceIntent);assert.deepEqual(doc.preferredTime,preferredTime)
  assert.equal(doc.durationIntent,r.durationIntent);assert.deepEqual(doc.notes.content[0],paragraph)
  assert.match(doc.notes.content[1].content[0].text,/exactly 07:00/)
  assert.match(doc.notes.content[1].content[0].text,/Legacy planned duration: 30 minutes/)
  assert.equal(doc.archived,true)
 }finally{f.close()}
})

test('unscheduled legacy templates gain no time or duration; intent-only rows are untouched',()=>{
 const f=fixture();try{
  const legacy=routine(),current=routine({recurrenceIntent:{text:'every monday',status:'validated',kind:'fixed',weekdays:[1],intervalWeeks:1,anchorDate:'2020-01-01'}})
  delete current.weekdays
  f.insert('routines',legacy);f.insert('routines',current)
  const before=f.get(current.id);f.migrate();const doc=value(f.get(legacy.id))
  assert.deepEqual(doc.notes,legacy.notes)
  for(const field of ['preferredTime','durationIntent','time','durationMinutes'])assert.equal(Object.hasOwn(doc,field),false)
  assert.deepEqual(f.get(current.id),before)
 }finally{f.close()}
})


test('template actual duration is preserved as a note, never assigned to occurrences',()=>{
 const f=fixture();try{
  const r=routine({actualDurationMinutes:90});delete r.weekdays
  r.recurrenceIntent={text:'every monday',status:'validated',kind:'fixed',weekdays:[1],intervalWeeks:1,anchorDate:'2020-01-01'}
  f.insert('routines',r);f.migrate();const doc=value(f.get(r.id))
  assert.equal(Object.hasOwn(doc,'actualDurationMinutes'),false)
  assert.equal(doc.notes.content[0].content[0].text,'Legacy actual duration recorded on template: 90 minutes; not assigned to any occurrence.')
  assert.deepEqual(doc.recurrenceIntent,r.recurrenceIntent)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM occurrences').get().n,0)
 }finally{f.close()}
})


for(const shape of ['maximum text','maximum feasible nodes'])test(`migration preserves valid legacy notes at ${shape} limit`,()=>{
 const f=fixture();try{
  const original=shape==='maximum text'
   ? {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x'}]}]}
   : {type:'doc',content:Array.from({length:4760},()=>({type:'paragraph'}))}
  if(shape==='maximum text')original.content[0].content[0].text='x'.repeat(100000-JSON.stringify(original).length+1)
  assert.ok(JSON.stringify(original).length<=100000)
  if(shape==='maximum text')assert.equal(JSON.stringify(original).length,100000)
  else assert.ok(JSON.stringify({...original,content:[...original.content,{type:'paragraph'}]}).length>100000)
  notes(original)
  const r=routine({notes:original,time:'23:59',timezone:'America/Argentina/ComodRivadavia',durationMinutes:1440,durationIntent:'Existing duration intent',actualDurationMinutes:10080})
  f.insert('routines',r);f.migrate();const doc=value(f.get(r.id))
  assert.deepEqual(doc.notes.content.slice(0,-1),original.content)
  const preserved=doc.notes.content.at(-1).content[0].text
  assert.match(preserved,/exactly 23:59 \(America\/Argentina\/ComodRivadavia\)/)
  assert.match(preserved,/Legacy planned duration: 1440 minutes/)
  assert.match(preserved,/Legacy actual duration recorded on template: 10080 minutes/)
  assert.ok(JSON.stringify(doc.notes).length-JSON.stringify(original).length<1024)
  assert.doesNotThrow(()=>validateResource('routines',doc))
  const snapshot={id:randomUUID(),routineId:r.id,date:'2026-09-28',completed:false,title:doc.title,notes:doc.notes,durationIntent:doc.durationIntent,templateRevision:5,edited:false,skipped:false}
  assert.doesNotThrow(()=>validateResource('occurrences',snapshot))
  assert.deepEqual(snapshot.notes,doc.notes)
 }finally{f.close()}
})
