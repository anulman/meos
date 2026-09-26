import {createCalendarService} from '../backend/calendar-service.mjs'
import {openCalendarDurableStore} from '../backend/calendar-durable-store.mjs'
import {createCalendarRpcHandler} from '../backend/calendar-rpc.mjs'
import {calendarScopes} from '../backend/calendar-oauth.mjs'
import path from 'node:path'
// SPDX-License-Identifier: Apache-2.0
// Runs only inside trusted candidate acceptance namespace; no production data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {syntheticAccess} from './access-synthetic.mjs'
import {proveAccessBrowser} from './integration-access-browser.mjs'
const config=JSON.parse(fs.readFileSync('/run/meos/runtime.json')),credentials=JSON.parse(fs.readFileSync('private/synthetic-credentials.json'))
const owner=credentials.users[0],access=syntheticAccess(owner.email,owner.id)
config.access=access.policy;fs.writeFileSync('private/runtime.json',JSON.stringify(config));fs.writeFileSync('private/owner.json',JSON.stringify({email:owner.email,password:owner.password}));fs.writeFileSync('private/access-public/keys.json',JSON.stringify(access.keys))
const calendarStore=openCalendarDurableStore({directory:path.resolve('private/calendar-state')});
let calendarTime=Date.now();const remoteEvents=new Map();
const calendar=createCalendarService({config:{origin:config.origin,ownerId:owner.id,ownerEmail:owner.email,clientId:'synthetic.apps.googleusercontent.com',redirectUri:config.origin+'/api/calendar/google/callback'},store:calendarStore,now:()=>calendarTime,broker:{tokenExchange:async()=>({access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:calendarScopes.join(' '),id_token:'synthetic-id'}),refreshExchange:async()=>{throw Error('fixture')},verifyIdentity:async()=>({email:owner.email,emailVerified:true}),createCalendar:async()=>({id:'synthetic-managed'}),listEvents:async({calendarId})=>({items:calendarId==='primary'?[]:[...remoteEvents.values()],nextSyncToken:'synthetic-token'}),getEvent:async({eventId})=>{if(!remoteEvents.has(eventId))throw Object.assign(Error('missing'),{status:404});return remoteEvents.get(eventId)},insertEvent:async({event})=>{const e={...event,etag:'synthetic-etag',status:'confirmed'};remoteEvents.set(e.id,e);return e},patchEvent:async({eventId,event})=>{const e={...remoteEvents.get(eventId),...event,etag:'synthetic-etag-2'};remoteEvents.set(e.id,e);return e},deleteEvent:async({eventId})=>{remoteEvents.set(eventId,{id:eventId,status:'cancelled'})}}});
const calendarCallback=calendar.callback;calendar.callback=async input=>{const result=await calendarCallback(input);await calendar.initializeManagedCalendar();await calendar.poll();return result};
const edit=calendar.editEvent;calendar.editEvent=async input=>{const result=await edit(input);calendarTime+=65001;await calendar.poll();return result};
const calendarServer=http.createServer(createCalendarRpcHandler({service:calendar,ownerId:owner.id}));await new Promise(resolve=>calendarServer.listen('private/calendar/control.sock',resolve));
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port
const child=spawn('/bin/sh',['-c','LISTEN_FDS=1 LISTEN_PID=$$ exec /opt/node/bin/node scripts/serve-real.mjs'],{stdio:['ignore','ignore','pipe',listener._handle.fd],env:{PATH:'/opt/node/bin:/usr/bin:/bin',HOME:'/tmp'}})
const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve)})
let error='';child.stderr.on('data',chunk=>error+=chunk);listener.close()
const request=(path,method='GET',body,headers={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers:{Host:new URL(config.origin).host,'Cf-Access-Jwt-Assertion':access.token,...headers}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}))});req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('timeout')));req.end(body)})
try{
 let ready=false;for(let i=0;i<40;i++){assert.equal(child.exitCode,null,error);try{if((await request('/config.js')).status===200){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}assert(ready)
 assert.equal((await request('/settings')).status,200)
 const login=await request('/api/meos/v1/session');assert.equal(login.status,200);assert.equal(login.headers['set-cookie'].length,2);assert.equal(JSON.parse(login.body).user.id,owner.id)
 const cookie=login.headers['set-cookie'].map(v=>v.split(';')[0]).join('; ');const session=await request('/api/meos/v1/session','GET',undefined,{Cookie:cookie});assert.equal(session.status,200);assert.equal(JSON.parse(session.body).user.id,owner.id)
 for(const token of ['', 'spoofed'])assert.equal((await request('/api/meos/v1/session','GET',undefined,{'Cf-Access-Jwt-Assertion':token,'Cf-Access-Authenticated-User-Email':owner.email})).status,403)
 assert.equal((await request('/api/auth/v1/login','POST','',{'Content-Type':'application/x-www-form-urlencoded',Origin:config.origin})).status,404)
 for(const path of ['/api/_admin/user','/api/meos/v1/mcp','/api/meos/v1/bridge','/mockServiceWorker.js'])assert.equal((await request(path)).status,404)
 assert.equal((await request('/settings','GET',undefined,{Host:'foreign.invalid'})).status,400)
 await proveAccessBrowser({port,origin:config.origin,access,owner,calendar:true})
 fs.writeFileSync('production-path-evidence.json',JSON.stringify({runId:process.env.MEOS_ACCEPTANCE_RUN,count:4,checks:['actual serve-real entry consumes inherited listener and verifies production-mode instance','verified Access owner receives automatic native session, protected cookies; unsigned/spoofed origins and password login denied','raw admin MCP bridge and legacy worker denied','foreign Host denied']},null,2));console.log('PASS 4 actual production-entrypoint checks in isolated candidate')
}finally{await new Promise(resolve=>calendarServer.close(resolve));calendarStore.close();child.kill('SIGTERM');await Promise.race([exited,new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve()},2000))])}
