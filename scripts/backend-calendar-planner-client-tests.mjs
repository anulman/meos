// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {createCalendarPlannerClient} from '../backend/calendar-planner-client.mjs';
const agentId='e6278faf-68b1-4f88-87a2-e0ab5de2675d',origin='https://synthetic.invalid';const credentials={email:'calendar@example.invalid',password:'s'.repeat(40),agentId};
test('private planner client accepts only fixed native login/MCP routes and permitted Calendar operations',async()=>{const calls=[];const token=['e30',Buffer.from(JSON.stringify({sub:agentId,exp:99999})).toString('base64url'),'synthetic'].join('.');const client=createCalendarPlannerClient({origin,credentials,now:()=>1000000,upstream:async r=>{calls.push(r);if(r.url.endsWith('/login'))return new Response(null,{status:303,headers:{'set-cookie':'auth_token='+token+'; HttpOnly'}});assert.equal(r.headers.get('Cookie'),null);assert.equal(r.headers.get('Authorization'),'Bearer '+token);return Response.json({result:{structuredContent:{items:[]}}})}});await assert.rejects(client.invoke('create_task',{}));assert.equal(calls.length,0);assert.deepEqual(await client.invoke('calendar_inventory',{kind:'tasks'}),{items:[]});assert.deepEqual(calls.map(r=>new URL(r.url).pathname),['/api/auth/v1/login','/api/meos/v1/mcp']);assert.equal(new URLSearchParams(await calls[0].text()).get('email'),credentials.email)});
test('wrong native principal and raw provider errors never leak passwords',async()=>{const token=['e30',Buffer.from(JSON.stringify({sub:'other',exp:99999})).toString('base64url'),'synthetic'].join('.');const client=createCalendarPlannerClient({origin,credentials,now:()=>1000000,upstream:async()=>new Response(null,{status:303,headers:{'set-cookie':'auth_token='+token}})});await assert.rejects(client.invoke('calendar_changes',{cursor:0}),e=>e.message==='planner_identity'&&!e.message.includes(credentials.password))});

test('native guest padded base64url UUID subject is accepted without relaxing principal binding',async()=>{for(const subject of [Buffer.from(agentId.replaceAll('-',''),'hex').toString('base64url')+'==',Buffer.alloc(16).toString('base64url')+'==']){const token=['e30',Buffer.from(JSON.stringify({sub:subject,exp:99999})).toString('base64url'),'synthetic'].join('.');const client=createCalendarPlannerClient({origin,credentials,now:()=>1000000,upstream:async r=>r.url.endsWith('/login')?new Response(null,{status:303,headers:{'set-cookie':'auth_token='+token}}):Response.json({result:{structuredContent:{items:[]}}})});if(subject.startsWith(Buffer.from(agentId.replaceAll('-',''),'hex').toString('base64url')))assert.deepEqual(await client.invoke('calendar_inventory',{kind:'tasks'}),{items:[]});else await assert.rejects(client.invoke('calendar_inventory',{kind:'tasks'}),/planner_identity/)}});

test('native refresh-only principal persists rotated credentials and rejects foreign refreshed identity',async()=>{for(const sub of [agentId,'another-principal']){let saved;const token=['e30',Buffer.from(JSON.stringify({sub,exp:99999})).toString('base64url'),'synthetic'].join('.');const paths=[];const client=createCalendarPlannerClient({origin,credentials:{agentId,authToken:'expired',refreshToken:'synthetic-refresh'},saveCredentials:c=>saved=c,now:()=>1000000,upstream:async r=>{paths.push(new URL(r.url).pathname);if(r.url.endsWith('/refresh'))return Response.json({auth_token:token,refresh_token:'rotated-synthetic-refresh'});return Response.json({result:{structuredContent:{items:[]}}})}});if(sub===agentId){assert.deepEqual(await client.invoke('calendar_inventory',{kind:'tasks'}),{items:[]});assert.equal(saved.refreshToken,'rotated-synthetic-refresh');assert.deepEqual(paths,['/api/auth/v1/refresh','/api/meos/v1/mcp'])}else{await assert.rejects(client.invoke('calendar_inventory',{kind:'tasks'}),/planner_identity/);assert.equal(saved,undefined)}}});

