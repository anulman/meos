// SPDX-License-Identifier: Apache-2.0
// Lifecycle primitives only: host owns durable scheduling and HTTPS transport.
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto'
export class CalendarWatchError extends Error {
 constructor(code){super(({configuration:'Calendar notifications are not configured.',forbidden:'Notification rejected.',unavailable:'Calendar notification service unavailable.',reconnect_required:'Reconnect Google Calendar.',busy:'Calendar channel renewal is in progress.',invalid:'Invalid channel operation.'})[code]??'Calendar notification failed.');this.name='CalendarWatchError';this.code=code}
}
const fail=code=>{throw new CalendarWatchError(code)}
const text=(s,max=2048)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s)
const digest=s=>createHash('sha256').update(s).digest('hex')
const equal=(a,b)=>text(a)&&text(b)&&timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)))
const safe=async fn=>{try{return await fn()}catch(e){if(e instanceof CalendarWatchError)throw e;fail('unavailable')}}
/** Required store methods: putIfAbsent(id,record), get(id), and
 * transact(id,fn). transact MUST atomically apply fn(current)->{record,result}
 * and return result, with no side effects retried outside its transaction.
 * The record's dirtyVersion/ackVersion IS a durable incremental-fetch queue.
 * Worker captures dirtyVersion before pull, durably applies complete pages and
 * sync token, then acknowledge(version). A newer notification remains dirty.
 * wake(id) is optional best-effort latency optimization, NEVER queue durability.
 * Periodic reconciliation must consume dirty records even after lost wakeups.
 * Store is protected: records include channel bearer tokens; don't expose them.
 * Provider watch/stop use fixed Google endpoints, injected credentials/broker.
 */
