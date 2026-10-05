// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createCalendarService} from '../backend/calendar-service.mjs';
import {openCalendarDurableStore} from '../backend/calendar-durable-store.mjs';
import {calendarScopes} from '../backend/calendar-oauth.mjs';
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-service-'));let store=openCalendarDurableStore({directory});t.after(()=>{store.close();fs.rmSync(directory,{recursive:true})});let time=1000000,refresh=async()=>{throw Error('uncertain')};const broker={tokenExchange:async()=>({access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:calendarScopes.join(' '),id_token:'synthetic-id'}),refreshExchange:input=>refresh(input),verifyIdentity:async()=>({email:'owner@example.invalid',emailVerified:true}),createCalendar:async()=>({id:'managed-synthetic'}),listEvents:async()=>({items:[],nextSyncToken:'synthetic-token'})};const config={ownerId:'synthetic-owner',clientId:'synthetic.apps.googleusercontent.com',ownerEmail:'owner@example.invalid',origin:'https://meos.example.invalid',redirectUri:'https://meos.example.invalid/api/calendar/google/callback'};const create=()=>createCalendarService({config,store,broker,now:()=>time});let service=create();const ctx={ownerId:config.ownerId,session:'synthetic-session'};const connect=async()=>{const r=await service.connect(ctx);return new URL(r.authorizationUrl).searchParams.get('state')};const callback=state=>service.callback({...ctx,state,code:'synthetic-code'});const key='connection:'+createHash('sha256').update(config.ownerId).digest('hex');return {get service(){return service},get store(){return store},broker,ctx,connect,callback,setTime:n=>time=n,setRefresh:fn=>refresh=fn,connection:()=>store.get(key),restart:()=>{store.close();store=openCalendarDurableStore({directory});service=create()}}}
test('durable connection, independently established subscriptions and safe status',async t=>{const f=fixture(t);assert.equal((await f.service.status(f.ctx)).state,'disconnected');await f.callback(await f.connect());assert.equal((await f.service.status(f.ctx)).syncActive,false);await f.service.initializeManagedCalendar();await f.service.poll();assert.equal((await f.service.status(f.ctx)).syncActive,true);assert.ok(!JSON.stringify(await f.service.status(f.ctx)).includes('synthetic-access'));await f.service.disconnect(f.ctx);assert.equal((await f.service.status(f.ctx)).syncActive,false)});
test('disconnect fences pending callback and preserves owner isolation',async t=>{const f=fixture(t),state=await f.connect();await f.service.disconnect(f.ctx);await assert.rejects(f.callback(state));await assert.rejects(f.service.status({ownerId:'other'}));assert.equal((await f.service.status(f.ctx)).state,'disconnected')});
test('wrong binding consumes state and cannot replay',async t=>{const f=fixture(t),state=await f.connect();await assert.rejects(f.service.callback({...f.ctx,session:'wrong',state,code:'synthetic-code'}));await assert.rejects(f.callback(state))});
test('ambiguous calendar creation is never automatically duplicated',async t=>{const f=fixture(t);await f.callback(await f.connect());let calls=0;f.broker.createCalendar=async()=>{calls++;throw Error('lost reply')};await assert.rejects(f.service.initializeManagedCalendar());await assert.rejects(f.service.initializeManagedCalendar());assert.equal(calls,1)});
test('refresh transport ambiguity preserves credentials',async t=>{const f=fixture(t);await f.callback(await f.connect());f.setTime(5000000);await assert.rejects(f.service.initializeManagedCalendar());assert.equal((await f.service.status(f.ctx)).state,'connected');assert.equal(f.connection().credentials.refreshToken,'synthetic-refresh');assert.equal(f.connection().refreshFailure.reason,'transport')});
test('reconnect does not report old-generation subscriptions as current',async t=>{const f=fixture(t);await f.callback(await f.connect());await f.service.initializeManagedCalendar();await f.service.poll();await f.service.disconnect(f.ctx);await f.callback(await f.connect());assert.equal((await f.service.status(f.ctx)).syncActive,false);await f.service.poll();assert.equal((await f.service.status(f.ctx)).syncActive,true)});
test('a new connect attempt fences an earlier tab without accepting its grant',async t=>{const f=fixture(t),old=await f.connect(),current=await f.connect();await assert.rejects(f.callback(old));await f.callback(current);assert.equal((await f.service.status(f.ctx)).state,'connected')});

