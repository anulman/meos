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
function calendarMetadata(db,owner,now){
 const id=blob(owner),row=db.query('SELECT sequence,metadata FROM calendar_cache_state WHERE owner_id=?',[id])[0];
 const metadata=row?.[0]>0?JSON.parse(row[1]):{available:false,state:'unavailable',syncActive:false,lastSyncAt:null,plannerLastSyncAt:null,windowStart:null,windowEnd:null,drafts:[],planner:{plannerLastSyncAt:null,conflicts:[]}};
 const fresh=metadata.available&&metadata.state==='connected'&&metadata.syncActive&&metadata.lastSyncAt!==null&&now-metadata.lastSyncAt<180000;
 return {id:'calendar',...metadata,sequence:row?.[0]??0,status:!metadata.available?'unavailable':fresh?'fresh':'stale'};
}
export function readCalendarCache(db,owner,now){
 return {...calendarMetadata(db,owner,now),items:db.query('SELECT doc FROM calendar_cache_events WHERE owner_id=? ORDER BY event_key',[blob(owner)]).map(r=>JSON.parse(r[0]))};
}
function rangeItems(db,owner,input){
 const end=addDays(input.period.end,1),limit=input.limit??250;
 // SQLite discards unrelated documents before crossing the WASM/JS boundary.
 // A two-day UTC margin covers every supported civil offset, including DST.
 // Exact local-day overlap is checked below; all-day ends remain exclusive.
 const lower=Date.parse(input.period.start+'T00:00:00Z')-172800000,upper=Date.parse(end+'T00:00:00Z')+172800000;
 const items=[];let cursor=input.cursor??'';
 for(;;){
 const rows=db.query(`SELECT doc,event_key FROM calendar_cache_events WHERE owner_id=? AND event_key>? AND (
  (json_extract(doc,'$.start.date') < ? AND json_extract(doc,'$.end.date') > ?) OR
  (julianday(json_extract(doc,'$.start.dateTime')) < julianday(? / 1000.0,'unixepoch') AND julianday(json_extract(doc,'$.end.dateTime')) > julianday(? / 1000.0,'unixepoch'))
 ) ORDER BY event_key LIMIT 250`,[blob(owner),cursor,end,input.period.start,upper,lower]);
 for(const row of rows){
  const event=JSON.parse(row[0]);let overlaps;
  if(event.start?.date&&event.end?.date)overlaps=event.start.date<end&&event.end.date>input.period.start;
  else {const start=Date.parse(event.start?.dateTime??''),finish=Date.parse(event.end?.dateTime??'');overlaps=finish>start&&localDay(start,input.timezone)<=input.period.end&&localDay(finish-1,input.timezone)>=input.period.start}
  if(overlaps)items.push(event);
  if(items.length>limit)break;
 }
 if(items.length>limit||rows.length<250)break;
 cursor=rows.at(-1)[1];
 }
 return {items:items.slice(0,limit),...(items.length>limit?{nextCursor:items[limit-1].role+':'+items[limit-1].id}:{})};
}
function validateRange(input){
 date(input.period.start);date(input.period.end);timezone(input.timezone);
 if(input.period.end<input.period.start||input.period.end>addDays(input.period.start,92))throw new DomainError('validation','Calendar range must be at most 93 days');
 // Validate the zone/rules even for empty and all-day-only calendars.
 localDay(Date.parse(input.period.start+'T12:00:00Z'),input.timezone);localDay(Date.parse(input.period.end+'T12:00:00Z'),input.timezone);
 if(input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>250))throw new DomainError('validation','Invalid Calendar page limit');
 if(input.cursor!==undefined&&(typeof input.cursor!=='string'||!input.cursor.length||input.cursor.length>1100))throw new DomainError('validation','Invalid Calendar cursor');
}
export function listCalendarCache(db,owner,input,now){
 validateRange(input);
 const {id,...metadata}=calendarMetadata(db,owner,now);
 return {...metadata,...rangeItems(db,owner,{...input,limit:input.limit??100})};
}
/** Browser window: sequence checks avoid event reads on unchanged polls and fence pages. */
export function readCalendarWindow(db,owner,input,now){
 validateRange(input);
 if(input.sequence!==undefined&&(!Number.isSafeInteger(input.sequence)||input.sequence<0))throw new DomainError('validation','Invalid Calendar sequence');
 const metadata=calendarMetadata(db,owner,now);
 if(input.cursor&&input.sequence!==metadata.sequence)throw new DomainError('conflict','Calendar changed while paging; reload this period');
 if(!input.cursor&&input.sequence===metadata.sequence)return {...metadata,items:[],unchanged:true};
 return {...metadata,...rangeItems(db,owner,input),unchanged:false};
}
