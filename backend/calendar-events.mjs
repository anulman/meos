// SPDX-License-Identifier: Apache-2.0
// Only the app-created calendar is writable. ETag conflicts retain the local
// draft for explicit resolution; provider cancellation never resurrects events.
import {randomUUID} from 'node:crypto';
const text=(v,max=1000)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
function content(value){
 if(!value||!text(value.summary,300)||!value.summary.trim()||!text(value.location??'',1000)||!text(value.description??'',10000))throw Error('invalid_event');
 const start=value.start,end=value.end;
 for(const v of [start,end])if(!v||!text(v.dateTime,50)||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v.dateTime)||!Number.isFinite(Date.parse(v.dateTime)))throw Error('invalid_time');
 if(Date.parse(end.dateTime)<=Date.parse(start.dateTime))throw Error('invalid_duration');
 return {summary:value.summary.trim(),location:value.location??'',description:value.description??'',start:{dateTime:new Date(start.dateTime).toISOString()},end:{dateTime:new Date(end.dateTime).toISOString()}};
}
function equal(a,b){try{return JSON.stringify(content(a))===JSON.stringify(content(b))}catch{return false}}
function publicEvent(event,role){return {id:event.id,role,etag:event.etag??'',summary:event.summary??'(Untitled)',location:event.location??'',description:event.description??'',start:event.start,end:event.end,linked:!!event.extendedProperties?.private?.meosEntity,recurring:!!event.recurringEventId||!!event.recurrence}}
export function createCalendarEvents({store,connection,broker,accessToken,now=Date.now}){
 function snapshot(role){return store.get('snapshot:'+role)}
 function drafts(){return store.get('event-outbox')??{}}
 return {
  list(){return {items:['primary','managed'].flatMap(role=>[...Object.values(snapshot(role)?.events??{}).filter(e=>!e.recurrence&&!e.recurringEventId),...(snapshot(role)?.expanded??[]).filter(e=>e.recurringEventId)].filter(e=>e.status!=='cancelled').map(e=>publicEvent(e,role))),drafts:Object.values(drafts()).map(d=>({id:d.id,event:d.event,state:d.state,operation:d.operation}))}},
  mutate(input){
   const c=connection();if(!c.credentials||!c.managedCalendarId)throw Error('not_connected');
   if(input.role!=='managed'||!['create','update','delete','discard'].includes(input.operation))throw Error('primary_read_only');
   const event=input.operation==='delete'||input.operation==='discard'?undefined:content(input.event);
   return store.transaction(tx=>{
    const outbox=tx.get('event-outbox')??{},id=input.operation==='create'?randomUUID().replaceAll('-',''):input.id;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,1024}$/.test(id))throw Error('invalid_id');
    if(input.operation==='discard'){if(outbox[id]?.state!=='conflict')throw Error('not_conflict');delete outbox[id];tx.set('event-outbox',outbox);return {id}}
    if(outbox[id])throw Error('edit_pending');
    const managed=tx.get('snapshot:managed');const remote=managed?.events?.[id]??managed?.expanded?.find(e=>e.id===id);
    if(input.operation!=='create'&&(!remote||remote.status==='cancelled'||!remote.etag||remote.etag!==input.etag))throw Error('conflict');
    if(remote?.extendedProperties?.private?.meosEntity)throw Error('edit_in_planner');
    if(remote?.recurrence)throw Error('edit_individual_occurrence');
    if(Object.keys(outbox).length>=1000)throw Error('queue_limit');
    outbox[id]={id,event,operation:input.operation,etag:remote?.etag,state:'pending',generation:c.generation,createdAt:now()};tx.set('event-outbox',outbox);return {id};
   });
  },
  async flush({renew,fenced,generation}){
   const calendarId=connection().managedCalendarId;
   for(const draft of Object.values(drafts())){
    if(draft.state==='conflict')continue;
    if(draft.generation!==generation){store.transaction(tx=>{fenced(tx);const outbox=tx.get('event-outbox');outbox[draft.id].state='conflict';tx.set('event-outbox',outbox)});continue}
    renew();const token=await accessToken();renew();let remote;
    try{remote=await broker.getEvent({calendarId,eventId:draft.id,accessToken:token})}catch(e){if(![404,410].includes(e.status))throw e}
    const cancelled=!remote||remote.status==='cancelled';let conflict=false,result;
    if(draft.operation==='delete'&&cancelled)result={id:draft.id,status:'cancelled'};
    else if(draft.operation!=='delete'&&remote&&equal(remote,draft.event))result=remote;
    else if(draft.operation==='create'&&!remote){
     renew();try{result=await broker.insertEvent({calendarId,event:{...draft.event,id:draft.id},accessToken:token})}catch(e){if(e.status===409)continue;throw e}
    }else if(draft.operation==='create'||cancelled||remote.etag!==draft.etag)conflict=true;
    else {
     renew();try{if(draft.operation==='delete'){await broker.deleteEvent({calendarId,eventId:draft.id,etag:draft.etag,accessToken:token});result={id:draft.id,status:'cancelled'}}else result=await broker.patchEvent({calendarId,eventId:draft.id,event:draft.event,etag:draft.etag,accessToken:token})}catch(e){if([404,410,412].includes(e.status))conflict=true;else throw e}
    }
    if(!conflict&&(!result||result.id!==draft.id||!['confirmed','tentative','cancelled'].includes(result.status)))throw Error('invalid_write_receipt');
    store.transaction(tx=>{fenced(tx);const outbox=tx.get('event-outbox');if(conflict)outbox[draft.id].state='conflict';else{delete outbox[draft.id];const s=tx.get('snapshot:managed');s.events[draft.id]=result;s.expanded=s.expanded?.map(e=>e.id===draft.id?result:e);s.revision++;tx.set('snapshot:managed',s)}tx.set('event-outbox',outbox)});
   }
  },
 };
}
