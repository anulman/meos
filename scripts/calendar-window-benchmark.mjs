// SPDX-License-Identifier: Apache-2.0
// Synthetic in-memory fixture only. No application or provider connections.
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {publishCalendarCache,readCalendarCache,readCalendarWindow} from '../backend/calendar-cache.mjs'
const owner='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-09-27T16:00Z')
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE _user(id BLOB PRIMARY KEY) STRICT');db.prepare('INSERT INTO _user VALUES(?)').run(Buffer.from(owner.replaceAll('-',''),'hex'));db.exec(readFileSync(new URL('../backend/migrations/U1790380811__calendar_cache.sql',import.meta.url),'utf8'))
let queries=0,rows=0
const port={execute:(s,p)=>Number(db.prepare(s).run(...p).changes),query:(s,p)=>{const result=db.prepare(s).all(...p).map(Object.values);if(s.includes('FROM calendar_cache_events')){queries++;rows+=result.length}return result}}
const items=Array.from({length:6708},(_,i)=>{const start=new Date(Date.parse('2026-01-01T12:00Z')+Math.floor(i/18)*86400000+(i%18)*600000);return {id:'synthetic-'+String(i).padStart(5,'0'),role:'primary',etag:'synthetic',summary:'Synthetic appointment',location:'Fixture room',description:'Synthetic benchmark data only. '.repeat(4),start:{dateTime:start.toISOString()},end:{dateTime:new Date(+start+1800000).toISOString()},linked:false,recurring:false}})
const metadata={available:true,state:'connected',syncActive:true,lastSyncAt:now,plannerLastSyncAt:null,windowStart:'2026-01-01T00:00Z',windowEnd:'2027-02-01T00:00Z'}
for(let page=0;page<Math.ceil(items.length/250);page++)publishCalendarCache(port,owner,{sequence:1,generation:'synthetic',page,pages:Math.ceil(items.length/250),items:items.slice(page*250,(page+1)*250),drafts:[],conflicts:[],...(page===0?{metadata}:{})})
function measure(fn){queries=0;rows=0;const start=performance.now(),value=fn(),milliseconds=performance.now()-start,body=JSON.stringify(value);return {value,metrics:{milliseconds,bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length,events:value.items.length,eventQueries:queries,documentRowsReturned:rows}}}
const range={period:{start:'2026-09-27',end:'2026-09-27'},timezone:'America/Montreal'}
const baseline=measure(()=>readCalendarCache(port,owner,now)),day=measure(()=>readCalendarWindow(port,owner,range,now)),poll=measure(()=>readCalendarWindow(port,owner,{...range,sequence:1},now+180001))
assert.equal(baseline.value.items.length,6708);assert.equal(day.value.items.length,18);assert.equal(poll.value.unchanged,true);assert.equal(poll.value.status,'stale');assert.equal(poll.metrics.eventQueries,0);assert.equal(poll.metrics.documentRowsReturned,0);assert.ok(day.metrics.bytes<baseline.metrics.bytes/100)
console.log(JSON.stringify({fixture:'6708 synthetic events; 18/day; in-memory SQLite; not end-user browser latency',baseline:baseline.metrics,day:day.metrics,unchangedPoll:poll.metrics,payloadReductionPercent:100*(1-day.metrics.bytes/baseline.metrics.bytes)},null,2));db.close()
