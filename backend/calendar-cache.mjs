// SPDX-License-Identifier: Apache-2.0
// Main-database projection; no credentials, provider calls or write-back here.
import {DomainError,canonical,uuid,date,timezone} from './domain.mjs';
import {localDay,addDays} from './scheduling.mjs';
const blob=value=>Uint8Array.from(uuid(value).replaceAll('-','').match(/../g).map(x=>parseInt(x,16)));
const conflict=()=>{throw new DomainError('conflict','Calendar publication superseded or inconsistent')};
export function publishCalendarCache(db,owner,input){
 const id=blob(owner),{sequence,page,pages,generation}=input,payload=canonical(input);
 if(page>=pages)throw new DomainError('validation','Invalid Calendar page');
 let state=db.query('SELECT sequence,pending_sequence FROM calendar_cache_state WHERE owner_id=?',[id])[0];
 if(!state){db.execute('INSERT INTO calendar_cache_state(owner_id) VALUES(?)',[id]);state=[0,0]}
 if(sequence<state[1]||sequence<state[0])conflict();
 const old=db.query('SELECT sequence,payload FROM calendar_cache_pages WHERE owner_id=? AND page=?',[id,page])[0];
 if(sequence===state[1]&&old?.[0]===sequence){if(old[1]!==payload)conflict();return {sequence,committed:state[0]===sequence}}
 if(sequence===state[0])conflict();
 if(sequence>state[1]){
  if(page!==0)conflict();
  db.execute('DELETE FROM calendar_cache_pages WHERE owner_id=?',[id]);
  db.execute('UPDATE calendar_cache_state SET pending_sequence=? WHERE owner_id=?',[sequence,id]);
 }
 const staged=db.query('SELECT page,pages,generation FROM calendar_cache_pages WHERE owner_id=? ORDER BY page',[id]);
 if(staged.length!==page||staged.some((r,i)=>r[0]!==i||r[1]!==pages||r[2]!==generation))conflict();
 const size=db.query('SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM calendar_cache_pages WHERE owner_id=?',[id])[0][0];
 if(size+new TextEncoder().encode(payload).length>64*1024*1024)throw new DomainError('validation','Calendar staging size limit');
 db.execute('INSERT INTO calendar_cache_pages VALUES(?,?,?,?,?,?)',[id,sequence,page,pages,generation,payload]);
 if(page!==pages-1)return {sequence,committed:false};
 const all=db.query('SELECT payload FROM calendar_cache_pages WHERE owner_id=? ORDER BY page',[id]).map(r=>JSON.parse(r[0]));
 const metadata=all[0].metadata;
 if(!metadata||all.slice(1).some(p=>p.metadata!==undefined))throw new DomainError('validation','Calendar metadata belongs to first page');
 const items=all.flatMap(p=>p.items),keys=new Set();
 if(items.length>200000||all.flatMap(p=>p.drafts).length>1000||all.flatMap(p=>p.conflicts).length>100000)throw new DomainError('validation','Calendar collection limit');
 for(const event of items){
  const key=event.role+':'+event.id;if(keys.has(key))throw new DomainError('validation','Duplicate Calendar identity');keys.add(key);
  for(const point of [event.start,event.end])if(point?.dateTime&&(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(point.dateTime)||!Number.isFinite(Date.parse(point.dateTime))))throw new DomainError('validation','Invalid Calendar instant');
 }
 if(metadata.available){
  db.execute('DELETE FROM calendar_cache_events WHERE owner_id=?',[id]);
  for(const event of items)db.execute('INSERT INTO calendar_cache_events VALUES(?,?,?)',[id,event.role+':'+event.id,canonical(event)]);
 }else if(items.length)throw new DomainError('validation','Uninitialized Calendar cache cannot contain events');
 db.execute('UPDATE calendar_cache_state SET sequence=?,metadata=? WHERE owner_id=?',[sequence,canonical({...metadata,generation,drafts:all.flatMap(p=>p.drafts),planner:{plannerLastSyncAt:metadata.plannerLastSyncAt,conflicts:all.flatMap(p=>p.conflicts)}}),id]);
 return {sequence,committed:true};
}
export function readCalendarCache(db,owner,now){
 const id=blob(owner),row=db.query('SELECT sequence,metadata FROM calendar_cache_state WHERE owner_id=?',[id])[0];
 const metadata=row?JSON.parse(row[1]):{available:false,state:'unavailable',syncActive:false,lastSyncAt:null,plannerLastSyncAt:null,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:null,conflicts:[]}};
 const items=db.query('SELECT doc FROM calendar_cache_events WHERE owner_id=? ORDER BY event_key',[id]).map(r=>JSON.parse(r[0]));
 const fresh=metadata.available&&metadata.state==='connected'&&metadata.syncActive&&metadata.lastSyncAt!==null&&now-metadata.lastSyncAt<180000;
 return {id:'calendar',items,...metadata,sequence:row?.[0]??0,status:!metadata.available?'unavailable':fresh?'fresh':'stale'};
}
export function listCalendarCache(db,owner,input,now){
 date(input.period.start);date(input.period.end);timezone(input.timezone);
 if(input.period.end<input.period.start||input.period.end>addDays(input.period.start,92))throw new DomainError('validation','Calendar range must be at most 93 days');
 const cache=readCalendarCache(db,owner,now),end=addDays(input.period.end,1),limit=input.limit??100;
 const items=cache.items.filter(e=>{
  if(e.start?.date&&e.end?.date)return e.start.date<end&&e.end.date>input.period.start;
  if(!e.start?.dateTime||!e.end?.dateTime)return false;
  const start=Date.parse(e.start.dateTime),finish=Date.parse(e.end.dateTime);
  return finish>start&&localDay(start,input.timezone)<=input.period.end&&localDay(finish-1,input.timezone)>=input.period.start;
 }).filter(e=>e.role+':'+e.id>(input.cursor??''));
 const {items:ignored,id:ignoredId,...metadata}=cache;
 return {...metadata,items:items.slice(0,limit),...(items.length>limit?{nextCursor:items[limit-1].role+':'+items[limit-1].id}:{})};
}
