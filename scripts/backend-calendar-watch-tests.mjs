// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {createCalendarWatch} from '../backend/calendar-watch.mjs'
function fixture(options={}){
 let time=1000000,counter=0;const records=new Map(),calls=[]
 const store={async putIfAbsent(id,r){if(records.has(id))return false;records.set(id,structuredClone(r));return true},async get(id){return structuredClone(records.get(id))},async transact(id,fn){const {record,result}=fn(structuredClone(records.get(id)));records.set(id,structuredClone(record));return result}}
 const provider={async watch(input){calls.push(input);return {id:input.id,resourceId:'resource-'+input.id,expiration:input.expiration}},async stop(input){calls.push({stop:input})},...options.provider}
 const config={owner:'synthetic-owner',primaryCalendarId:'primary',managedCalendarId:'synthetic-managed',address:'https://meos.example.invalid/api/calendar/google/notifications',...options.config}
 const core=createCalendarWatch({config,store,provider,now:()=>time,id:()=>`channel-${++counter}`,random:n=>Buffer.alloc(n,counter),...options,provider})
 const signal=(channelId,extra={})=>{const r=records.get(channelId);return core.notification({channelId,token:r.token,resourceId:r.resourceId??'resource-'+channelId,messageNumber:'2',resourceState:'exists',...extra})}
 return {core,records,calls,store,signal,setTime:n=>time=n}
}
test('registers both required calendar roles and queues initial pull without exposing tokens',async()=>{
 const f=fixture();for(const role of ['primary','managed']){const result=await f.core.start(role);assert.equal((await f.core.status(result.channelId)).pending,true);assert(!JSON.stringify(result).includes(f.records.get(result.channelId).token))}
 assert.deepEqual(f.calls.map(c=>c.calendarId),['primary','synthetic-managed']);assert(f.calls.every(c=>c.type==='web_hook'))
})
test('early initial sync is retained before watch response and bound to confirmed resource',async()=>{
 let f;f=fixture({provider:{watch:async input=>{assert(f.records.has(input.id));await f.signal(input.id,{messageNumber:'1',resourceState:'sync'});return {id:input.id,resourceId:'resource-'+input.id,expiration:input.expiration}}}})
 const {channelId}=await f.core.start('primary');assert.equal(f.records.get(channelId).pending.length,0);assert.equal(f.records.get(channelId).seen.length,1);assert((await f.signal(channelId,{messageNumber:'1',resourceState:'sync'})).duplicate)
})
test('rejects unknown channels, incorrect token/resource, malformed state and expired channels',async()=>{
 const f=fixture(),{channelId}=await f.core.start('primary')
 for(const extra of [{channelId:'unknown'},{token:'wrong'},{resourceId:'foreign'},{resourceState:'payload'},{messageNumber:'0'},{messageNumber:'NaN'}])await assert.rejects(f.signal(channelId,extra),{code:'forbidden'})
 f.setTime(f.records.get(channelId).expiresAt);await assert.rejects(f.signal(channelId),{code:'forbidden'})
})
test('durable dirty queue survives wake failure and acknowledgement cannot lose newer signals',async()=>{
 const f=fixture({wake:async()=>{throw Error('synthetic queue wake outage')}}),{channelId}=await f.core.start('primary')
 await f.signal(channelId);const version=(await f.core.status(channelId)).dirtyVersion;await f.signal(channelId,{messageNumber:'9'})
 assert.equal((await f.core.acknowledge(channelId,version)).pending,true);const current=(await f.core.status(channelId)).dirtyVersion;assert.equal((await f.core.acknowledge(channelId,current)).pending,false)
 await assert.rejects(f.core.acknowledge(channelId,current+1),{code:'invalid'})
})
test('bounded dedup ignores replay but preserves out-of-order distinct notifications',async()=>{
 const f=fixture(),{channelId}=await f.core.start('managed');await f.signal(channelId,{messageNumber:'900'});await f.signal(channelId,{messageNumber:'10'});assert((await f.signal(channelId,{messageNumber:'0010'})).duplicate)
 assert.equal((await f.core.status(channelId)).dirtyVersion,3)
 for(let i=1000;i<1260;i++)await f.signal(channelId,{messageNumber:String(i)})
 assert.equal(f.records.get(channelId).seen.length,256);assert((await f.signal(channelId,{messageNumber:'10'})).queued)
})
test('notification payload cannot change planner data; not_exists only queues reconciliation',async()=>{
 const f=fixture(),{channelId}=await f.core.start('primary');const result=await f.signal(channelId,{resourceState:'not_exists',body:{deleteAll:true}})
 assert(result.queued);assert.equal(f.calls.length,1);assert.equal((await f.core.status(channelId)).phase,'active')
})
test('renewal registers replacement before retiring old channel and accepts overlap signals',async()=>{
 const f=fixture(),old=await f.core.start('primary'),fresh=await f.core.renew(old.channelId)
 assert.equal((await f.core.status(old.channelId)).phase,'retiring');assert.equal((await f.core.status(fresh.channelId)).phase,'active');assert((await f.signal(old.channelId)).queued);assert((await f.signal(fresh.channelId)).queued)
 await f.core.stopRetired(old.channelId);assert.equal((await f.core.status(old.channelId)).phase,'stopped');await assert.rejects(f.signal(old.channelId),{code:'forbidden'});assert.equal(f.calls.at(-1).stop.id,old.channelId)
})
test('failed registration retains uncertain receipt and old watch remains active on renewal failure',async()=>{
 let fail=false;const f=fixture({provider:{watch:async input=>{if(fail)throw Error('secret-provider-token');return {id:input.id,resourceId:'resource-'+input.id,expiration:input.expiration}}}}),old=await f.core.start('primary');fail=true
 await assert.rejects(f.core.renew(old.channelId),e=>e.code==='unavailable'&&!e.message.includes('secret'));assert.equal((await f.core.status(old.channelId)).phase,'active');assert.equal(f.records.get('channel-3').phase,'uncertain');assert.equal(f.records.get(old.channelId).renewing,false)
})
test('provider revocation yields reconnect state and no active subscription claim',async()=>{
 const f=fixture({provider:{watch:async()=>{throw {status:401,body:'secret'}}}});await assert.rejects(f.core.start('primary'),{code:'reconnect_required'});assert.equal(f.records.get('channel-1').phase,'reconnect_required')
})
test('invalid provider receipt cannot activate channel',async()=>{
 const f=fixture({provider:{watch:async()=>({id:'foreign',resourceId:'r',expiration:'9999999999'})}});await assert.rejects(f.core.start('primary'),{code:'unavailable'});assert.equal(f.records.get('channel-1').phase,'uncertain')
})
test('expired replacement cannot justify stopping still-valid old channel',async()=>{
 const f=fixture(),old=await f.core.start('primary'),fresh=await f.core.renew(old.channelId);f.records.get(fresh.channelId).expiresAt=1;await assert.rejects(f.core.stopRetired(old.channelId),{code:'unavailable'});assert.equal((await f.core.status(old.channelId)).phase,'retiring')
})
test('renewal uses provider actual expiry and exposes deadline without channel token',async()=>{
 const f=fixture({provider:{watch:async input=>({id:input.id,resourceId:'r',expiration:'1600000'})}}),r=await f.core.start('primary');assert.equal(r.expiresAt,1600000);f.setTime(r.renewAt);assert((await f.core.status(r.channelId)).needsRenewal)
})
test('configuration never permits arbitrary webhook targets or same primary/managed destination',()=>{
 for(const config of [{address:'http://meos.example.invalid/api/calendar/google/notifications'},{address:'https://meos.example.invalid/other'},{managedCalendarId:'primary'}])assert.throws(()=>fixture({config}),{code:'configuration'})
})
test('scheduled reconciliation queues fetch without a webhook and failed stop stays retryable',async()=>{
 let failStop=true;const f=fixture({provider:{stop:async()=>{if(failStop)throw Error('synthetic outage')}}}),old=await f.core.start('primary')
 await f.core.acknowledge(old.channelId,1);assert(!(await f.core.status(old.channelId)).pending);await f.core.reconcile(old.channelId);assert((await f.core.status(old.channelId)).pending)
 await f.core.renew(old.channelId);await assert.rejects(f.core.stopRetired(old.channelId),{code:'unavailable'});assert((await f.core.status(old.channelId)).stopPending);failStop=false;assert((await f.core.stopRetired(old.channelId)).stopped)
})
test('renewal can recover expired worker lease instead of staying permanently busy',async()=>{
 const f=fixture(),old=await f.core.start('primary'),r=f.records.get(old.channelId);r.renewing=true;r.renewingUntil=1000100;r.renewalId='crashed'
 await assert.rejects(f.core.renew(old.channelId),{code:'busy'});f.setTime(1000100);const replacement=await f.core.renew(old.channelId);assert.equal((await f.core.status(replacement.channelId)).phase,'active')
})
