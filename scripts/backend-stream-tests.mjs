// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {readIncomingText} from '../backend/guest/streams.mjs'
function fixture(parts,error={tag:'closed'}) {
 const dropped=[]
 const stream={blockingRead(){if(parts.length)return parts.shift();throw Object.assign(new Error('WIT failure'),{payload:error})},[Symbol.dispose](){dropped.push('stream')}}
 return {incoming:{consume(){return {stream:()=>stream,[Symbol.dispose](){dropped.push('body')}}}},dropped}
}
test('real QuickJS error wrapper terminates bounded stream and preserves Unicode',()=>{
 const bytes=new TextEncoder().encode('café 🌿'),f=fixture([bytes.slice(0,6),bytes.slice(6)])
 assert.equal(readIncomingText(f.incoming,100),'café 🌿');assert.deepEqual(f.dropped,['stream','body'])
})
test('stream failure is not EOF and oversized bodies always dispose resources',()=>{
 const fail=fixture([],{tag:'last-operation-failed'});assert.throws(()=>readIncomingText(fail.incoming,100),/WIT failure/);assert.deepEqual(fail.dropped,['stream','body'])
 const large=fixture([new Uint8Array(11)]);assert.throws(()=>readIncomingText(large.incoming,10),{code:'validation'});assert.deepEqual(large.dropped,['stream','body'])
})
