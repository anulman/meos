// SPDX-License-Identifier: Apache-2.0
import { DomainError, canonical, uuid, date, timezone, validatePreferences, validateResource } from './domain.mjs'
import {addDays,localDay,scheduledInstant,horizon,occursOn} from './scheduling.mjs'
import {publishCalendarCache,readCalendarCache,listCalendarCache,readCalendarWindow} from './calendar-cache.mjs'
import {delegatedPrincipal} from './delegation.mjs'
import {operations,validateSchema} from './contract.mjs'
import {searchOperation,flushSearchIndex} from './search.mjs'

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
 let activeDb
 function tx(operation) {
  if(activeDb)return operation(activeDb)
  const transaction=begin();activeDb=transaction
  try {const result=operation(transaction);if(transaction.query("SELECT 1 FROM sqlite_master WHERE name='search_dirty'",[]).length)flushSearchIndex(transaction);transaction.commit();return result}
  catch(error){try{transaction.rollback()}catch{};throw error}
  finally{activeDb=undefined}
 }
 function owned(db,kind,owner,id) {return db.query(`SELECT ${columns} FROM ${table(kind)} WHERE owner_id=? AND id=?`,[blob(owner),blob(id)])[0]}
 function requireOwned(db,kind,owner,id) {const row=owned(db,kind,owner,id);if(!row)throw new DomainError('not_found','Record not found');return row}
 function foreign(db,kind,owner,value) {
  if(kind==='tasks'&&value.projectId){const row=requireOwned(db,'projects',owner,value.projectId);if(JSON.parse(row[0]).archived)throw new DomainError('validation','Choose an active project')}
  if(kind==='occurrences'){
   const r=JSON.parse(requireOwned(db,'routines',owner,value.routineId)[0]);horizon(value.date,r.timezone,now())
   if(value.schedule)horizon(localDay(scheduledInstant(value.schedule),r.timezone),r.timezone,now())
  }
  if(kind==='outcomes')requireOwned(db,'tasks',owner,value.taskId)
 }
 function write(db,kind,owner,value,expected) {
  revision(expected);foreign(db,kind,owner,value)
  if(kind==='occurrences'&&(value.title===undefined||value.notes===undefined))throw new DomainError('validation','Occurrence snapshot title and notes required')
  if(['occurrences','periodNotes','outcomes'].includes(kind)){
   const previous=JSON.parse(requireOwned(db,kind,owner,value.id)[0])
   const keys=kind==='occurrences'?['routineId','date','templateRevision']:kind==='outcomes'?['taskId','period']:['kind','period']
   if(keys.some(key=>canonical(previous[key])!==canonical(value[key])))throw new DomainError('validation','Natural key is immutable')
  }
  const rows=db.query(`UPDATE ${table(kind)} SET doc=?, revision=revision+1, updated_at=MAX(updated_at,?) WHERE owner_id=? AND id=? AND revision=? RETURNING ${columns}`,[canonical(value),now(),blob(owner),blob(value.id),expected])
  if(!rows.length){const row=requireOwned(db,kind,owner,value.id);throw new DomainError('conflict','Record changed',{expectedRevision:expected,currentRevision:Number(row[1])})}
  return envelope(rows[0])
 }
 function snapshot(db,kind,owner,value){
  if(kind!=='occurrences')return value
  const row=requireOwned(db,'routines',owner,value.routineId),r=JSON.parse(row[0])
  return validateResource(kind,{title:r.title,notes:r.notes,...(r.durationMinutes?{durationMinutes:r.durationMinutes}:{}),...Object.fromEntries(['location','durationIntent'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])),...(r.preferredTime?{preferredTime:r.preferredTime}:{}),skipped:false,edited:false,...value,templateRevision:Number(row[1])})
 }
 function checkTombstone(db,kind,owner,id){if(db.query('SELECT 1 FROM deletion_tombstones WHERE owner_id=? AND kind=? AND entity_id=?',[blob(owner),kind,id]).length)throw new DomainError('conflict','Deleted identity cannot be reused')}
 const api={
  calendarWindow(owner,input){return tx(db=>readCalendarWindow(db,owner,input,now()))},
  calendarCache(owner){return tx(db=>readCalendarCache(db,owner,now()))},
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
   let value=validateResource(kind,input)
   return tx(db=>{
    checkTombstone(db,kind,owner,value.id)
    value=snapshot(db,kind,owner,value)
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
  mcpGrant(identity){return tx(db=>{const grant=delegatedPrincipal(db,blob(identity),now());if(!grant)return null;const h=Array.from(grant.owner,b=>b.toString(16).padStart(2,'0')).join('');return {...grant,owner:h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}})},
  agentGrant(agent){return tx(db=>{const row=db.query('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',[blob(agent)])[0];if(!row)return null;const h=Array.from(row[0],b=>b.toString(16).padStart(2,'0')).join('');return {owner:h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20),scopes:JSON.parse(row[1]),active:!Number(row[3])&&Number(row[2])>now()}})},
  invoke(owner,name,input){
   const spec=Object.hasOwn(operations,name)?operations[name]:undefined;if(!spec)throw new DomainError('validation','Unknown operation')
   validateSchema(spec.input,input)
   return tx(db=>{
    if(name==='calendar_cache_publish'){const result=publishCalendarCache(db,owner,input);validateSchema(spec.output,result);return result}
    if(name==='list_calendar_events'){const result=listCalendarCache(db,owner,input,now());validateSchema(spec.output,result);return result}
    if(spec.write){const old=db.query('SELECT operation,payload,result FROM command_receipts WHERE owner_id=? AND command_key=?',[blob(owner),input.idempotencyKey])[0];if(old){if(old[0]!==name||old[1]!==canonical(input))throw new DomainError('conflict','Idempotency key payload mismatch');return JSON.parse(old[2])}}
    let result
    if(['search','configure_search','search_index_status','search_index_batch','search_index_commit','search_query_commit'].includes(name))result=searchOperation(db,owner,name,input,now())
    else if(name==='get_command_receipt'){const row=db.query('SELECT operation,payload,result FROM command_receipts WHERE owner_id=? AND command_key=?',[blob(owner),input.key])[0];result=row?{found:true,operation:row[0],input:JSON.parse(row[1]),result:JSON.parse(row[2])}:{found:false}}
    else if(name==='calendar_inventory')result=api.list(owner,input.kind,{cursor:input.cursor,limit:250})
    else if(name==='calendar_changes'){
     const rows=db.query("SELECT sequence,kind,entity_id,revision,operation FROM sync_outbox WHERE owner_id=? AND sequence>? AND kind IN ('tasks','occurrences') ORDER BY sequence LIMIT 100",[blob(owner),input.cursor]);
     result={items:rows.map(r=>({sequence:r[0],kind:r[1],id:r[2],revision:r[3],deleted:r[4]==='delete'})),cursor:rows.at(-1)?.[0]??input.cursor}
    }else if(name==='calendar_current'||name==='get_current'){
     const row=owned(db,input.kind,owner,input.id);const tombstone=db.query('SELECT revision FROM deletion_tombstones WHERE owner_id=? AND kind=? AND entity_id=?',[blob(owner),input.kind,input.id])[0];
     if(!row&&!tombstone)throw new DomainError('not_found','Sync entity not found');result={record:row?envelope(row):null,deleted:!row,revision:row?Number(row[1]):Number(tombstone[0])};if(name==='get_current'){const value=result.record?.value;result.scheduledAt=value?.schedule?new Date(scheduledInstant(value.schedule)).toISOString():null}
    }else if(name==='calendar_apply'){
     const old=envelope(requireOwned(db,input.kind,owner,input.id));if(old.revision!==input.expectedRevision)throw new DomainError('conflict','Local event changed');
     const value={...old.value};if(input.schedule===null)delete value.schedule;else value.schedule=input.schedule;
     for(const k of ['title','location','notes','durationMinutes'])if(input[k]!==undefined)value[k]=input[k];
     if(input.kind==='occurrences')value.edited=true;
     result=api.update(owner,input.kind,value,input.expectedRevision);
    }else if(name==='list_agenda'){
     date(input.date);timezone(input.timezone)
     const items=[]
     for(const kind of ['tasks','occurrences'])for(const row of db.query(`SELECT ${columns} FROM ${table(kind)} WHERE owner_id=? AND json_type(doc,'$.schedule')='object'`,[blob(owner)])){
      const record=envelope(row),v=record.value
      if(!v.archived&&!v.skipped&&localDay(scheduledInstant(v.schedule),input.timezone)===input.date)items.push({kind,...record,scheduledAt:new Date(scheduledInstant(v.schedule)).toISOString()})
     }
     items.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.value.id.localeCompare(b.value.id));result={items}
    }else if(name==='create_task'){checkTombstone(db,'tasks',owner,input.value.id);result=api.create(owner,'tasks',input.value)}
    else if(name==='update_routine')result=api.update(owner,'routines',input.value,input.expectedRevision)
    else if(name==='move_occurrence'||name==='complete_occurrence'){
     const previous=envelope(requireOwned(db,'occurrences',owner,input.id)),value={...previous.value,edited:true}
     if(name==='move_occurrence'){if(input.schedule===null)delete value.schedule;else value.schedule=input.schedule;for(const k of ['title','notes','durationMinutes','location','durationIntent','actualDurationMinutes','skipped'])if(input[k]!==undefined)value[k]=input[k]}
     else value.completed=input.completed
     result=api.update(owner,'occurrences',value,input.expectedRevision)
    }else if((name==='materialize_routine'||name==='calendar_materialize')){
     const row=envelope(requireOwned(db,'routines',owner,input.routineId)),r=row.value,today=localDay(now(),r.timezone)
     date(input.through);horizon(input.through,r.timezone,now());if(input.through<today)throw new DomainError('validation','Materialization starts at current local day')
     const items=[];if(!r.archived)for(let day=today;day<=input.through;day=addDays(day,1)){
      if(!occursOn(r,day))continue
      const existing=db.query(`SELECT ${columns} FROM occurrences WHERE owner_id=? AND routine_id=? AND occurrence_date=?`,[blob(owner),r.id,day])[0]
      if(existing){items.push(envelope(existing));continue}
      // Caller provides stable IDs indexed by original recurrence date. No guest RNG.
      const id=input.ids[day];if(!id)throw new DomainError('validation','Missing stable ID for recurrence slot')
      const value={id,routineId:r.id,date:day,completed:false}
      // On DST gap/fold leave unscheduled for explicit scheduler resolution, never guess.
      if(r.time){const schedule={date:day,time:r.time,timezone:r.timezone};try{scheduledInstant(schedule);value.schedule=schedule}catch(error){if(!(error instanceof DomainError))throw error}}
      items.push(api.create(owner,'occurrences',value))
     }
     result={items}
    }else if(name==='preview_schedule'||name==='apply_schedule'){
     const seen=new Set(),items=[]
     for(const item of input.changes){const key=item.kind+':'+item.id;if(seen.has(key))throw new DomainError('validation','Duplicate schedule target');seen.add(key)
      const old=envelope(requireOwned(db,item.kind,owner,item.id));if(old.revision!==item.expectedRevision)throw new DomainError('conflict','Record changed',{currentRevision:old.revision})
      const value={...old.value};if(item.schedule===null)delete value.schedule;else value.schedule=item.schedule
      if(item.kind==='occurrences')value.edited=true
      const valid=validateResource(item.kind,value);foreign(db,item.kind,owner,valid)
      items.push(name==='apply_schedule'?write(db,item.kind,owner,valid,item.expectedRevision):{...old,value:valid})
     }
     result={items,applied:name==='apply_schedule'}
    }else if(name==='delete_task'){
     const old=envelope(requireOwned(db,'tasks',owner,input.id));if(old.revision!==input.expectedRevision)throw new DomainError('conflict','Record changed')
     if(db.query('SELECT 1 FROM outcomes WHERE owner_id=? AND task_id=?',[blob(owner),input.id]).length)throw new DomainError('conflict','Remove outcome associations before deleting task')
     db.execute('DELETE FROM tasks WHERE owner_id=? AND id=?',[blob(owner),blob(input.id)]);result={deleted:true,id:input.id}
    }else if(name==='bind_external_event'){
     const row=envelope(requireOwned(db,input.kind,owner,input.entityId));if(row.revision!==input.expectedRevision)throw new DomainError('conflict','Record changed')
     const old=db.query('SELECT kind,entity_id,remote_revision FROM external_events WHERE owner_id=? AND provider=? AND calendar_id=? AND event_id=?',[blob(owner),input.provider,input.calendarId,input.eventId])[0]
     if(old&&(old[0]!==input.kind||old[1]!==input.entityId))throw new DomainError('conflict','External identity already mapped')
     if(old&&old[2]!==input.remoteRevision&&input.expectedRemoteRevision!==old[2]||!old&&input.expectedRemoteRevision!==undefined)throw new DomainError('conflict','Remote mapping revision changed')
     const reverse=db.query('SELECT event_id FROM external_events WHERE owner_id=? AND provider=? AND calendar_id=? AND kind=? AND entity_id=?',[blob(owner),input.provider,input.calendarId,input.kind,input.entityId])[0]
     if(reverse&&reverse[0]!==input.eventId)throw new DomainError('conflict','Entity already mapped')
     db.execute('INSERT INTO external_events VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(owner_id,provider,calendar_id,event_id) DO UPDATE SET remote_revision=excluded.remote_revision',[blob(owner),input.provider,input.calendarId,input.eventId,input.kind,input.entityId,input.remoteRevision]);result={bound:true}
    }else throw new DomainError('validation','Unsupported operation')
    validateSchema(spec.output,result)
    if(spec.write)db.execute('INSERT INTO command_receipts VALUES(?,?,?,?,?,?)',[blob(owner),input.idempotencyKey,name,canonical(input),canonical(result),now()])
    return result
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
   let value=validateResource(kind,input)
   return tx(db=>{
    foreign(db,kind,owner,value)
    const conditions=kind==='occurrences'?'routine_id=? AND occurrence_date=?':'kind=? AND start_date=? AND end_date=?'
    const params=kind==='occurrences'?[value.routineId,value.date]:[value.kind,value.period.start,value.period.end]
    const row=db.query(`SELECT ${columns}, uuid FROM ${table(kind)} WHERE owner_id=? AND ${conditions}`,[blob(owner),...params])[0]
    if(row){
     const canonicalValue={...JSON.parse(row[0]),...value,id:row[4]}
     // Repeating an identical completion/note command is harmless, even after uncertain success.
     if(canonical(JSON.parse(row[0]))===canonical(canonicalValue))return envelope(row)
     if(expected===0)throw new DomainError('conflict','Natural key already exists')
     return write(db,kind,owner,canonicalValue,expected)
    }
    if(expected!==0)throw new DomainError('conflict','Expected record no longer exists')
    value=snapshot(db,kind,owner,value)
    const timestamp=now()
    return envelope(db.query(`INSERT INTO ${table(kind)}(id,owner_id,doc,revision,created_at,updated_at) VALUES(?,?,?,1,?,?) RETURNING ${columns}`,[blob(value.id),blob(owner),canonical(value),timestamp,timestamp])[0])
   })
  }
 }
 return api
}