const refreshed={access_token:'refreshed-access',token_type:'Bearer',expires_in:3600};
test('transport retry is durable, bounded and retains scopes/token when Google omits them',async t=>{
 const f=fixture(t);await f.callback(await f.connect());await f.service.initializeManagedCalendar();let calls=0;
 f.setRefresh(async()=>{calls++;throw Error('secret timeout')});f.setTime(5000000);
 await assert.rejects(f.service.poll());const state=f.store.get('poll-state');assert.equal(calls,1);assert.equal(state.failures,1);assert.ok(state.nextAt>=5060000&&state.nextAt<=5065000);
 f.restart();assert.deepEqual(await f.service.poll(),{skipped:true});assert.equal(calls,1);
 f.setTime(state.nextAt);f.setRefresh(async()=>{calls++;return refreshed});assert.deepEqual(await f.service.poll(),{synced:true});assert.equal(calls,2);assert.equal(f.connection().credentials.refreshToken,'synthetic-refresh');assert.equal(f.connection().credentials.scope,calendarScopes.join(' '));assert.equal(f.store.get('poll-state').failures,0);
});
test('expired refresh after restart can retry and late rejected response cannot erase successor',async t=>{
 const f=fixture(t);await f.callback(await f.connect());f.setTime(5000000);let resolve;
 f.setRefresh(()=>new Promise(r=>resolve=r));const pending=f.service.initializeManagedCalendar();await new Promise(r=>setImmediate(r));
 await assert.rejects(f.service.initializeManagedCalendar(),{code:'busy'});const oldLease=f.connection().refresh.lease;
 f.restart();f.setTime(5060000);f.setRefresh(async()=>refreshed);await f.service.initializeManagedCalendar();assert.equal(f.connection().refresh,null);assert.equal(f.connection().credentials.accessToken,'refreshed-access');
 resolve({error:'invalid_grant'});await assert.rejects(pending);assert.equal(f.connection().credentials.accessToken,'refreshed-access');assert.notEqual(f.connection().refresh?.lease,oldLease);
});
test('late success or failure after reconnect cannot replace or delete fresh credentials',async t=>{
 for(const result of [refreshed,{error:'invalid_grant'}]){
  const f=fixture(t);await f.callback(await f.connect());f.setTime(5000000);let resolve;f.setRefresh(()=>new Promise(r=>resolve=r));const pending=f.service.initializeManagedCalendar();await new Promise(r=>setImmediate(r));
  await f.callback(await f.connect());const generation=f.connection().generation;resolve(result);await assert.rejects(pending);assert.equal(f.connection().generation,generation);assert.equal(f.connection().credentials.accessToken,'synthetic-access');
 }
});
test('explicit rejected Google grant requires consent and retains safe diagnosis',async t=>{
 const f=fixture(t);await f.callback(await f.connect());f.setTime(5000000);f.setRefresh(async()=>({error:'invalid_grant',error_description:'synthetic-secret'}));await assert.rejects(f.service.initializeManagedCalendar(),{code:'reconnect_required'});assert.equal(f.connection().credentials,undefined);assert.equal(f.connection().state,'needs_consent');assert.deepEqual(f.connection().refreshFailure,{reason:'invalid_grant',at:5000000});
});

test('expired lease fences late replies even while its successor is in flight',async t=>{
 for(const late of [refreshed,{error:'invalid_grant'}]){
  const f=fixture(t);await f.callback(await f.connect());f.setTime(5000000);let resolveOld,resolveNew;
  f.setRefresh(()=>new Promise(r=>resolveOld=r));const old=f.service.initializeManagedCalendar();await new Promise(r=>setImmediate(r));
  f.setTime(5060000);f.setRefresh(()=>new Promise(r=>resolveNew=r));const next=f.service.initializeManagedCalendar();await new Promise(r=>setImmediate(r));const lease=f.connection().refresh.lease;
  assert.equal(f.connection().refreshFailure.reason,'lease_expired');resolveOld(late);await assert.rejects(old);assert.equal(f.connection().refresh.lease,lease);assert.equal(f.connection().credentials.refreshToken,'synthetic-refresh');
  resolveNew(refreshed);await next;assert.equal(f.connection().credentials.accessToken,'refreshed-access');
 }
});
