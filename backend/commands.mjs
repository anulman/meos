// SPDX-License-Identifier: Apache-2.0
import { DomainError, canonical, uuid, validatePreferences, validateResource } from './domain.mjs'

const tables={projects:'projects',tasks:'tasks',routines:'routines',occurrences:'occurrences',outcomes:'outcomes',periodNotes:'period_notes'}
const table = kind => {const value=tables[kind];if(!value)throw new DomainError('validation','Unsupported resource');return value}
const blob = value => Uint8Array.from(uuid(value).replaceAll('-','').match(/../g).map(hex=>parseInt(hex,16)))
function revision(value,allowZero=false) {if(!Number.isSafeInteger(value)||value<(allowZero?0:1))throw new DomainError('validation','Expected revision required')}
function envelope(row) {return {value:JSON.parse(row[0]),revision:Number(row[1]),createdAt:new Date(Number(row[2])).toISOString(),updatedAt:new Date(Number(row[3])).toISOString()}}
const columns='doc, revision, created_at, updated_at'

/** Database port matches TrailBase WASM Transaction's query/execute/commit/rollback semantics.
 * The session owner MUST come from the runtime-authenticated context, never request JSON.
 * No network service is started here. SQLite tests exercise this same command implementation.
 */
export function createCommands({begin,now=()=>Date.now()}) {
 function tx(operation) {
  const transaction=begin()
  try {const result=operation(transaction);transaction.commit();return result}
  catch(error){try{transaction.rollback()}catch{};throw error}
 }
 function owned(db,kind,owner,id) {return db.query(`SELECT ${columns} FROM ${table(kind)} WHERE owner_id=? AND id=?`,[blob(owner),blob(id)])[0]}
 function requireOwned(db,kind,owner,id) {const row=owned(db,kind,owner,id);if(!row)throw new DomainError('not_found','Record not found');return row}
 function foreign(db,kind,owner,value) {
  if(kind==='tasks'&&value.projectId){const row=requireOwned(db,'projects',owner,value.projectId);if(JSON.parse(row[0]).archived)throw new DomainError('validation','Choose an active project')}
  if(kind==='occurrences')requireOwned(db,'routines',owner,value.routineId)
  if(kind==='outcomes')requireOwned(db,'tasks',owner,value.taskId)
 }
 function write(db,kind,owner,value,expected) {
  revision(expected);foreign(db,kind,owner,value)
  if(['occurrences','periodNotes','outcomes'].includes(kind)){
   const previous=JSON.parse(requireOwned(db,kind,owner,value.id)[0])
   const keys=kind==='occurrences'?['routineId','date']:kind==='outcomes'?['taskId','period']:['kind','period']
   if(keys.some(key=>canonical(previous[key])!==canonical(value[key])))throw new DomainError('validation','Natural key is immutable')
  }
  const rows=db.query(`UPDATE ${table(kind)} SET doc=?, revision=revision+1, updated_at=MAX(updated_at,?) WHERE owner_id=? AND id=? AND revision=? RETURNING ${columns}`,[canonical(value),now(),blob(owner),blob(value.id),expected])
  if(!rows.length){const row=requireOwned(db,kind,owner,value.id);throw new DomainError('conflict','Record changed',{expectedRevision:expected,currentRevision:Number(row[1])})}
  return envelope(rows[0])
 }
 const api={
  get(owner,kind,id){return tx(db=>envelope(requireOwned(db,kind,owner,id)))},
  list(owner,kind,{cursor,limit=100}={}) {
   if(!Number.isSafeInteger(limit)||limit<1||limit>250)throw new DomainError('validation','Invalid page limit')
   if(cursor!==undefined)uuid(cursor,'cursor')
   return tx(db=>{
    const rows=db.query(`SELECT ${columns}, uuid FROM ${table(kind)} WHERE owner_id=? AND uuid>? ORDER BY uuid LIMIT ?`,[blob(owner),cursor??'',limit+1])
    return {items:rows.slice(0,limit).map(envelope),...(rows.length>limit?{nextCursor:rows[limit-1][4]}:{})}
   })
  },
  create(owner,kind,input) {
   const value=validateResource(kind,input)
   return tx(db=>{
    foreign(db,kind,owner,value)
    const timestamp=now()
    const rows=db.query(`INSERT INTO ${table(kind)} (id,owner_id,doc,revision,created_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT DO NOTHING RETURNING ${columns}`,[blob(value.id),blob(owner),canonical(value),timestamp,timestamp])
    if(rows.length)return envelope(rows[0])
    const old=owned(db,kind,owner,value.id)
    if(old&&canonical(JSON.parse(old[0]))===canonical(value))return envelope(old)
    throw new DomainError('conflict','Stable identity or natural key already exists')
   })
  },
  update(owner,kind,input,expected) {
   const value=validateResource(kind,input)
   return tx(db=>write(db,kind,owner,value,expected))
  },
  archiveProject(owner,id,expected) {
   return tx(db=>{
    const row=requireOwned(db,'projects',owner,id)
    const affectedTaskIds=db.query('SELECT uuid FROM tasks WHERE owner_id=? AND project_id=? ORDER BY uuid',[blob(owner),id]).map(row=>row[0])
    const project=write(db,'projects',owner,{...JSON.parse(row[0]),archived:true},expected)
    return {project,affectedTaskIds}
   })
  },
  removeOutcome(owner,id,expected) {
   revision(expected)
   return tx(db=>{
    const row=requireOwned(db,'outcomes',owner,id)
    if(Number(row[1])!==expected)throw new DomainError('conflict','Record changed')
    const n=db.execute('DELETE FROM outcomes WHERE owner_id=? AND id=? AND revision=?',[blob(owner),blob(id),expected])
    if(n!==1)throw new DomainError('conflict','Record changed')
   })
  },
  getPreferences(owner) {
   return tx(db=>{const row=db.query(`SELECT ${columns} FROM preferences WHERE owner_id=?`,[blob(owner)])[0];if(!row)throw new DomainError('not_found','Preferences not found');return envelope(row)})
  },
  savePreferences(owner,input,expected) {
   const value=validatePreferences(input);revision(expected,true)
   return tx(db=>{
    const timestamp=now()
    const rows=expected===0
     ? db.query(`INSERT INTO preferences(owner_id,doc,revision,created_at,updated_at) VALUES (?,?,1,?,?) ON CONFLICT DO NOTHING RETURNING ${columns}`,[blob(owner),canonical(value),timestamp,timestamp])
     : db.query(`UPDATE preferences SET doc=?,revision=revision+1,updated_at=MAX(updated_at,?) WHERE owner_id=? AND revision=? RETURNING ${columns}`,[canonical(value),timestamp,blob(owner),expected])
    if(!rows.length)throw new DomainError('conflict','Preferences changed')
    return envelope(rows[0])
   })
  },
  saveNatural(owner,kind,input,expected) {
   if(!['occurrences','periodNotes'].includes(kind))throw new DomainError('validation','Unsupported natural key')
   revision(expected,true)
   const value=validateResource(kind,input)
   return tx(db=>{
    foreign(db,kind,owner,value)
    const conditions=kind==='occurrences'?'routine_id=? AND occurrence_date=?':'kind=? AND start_date=? AND end_date=?'
    const params=kind==='occurrences'?[value.routineId,value.date]:[value.kind,value.period.start,value.period.end]
    const row=db.query(`SELECT ${columns}, uuid FROM ${table(kind)} WHERE owner_id=? AND ${conditions}`,[blob(owner),...params])[0]
    if(row){
     const canonicalValue={...value,id:row[4]}
     // Repeating an identical completion/note command is harmless, even after uncertain success.
     if(canonical(JSON.parse(row[0]))===canonical(canonicalValue))return envelope(row)
     if(expected===0)throw new DomainError('conflict','Natural key already exists')
     return write(db,kind,owner,canonicalValue,expected)
    }
    if(expected!==0)throw new DomainError('conflict','Expected record no longer exists')
    const timestamp=now()
    return envelope(db.query(`INSERT INTO ${table(kind)}(id,owner_id,doc,revision,created_at,updated_at) VALUES(?,?,?,1,?,?) RETURNING ${columns}`,[blob(value.id),blob(owner),canonical(value),timestamp,timestamp])[0])
   })
  }
 }
 return api
}
