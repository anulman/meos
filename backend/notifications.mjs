// SPDX-License-Identifier: Apache-2.0
// All authority, planning, leasing, read and ack effects share one DB transaction.
import {DomainError,uuid,canonical} from './domain.mjs'
import {scheduledInstant} from './scheduling.mjs'
const blob=id=>Uint8Array.from(uuid(id).replaceAll('-','').match(/../g).map(x=>parseInt(x,16)))
const fail=(code,message)=>{throw new DomainError(code,message)}
const day=86400000,retention=7*day,leaseMs=120000
const offsets=value=>{if(!Array.isArray(value)||value.length>32||value.some(x=>!Number.isFinite(x)||x<=0||x>10080||!Number.isSafeInteger(x*60000)))fail('validation','Invalid pre-offsets');return [...new Set(value)].sort((a,b)=>a-b)}
export function notificationPreferences(value){
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['preMinutes','instances','routines'].includes(k)))fail('validation','Invalid preferences')
 const result={};if(value.preMinutes!==undefined)result.preMinutes=offsets(value.preMinutes)
 for(const key of ['instances','routines'])if(value[key]!==undefined){if(!value[key]||typeof value[key]!=='object'||Array.isArray(value[key])||Object.keys(value[key]).length>1000)fail('validation','Invalid overrides');result[key]={};for(const [id,v]of Object.entries(value[key]))result[key][uuid(id)]=offsets(v)}
 return result
}
export function createNotifications({begin,now=Date.now}){
 return {invoke(agent,input){
  if(!input||!['poll','ack','configure','status','reconcile'].includes(input.op)||Object.keys(input).some(k=>!['op','consumer','limit','ackToken','preferences'].includes(k)))fail('validation','Invalid notification command')
  if(typeof input.consumer!=='string'||! /^[a-f0-9]{32}$/.test(input.consumer))fail('validation','Consumer identity required')
  const limit=input.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)fail('validation','Invalid batch limit')
  const db=begin(),time=now(),aid=blob(agent)
  try{
   const grant=db.query('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',[aid])[0]
   if(!grant||Number(grant[3])||Number(grant[2])<=time||!JSON.parse(grant[1]).includes('notifications:consume'))fail('forbidden','Notification grant denied')
   const owner=grant[0]
   let state=db.query('SELECT consumer,fence,lease_until,planned_at,preferences,gap FROM notification_consumers WHERE agent_id=?',[aid])[0]
   if(!state){db.execute('INSERT INTO notification_consumers(agent_id,consumer,fence,lease_until,planned_at) VALUES(?,?,1,?,?)',[aid,input.consumer,time+leaseMs,time]);state=[input.consumer,1,time+leaseMs,time,'{}',0]}
   if(state[0]!==input.consumer&&state[2]>time)fail('conflict','Consumer lease held')
   if(state[0]!==input.consumer||state[2]<=time){state[1]++;db.execute('UPDATE notification_consumers SET consumer=?,fence=? WHERE agent_id=?',[input.consumer,state[1],aid])}
   db.execute('UPDATE notification_consumers SET lease_until=? WHERE agent_id=?',[time+leaseMs,aid])
   if(input.op==='configure'){
    state[4]=canonical(notificationPreferences(input.preferences));db.execute('UPDATE notification_consumers SET preferences=? WHERE agent_id=?',[state[4],aid])
   }
   const preferences=JSON.parse(state[4]),buckets=new Map()
   // Full authorized snapshot coalesces shared instants, never per-change append.
   // Only explicitly timed planner records with an explicit duration emit signals.
   const rows=db.query("SELECT 'tasks',doc,revision FROM tasks WHERE owner_id=? AND json_type(doc,'$.schedule')='object' UNION ALL SELECT 'occurrences',doc,revision FROM occurrences WHERE owner_id=? AND json_type(doc,'$.schedule')='object' LIMIT 5001",[owner,owner])
   if(rows.length>5000)fail('unavailable','Notification snapshot capacity exceeded')
   const missingDurations=rows.filter(([,raw])=>{const v=JSON.parse(raw);return !v.durationMinutes&&!v.archived&&!v.skipped&&!v.completed}).length
   const routines=new Map(db.query('SELECT uuid,doc FROM routines WHERE owner_id=?',[owner]).map(r=>[r[0],JSON.parse(r[1])]))
   for(const [kind,raw,revision]of rows){
    const v=JSON.parse(raw),r=routines.get(v.routineId)
    if(v.archived||v.skipped||v.completed||r?.archived||!v.durationMinutes)continue
    const start=scheduledInstant(v.schedule),end=start+v.durationMinutes*60000
    const add=(at,type)=>{if(type==='pre'&&start<=time)return;if(at<time-retention||at>time+7*day)return;const key=String(at)+(type==='pre'?':pre':':boundary');let b=buckets.get(key);if(!b){b={at,type:type==='pre'?'pre':'boundary',starts:[],ends:[],upcoming:[]};buckets.set(key,b)}b[type==='pre'?'upcoming':type==='start'?'starts':'ends'].push({kind,id:v.id,revision,title:v.title,start,end})}
    add(start,'start');add(end,'end')
    const pre=preferences.instances?.[v.id]??preferences.routines?.[v.routineId]??preferences.preMinutes??[15]
    for(const m of pre)add(start-m*60000,'pre')
   }
   const previousBuckets=new Set(db.query('SELECT due,payload FROM notification_events WHERE agent_id=? AND active=1 AND acked=0',[aid]).map(([due,payload])=>String(due)+':'+JSON.parse(payload).type))
   db.execute('UPDATE notification_events SET active=0 WHERE agent_id=?',[aid])
   for(const b of buckets.values()){
    for(const k of ['starts','ends','upcoming'])b[k].sort((a,z)=>(a.kind+':'+a.id).localeCompare(z.kind+':'+z.id))
    const payload=canonical(b),bucket=payload
    const old=db.query('SELECT id FROM notification_events WHERE agent_id=? AND bucket=?',[aid,bucket])[0]
    if(old)db.execute('UPDATE notification_events SET active=1 WHERE agent_id=? AND id=?',[aid,old[0]])
    else if(b.at>=state[3]||previousBuckets.has(String(b.at)+':'+b.type))db.execute('INSERT INTO notification_events(agent_id,bucket,due,payload) VALUES(?,?,?,?)',[aid,bucket,b.at,payload])
   }
   // Explicit gap signal rather than quietly pretending retained history is complete.
   const expired=db.query('SELECT 1 FROM notification_events WHERE agent_id=? AND acked=0 AND due<? LIMIT 1',[aid,time-retention]).length
   const gap=input.op==='reconcile'?false:Boolean(state[5]||expired||time-state[3]>retention)
   db.execute('DELETE FROM notification_events WHERE agent_id=? AND due<?',[aid,time-retention])
   db.execute('DELETE FROM notification_batches WHERE agent_id=? AND created_at<?',[aid,time-retention])
   db.execute('UPDATE notification_consumers SET planned_at=?,gap=? WHERE agent_id=?',[time,gap?1:0,aid])
   let result
   if(input.op==='ack'){
    if(typeof input.ackToken!=='string'||! /^[a-f0-9]{64}$/.test(input.ackToken))fail('validation','Invalid acknowledgement')
    const batch=db.query('SELECT ids,acked FROM notification_batches WHERE token=? AND agent_id=? AND fence=?',[input.ackToken,aid,state[1]])[0]
    if(!batch)fail('conflict','Unknown or fenced batch')
    if(!batch[1]){for(const id of JSON.parse(batch[0]))db.execute('UPDATE notification_events SET acked=1 WHERE agent_id=? AND id=?',[aid,id]);db.execute('UPDATE notification_batches SET acked=1 WHERE token=?',[input.ackToken])}
    result={acked:true}
   }else if(input.op==='status'||input.op==='configure'||input.op==='reconcile')result={fence:state[1],leaseUntil:time+leaseMs,retentionGap:gap,preferences,unsignallableMissingDuration:missingDurations}
   else{
    const items=db.query('SELECT id,payload FROM notification_events WHERE agent_id=? AND active=1 AND acked=0 AND due<=? ORDER BY due,id LIMIT ?',[aid,time,limit]).map(([id,payload])=>({id,...JSON.parse(payload),delayed:JSON.parse(payload).at<time}))
    let ackToken=null
    if(items.length){const ids=canonical(items.map(v=>v.id));const existing=db.query('SELECT token FROM notification_batches WHERE agent_id=? AND fence=? AND ids=? AND acked=0',[aid,state[1],ids])[0];ackToken=existing?.[0]??db.query('INSERT INTO notification_batches(agent_id,fence,ids,created_at) VALUES(?,?,?,?) RETURNING token',[aid,state[1],ids,time])[0][0]}
    result={items,ackToken,retryAfterMs:items.length?0:1000,retentionGap:gap,fence:state[1]}
   }
   db.commit();return result
  }catch(e){try{db.rollback()}catch{};throw e}
 }}
}
export function createNotificationGuestHandler({notifications,origin,readText}){
 return (request,user)=>{
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  try{
   if(!user||request.headers.get('Cookie')!==null||!/^Bearer [A-Za-z0-9._~-]+$/.test(request.headers.get('Authorization')??''))return response({error:'unauthenticated'},401)
   if(request.method!=='POST'||request.headers.get('Origin')!==null&&request.headers.get('Origin')!==origin)return response({error:'forbidden'},403)
   return response(notifications.invoke(user.id,JSON.parse(readText(request,150000))))
  }catch(e){return response({error:e instanceof DomainError?e.code:'unavailable'},({validation:400,forbidden:403,conflict:409})[e.code]??503)}
 }
}
