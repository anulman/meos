import test from 'node:test';import assert from 'node:assert/strict';
import {createCalendarMirror} from '../backend/calendar-mirror.mjs';
test('auth backoff skips projection work and sequence allocation, then resumes',async()=>{
 let now=0,snapshots=0,writes=0,calls=0;const values=new Map();
 const store={transaction:fn=>fn({get:k=>values.get(k),set:(k,v)=>{writes++;values.set(k,v)}})};
 const mirror=createCalendarMirror({store,now:()=>now,connection:()=>({generation:'synthetic'}),snapshot:()=>{snapshots++;return {items:[],drafts:[],conflicts:[],metadata:{available:true}}},planner:{status:()=>({nextSyncAt:60_000}),invoke:async(_,v)=>{calls++;return {sequence:v.sequence,committed:true}}}});
 for(let i=0;i<60;i++){now=i*1000;await mirror.publish()}
 assert.deepEqual([snapshots,writes,calls],[0,0,0]);now=60_000;await mirror.publish();assert.deepEqual([snapshots,writes,calls],[1,1,1]);
});
