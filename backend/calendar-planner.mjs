// SPDX-License-Identifier: Apache-2.0
// Revision-aware bridge between existing planner entities and app-calendar events.
import {createHash} from 'node:crypto';
import {scheduledInstant} from './scheduling.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const stableId=value=>{const h=hash(value);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`};
const plain=notes=>(notes?.content??[]).map(n=>n.type==='text'?n.text??'':plain(n)).join(notes?.type==='doc'?'\n':'');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function plannerEvent(record){
 const v=record?.value;if(!v?.schedule||v.archived||v.skipped)return null;
 // No fabricated duration: unresolved duration remains unsynced and visible.
 if(!v.durationMinutes)return undefined;
 const start=scheduledInstant(v.schedule);
 return {summary:v.title,description:plain(v.notes),location:v.location??'',start:{dateTime:new Date(start).toISOString()},end:{dateTime:new Date(start+v.durationMinutes*60000).toISOString()}};
}
function remoteEvent(e){if(!e||e.status==='cancelled')return null;if(!e.start?.dateTime||!e.end?.dateTime||!Number.isFinite(Date.parse(e.start.dateTime))||!Number.isFinite(Date.parse(e.end.dateTime)))return undefined;return {summary:e.summary??'(Untitled)',description:e.description??'',location:e.location??'',start:{dateTime:new Date(e.start.dateTime).toISOString()},end:{dateTime:new Date(e.end.dateTime).toISOString()}}}
function applyFields(remote,baseline){
 if(remote===null)return {schedule:null};
 const durationMinutes=(Date.parse(remote.end.dateTime)-Date.parse(remote.start.dateTime))/60000;
 if(!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>1440)throw Error('unsupported_remote_duration');
 const iso=remote.start.dateTime;
 const fields={title:remote.summary,location:remote.location,durationMinutes,schedule:{date:iso.slice(0,10),time:iso.slice(11,16),timezone:'UTC'}};
 // Preserve rich formatting when Google has not changed the plain description.
 if(remote.description!==baseline?.description)fields.notes={type:'doc',content:remote.description.split('\n').map(text=>({type:'paragraph',...(text?{content:[{type:'text',text}]}:{})}))};
 return fields;
}
export function createCalendarPlanner({store,planner,broker,connection,accessToken,now=Date.now}){
 const key='planner-sync';
 function state(){return store.get(key)??{cursor:0,initialized:false,mappings:{},conflicts:{}}}
 return {
  status(){const s=state();return {plannerActive:!!planner&&!!s.lastSuccess,plannerLastSyncAt:s.lastSuccess??null,conflicts:Object.values(s.conflicts)}},
  async sync({renew,fenced,generation}){
   if(!planner)return;
   let s=state();const calendarId=connection().managedCalendarId;
   const invoke=async(name,input)=>{renew();const r=await planner.invoke(name,input);renew();return r};
   const save=()=>store.transaction(tx=>{fenced(tx);tx.set(key,s)});
   const token=async()=>{renew();const t=await accessToken();renew();return t};
   const remoteRead=async eventId=>{try{return await broker.getEvent({calendarId,eventId,accessToken:await token()})}catch(e){if([404,410].includes(e.status))return null;throw e}};
   const conflict=(id,kind,title,reason)=>{s.conflicts[id]={id,kind,title,reason};save()};
   async function reconcile(kind,id){
    const k=kind+':'+id;const current=await invoke('calendar_current',{kind,id});
    let mapping=s.mappings[k],remote=mapping?await remoteRead(mapping.eventId):null;
    const local=plannerEvent(current.record),observed=remoteEvent(remote);
    if(mapping&&observed===undefined){conflict(k,kind,current.record?.value.title??id,'Google is authoritative; its all-day or invalid time cannot be applied to this planner item. No local change will be exported.');return}
    if(mapping&&mapping.blocked){return}
    // A changed Google value wins even when MeOS also changed. Save the latest
    // displaced intent before CAS so restart/retry cannot lose the audit record.
    if(mapping&&(!same(observed,mapping.baseline)||(remote?.etag??null)!==mapping.etag)&&!same(observed,local)){
     if(!same(local,mapping.baseline)&&mapping.displacedLocal?.revision!==current.revision){mapping.displacedLocal={revision:current.revision,record:current.record,deleted:current.deleted,at:now()};save()}
     if(current.deleted||current.record?.value.archived||current.record?.value.skipped){conflict(k,kind,current.record?.value.title??id,'Google version kept. This MeOS item is deleted, archived or skipped; no stale local deletion will be exported.');return}
     let fields;try{fields=applyFields(observed,local)}catch{conflict(k,kind,current.record.value.title,'Google is authoritative, but its duration is unsupported. No local change will be exported.');return}
     const input={kind,id,expectedRevision:current.revision,...fields,idempotencyKey:hash('apply:'+k+':'+current.revision+':'+JSON.stringify(observed))};
     try{const receipt=await invoke('calendar_apply',input);mapping={...mapping,localRevision:receipt.revision,baseline:observed,etag:remote?.etag??null};s.mappings[k]=mapping;delete s.conflicts[k];save();return}catch(e){if(['conflict','not_found','validation'].includes(e.code)){conflict(k,kind,current.record.value.title,'Google version kept. Import will retry against the latest MeOS revision.');return}throw e}
    }
    if(local===undefined){conflict(k,kind,current.record.value.title,'Set a planned duration to sync this scheduled item.');return}
    if(mapping&&same(observed,local)){mapping.localRevision=current.revision;mapping.etag=remote?.etag??null;mapping.baseline=local;delete s.conflicts[k];save();return}
    if(!mapping&&local===null)return;
    // Capture durable intent before any provider write. This enables reconciliation
    // after a lost response or crash; deterministic IDs prevent duplicate inserts.
    if(!mapping){mapping={eventId:'meos'+hash(connection().managedCalendarId+':'+k),baseline:null,localRevision:current.revision,etag:null};s.mappings[k]=mapping;save();remote=await remoteRead(mapping.eventId);if(remote){if(same(remoteEvent(remote),local)){mapping.baseline=local;mapping.etag=remote.etag;save();return}conflict(k,kind,current.record.value.title,'Existing Google identity differs from the pending MeOS event.');return}}
    // Re-read local revision immediately before dispatch, not just before scan.
    const latest=await invoke('calendar_current',{kind,id});if(latest.revision!==current.revision){return}
    let result;
    try{
     if(local===null){if(remote&&remote.status!=='cancelled')await broker.deleteEvent({calendarId,eventId:mapping.eventId,etag:remote.etag,accessToken:await token()});result=null}
     else if(!remote){result=await broker.insertEvent({calendarId,event:{...local,id:mapping.eventId,extendedProperties:{private:{meosKind:kind,meosEntity:id}}},accessToken:await token()})}
     else if(remote.status==='cancelled'){
      // Re-scheduling an explicitly unscheduled/cancelled item restores its mapped
      // identity conditionally; never silently allocate a second Google event.
      result=await broker.patchEvent({calendarId,eventId:mapping.eventId,event:{...local,status:'confirmed'},etag:remote.etag,accessToken:await token()})
     }else result=await broker.patchEvent({calendarId,eventId:mapping.eventId,event:local,etag:remote.etag,accessToken:await token()});
    }catch(e){if([409,412].includes(e.status)){conflict(k,kind,current.record?.value.title??id,'Google changed during export. Its latest version will be reconciled on the next poll.');return}throw e}
    renew();if(result&&(result.id!==mapping.eventId||!result.etag||remoteEvent(result)===undefined))throw Error('planner_receipt');
    mapping.baseline=local;mapping.localRevision=current.revision;mapping.etag=result?.etag??null;delete s.conflicts[k];save();
   }
   // Planning explicitly creates routine instances. Sync only reconciles existing records.
   if(!s.initialized){for(const kind of ['tasks','occurrences']){let cursor;do{const page=await invoke('calendar_inventory',{kind,...(cursor?{cursor}:{})});for(const row of page.items)await reconcile(kind,row.value.id);cursor=page.nextCursor}while(cursor)}s.initialized=true;save()}
   for(let pages=0;pages<1000;pages++){const page=await invoke('calendar_changes',{cursor:s.cursor});if(!page.items.length)break;for(const item of page.items)await reconcile(item.kind,item.id);s.cursor=page.cursor;save();if(pages===999)throw Error('planner_page_limit')}
   // Read every established mapping to import Google-only changes even with no
   // local outbox activity. Conflicts remain durable and are retried safely.
   for(const k of Object.keys(s.mappings)){const [kind,id]=k.split(':');await reconcile(kind,id)}
   s.lastSuccess=now();save();
  },
 };
}