test('expired native session backs off both planner and mirror calls across restart, then recovers',async()=>{
 let now=1_000_000,calls=0,healthy=false,saved,health;
 const token=['e30',Buffer.from(JSON.stringify({sub:agentId,exp:99999})).toString('base64url'),'synthetic'].join('.');
 const options=()=>({origin,credentials:{agentId,authToken:'expired',refreshToken:'synthetic-refresh'},now:()=>now,health,saveHealth:v=>health=structuredClone(v),saveCredentials:v=>saved=v,upstream:async r=>{
  calls++;
  if(r.url.endsWith('/refresh'))return healthy?Response.json({auth_token:token,refresh_token:'replacement'}):new Response(null,{status:401});
  return Response.json({result:{structuredContent:{items:[]}}});
 }});
 let client=createCalendarPlannerClient(options());
 await assert.rejects(client.invoke('calendar_inventory',{kind:'routines'}),/planner_auth/);
 for(let tick=0;tick<30;tick++){now+=1000;await assert.rejects(client.invoke('calendar_cache_publish',{}),/planner_backoff/)}
 assert.equal(calls,1);assert.deepEqual(client.status(),{syncError:'session_expired',nextSyncAt:1_060_000});
 client=createCalendarPlannerClient(options());await assert.rejects(client.invoke('calendar_changes',{cursor:0}),/planner_backoff/);assert.equal(calls,1);
 now=1_060_000;await assert.rejects(client.invoke('calendar_inventory',{kind:'routines'}),/planner_auth/);assert.equal(calls,2);assert.equal(client.status().nextSyncAt,1_180_000);
 healthy=true;now=1_180_000;assert.deepEqual(await client.invoke('calendar_changes',{cursor:0}),{items:[]});assert.equal(saved.refreshToken,'replacement');assert.deepEqual(client.status(),{syncError:null,nextSyncAt:null});
});

test('concurrent reads share one refresh and errors never expose upstream text',async()=>{
 let refreshes=0,saved=0;
 const token=['e30',Buffer.from(JSON.stringify({sub:agentId,exp:99999})).toString('base64url'),'synthetic'].join('.');
 const client=createCalendarPlannerClient({origin,credentials:{agentId,authToken:'expired',refreshToken:'synthetic-refresh'},now:()=>1_000_000,saveCredentials:()=>saved++,upstream:async r=>{if(r.url.endsWith('/refresh')){refreshes++;await new Promise(resolve=>setImmediate(resolve));return Response.json({auth_token:token})}return Response.json({result:{structuredContent:{items:[]}}})}});
 await Promise.all([client.invoke('calendar_inventory',{kind:'routines'}),client.invoke('calendar_changes',{cursor:0})]);assert.equal(refreshes,1);assert.equal(saved,1);
 const failed=createCalendarPlannerClient({origin,credentials:{agentId,authToken:'expired',refreshToken:'synthetic-refresh'},now:()=>1_000_000,saveCredentials:()=>{},upstream:async()=>new Response('secret server details',{status:503})});
 await assert.rejects(failed.invoke('calendar_inventory',{kind:'routines'}),/^Error: planner_unavailable$/);assert.equal(failed.status().syncError,'retrying');
});

test('expected planner conflicts do not block following reconciliation or mirror calls',async()=>{
 const token=['e30',Buffer.from(JSON.stringify({sub:agentId,exp:99999})).toString('base64url'),'synthetic'].join('.');let calls=0;
 const client=createCalendarPlannerClient({origin,credentials:{agentId,authToken:token,refreshToken:'synthetic-refresh'},saveCredentials:()=>{},now:()=>1_000_000,upstream:async()=>{calls++;return calls===1?Response.json({result:{isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'conflict'}})}]}}):Response.json({result:{structuredContent:{items:[]}}})}});
 await assert.rejects(client.invoke('calendar_apply',{}),e=>e.code==='conflict');assert.equal(client.status().syncError,null);
 assert.deepEqual(await client.invoke('calendar_inventory',{kind:'routines'}),{items:[]});assert.equal(calls,2);
});