export function createCalendarWatch({config,store,provider,wake=async()=>{},now=Date.now,id=randomUUID,random=randomBytes}) {
 config=config&&Object.freeze({...config})
 if(!config||!text(config.owner,256)||!text(config.primaryCalendarId)||!text(config.managedCalendarId)||config.primaryCalendarId===config.managedCalendarId)fail('configuration')
 let url;try{url=new URL(config.address)}catch{fail('configuration')}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/calendar/google/notifications')fail('configuration')
 for(const name of ['putIfAbsent','get','transact'])if(typeof store?.[name]!=='function')fail('configuration')
 for(const fn of [provider?.watch,provider?.stop,wake,now,id,random])if(typeof fn!=='function')fail('configuration')
 const clock=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0)fail('unavailable');return n}
 const notify=async channelId=>{try{await wake(channelId)}catch{/* durable dirtyVersion survives */}}
 const roleCalendar=role=>role==='primary'?config.primaryCalendarId:role==='managed'?config.managedCalendarId:fail('invalid')
 const owned=record=>record&&record.owner===config.owner&&record.calendarId===roleCalendar(record.role)
 const update=(channelId,fn)=>store.transact(channelId,record=>{if(!owned(record))fail('forbidden');return fn(record)})
 async function start(role){
  const calendarId=roleCalendar(role),channelId=id(),bytes=random(32),createdAt=clock()
  if(!text(channelId,64)||!/^[-a-zA-Z0-9_]+$/.test(channelId)||!(bytes instanceof Uint8Array)||bytes.length!==32)fail('unavailable')
  const token=Buffer.from(bytes).toString('base64url'),requestedExpiration=createdAt+86400000
  const record={id:channelId,owner:config.owner,role,calendarId,token,phase:'registering',createdAt,expiresAt:requestedExpiration,pending:[],seen:[],dirtyVersion:0,ackVersion:0,renewing:false}
  if(await store.putIfAbsent(channelId,record)!==true)fail('unavailable')
  let receipt
  try{receipt=await provider.watch({calendarId,id:channelId,type:'web_hook',address:config.address,token,expiration:String(requestedExpiration)})}
  catch(e){await update(channelId,r=>({record:{...r,phase:e?.status===401?'reconnect_required':'uncertain'},result:null}));fail(e?.status===401?'reconnect_required':'unavailable')}
  const expiration=Number(receipt?.expiration)
  if(receipt?.id!==channelId||!text(receipt?.resourceId)||!Number.isSafeInteger(expiration)||expiration<=clock()){
   await update(channelId,r=>({record:{...r,phase:'uncertain'},result:null}));fail('unavailable')
  }
  const active=await update(channelId,r=>{
   if(r.phase!=='registering')fail('unavailable')
   const relevant=r.pending.filter(p=>p.resourceId===receipt.resourceId),expiresAt=Math.min(expiration,r.expiresAt)
   const next={...r,resourceId:receipt.resourceId,expiresAt,renewAt:Math.max(clock(),expiresAt-Math.min(3600000,Math.floor((expiresAt-r.createdAt)/5))),phase:'active',pending:[],seen:relevant.map(p=>p.key).slice(-256),dirtyVersion:r.dirtyVersion+1}
   // Always fetch on registration, even if initial sync notification was lost.
   return {record:next,result:{channelId,expiresAt,renewAt:next.renewAt}}
  });await notify(channelId);return active
 }
 return {
  start:role=>safe(()=>start(role)),
  notification:input=>safe(async()=>{
   const {channelId,token,resourceId,messageNumber,resourceState}=input??{}
   if(!text(channelId,64)||!text(token,128)||!text(resourceId)||!text(messageNumber,100)||!/^\d{1,100}$/.test(messageNumber)||BigInt(messageNumber)<1n||!['sync','exists','not_exists'].includes(resourceState))fail('forbidden')
   const key=digest(resourceId+'\n'+BigInt(messageNumber).toString())
   const result=await update(channelId,r=>{
    if(!equal(token,r.token)||clock()>=r.expiresAt||!['registering','active','retiring'].includes(r.phase))fail('forbidden')
    if(r.phase==='registering'){
     if(r.pending.some(p=>p.key===key))return {record:r,result:{accepted:true,duplicate:true}}
     if(r.pending.length>=32)fail('unavailable')
     return {record:{...r,pending:[...r.pending,{resourceId,key}]},result:{accepted:true,pendingRegistration:true}}
    }
    if(!equal(resourceId,r.resourceId))fail('forbidden')
    if(r.seen.includes(key))return {record:r,result:{accepted:true,duplicate:true}}
    if(!Number.isSafeInteger(r.dirtyVersion+1))fail('unavailable')
    // Do not use message high-water mark: Google numbers are nonsequential and
    // delivery may be reordered. Distinct older signals must still dirty queue.
    return {record:{...r,seen:[...r.seen,key].slice(-256),dirtyVersion:r.dirtyVersion+1},result:{accepted:true,queued:true}}
   });if(result.queued)await notify(channelId);return result
  }),
  acknowledge:(channelId,version)=>safe(()=>update(channelId,r=>{
   if(!Number.isSafeInteger(version)||version<0||version>r.dirtyVersion)fail('invalid')
   return {record:{...r,ackVersion:Math.max(r.ackVersion,version)},result:{pending:r.dirtyVersion>Math.max(r.ackVersion,version)}}
  })),
  reconcile:channelId=>safe(async()=>{
   // Host schedules this independently of webhooks. Lost notifications must
   // not leave an otherwise healthy calendar permanently stale.
   await update(channelId,r=>{
    if(!['active','retiring'].includes(r.phase)||!Number.isSafeInteger(r.dirtyVersion+1))fail('invalid')
    return {record:{...r,dirtyVersion:r.dirtyVersion+1},result:null}
   });await notify(channelId);return {queued:true}
  }),
  renew:channelId=>safe(async()=>{
   const renewalId=id()
   if(!text(renewalId,64))fail('unavailable')
   const role=await update(channelId,r=>{if(r.phase!=='active'||r.renewing&&clock()<r.renewingUntil)fail('busy');return {record:{...r,renewing:true,renewalId,renewingUntil:clock()+60000},result:r.role}})
   let replacement;try{replacement=await start(role)}catch(e){await update(channelId,r=>({record:r.renewalId===renewalId?{...r,renewing:false}:r,result:null}));throw e}
   await update(channelId,r=>{
    if(r.phase!=='active'||r.renewalId!==renewalId)fail('busy')
    return {record:{...r,phase:'retiring',renewing:false,successor:replacement.channelId,stopPending:true},result:null}
   })
   // Keep overlap: old channel remains valid until explicit stop/expiry, while
   // replacement registration has already durably queued an incremental pull.
   return replacement
  }),
  stopRetired:channelId=>safe(async()=>{
   const r=await store.get(channelId);if(!owned(r)||r.phase!=='retiring'||!r.successor)fail('invalid')
   const replacement=await store.get(r.successor);if(!owned(replacement)||replacement.phase!=='active'||replacement.expiresAt<=clock())fail('unavailable')
   try{await provider.stop({id:channelId,resourceId:r.resourceId})}catch(e){if(![404,410].includes(e?.status))fail(e?.status===401?'reconnect_required':'unavailable')}
   await update(channelId,current=>({record:{...current,phase:'stopped',stopPending:false},result:null}));return {stopped:true}
  }),
  status:channelId=>safe(async()=>{
   const r=await store.get(channelId);if(!owned(r))fail('forbidden')
   return {channelId,role:r.role,phase:r.phase,expiresAt:r.expiresAt,renewAt:r.renewAt??null,needsRenewal:r.phase==='active'&&clock()>=(r.renewAt??r.expiresAt),expired:clock()>=r.expiresAt,pending:r.dirtyVersion>r.ackVersion,dirtyVersion:r.dirtyVersion,ackVersion:r.ackVersion,stopPending:!!r.stopPending}
  }),
 }
}
