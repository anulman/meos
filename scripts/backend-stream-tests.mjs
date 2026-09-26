// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {readIncomingText,writeOutgoingBytes} from '../backend/guest/streams.mjs'
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


test('large responses respect the WASIp2 4096-byte blocking-write limit',()=>{
 const bytes=new TextEncoder().encode('café 🌿 '.repeat(3000)),chunks=[]
 writeOutgoingBytes({blockingWriteAndFlush(chunk){assert.ok(chunk.length<=4096);chunks.push(chunk)}},bytes)
 assert.ok(chunks.length>1);assert.deepEqual(Buffer.concat(chunks),Buffer.from(bytes))
})
