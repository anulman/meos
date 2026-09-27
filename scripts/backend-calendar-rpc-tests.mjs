// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createCalendarRpcHandler,createCalendarRpcClient} from '../backend/calendar-rpc.mjs';
test('private Unix RPC preserves safe result and rejects arbitrary operations and owner',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-rpc-')),socketPath=path.join(directory,'control.sock');let calls=0;
 const server=http.createServer(createCalendarRpcHandler({ownerId:'synthetic',service:{status:async input=>{assert.equal(input.ownerId,'synthetic');calls++;return {state:'connected',syncActive:false}},connect:async()=>{throw Error('private-token-secret')}}}));await new Promise(r=>server.listen(socketPath,r));fs.chmodSync(socketPath,0o600);t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true})});
 const client=createCalendarRpcClient({socketPath,ownerId:'synthetic'});assert.deepEqual(await client.status({}),{state:'connected',syncActive:false});assert.equal(calls,1);await assert.rejects(client.connect({session:'synthetic'}),e=>e.message==='calendar_unavailable');
 const other=createCalendarRpcClient({socketPath,ownerId:'other'});await assert.rejects(other.status({}));assert.equal(calls,1);
 const status=await new Promise((resolve,reject)=>{const req=http.request({socketPath,path:'/arbitrary',method:'POST'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.end('{}')});assert.equal(status,404);
});
