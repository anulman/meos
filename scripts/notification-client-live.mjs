// SPDX-License-Identifier: Apache-2.0
// Executed only by the independently admitted private-network fixture runner.
import fs from 'node:fs'
import https from 'node:https'
import {spawn,spawnSync} from 'node:child_process'
import {once} from 'node:events'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {unixUpstream} from '../backend/node-web-server.mjs'
import {createNotificationHost,notificationNodeHandler} from '../backend/notification-host.mjs'
const fixture=JSON.parse(fs.readFileSync('/private/fixture.json','utf8'))
assert.equal(process.getuid(),61005)
assert.throws(()=>fs.readFileSync('/home/clawy/.openclaw/openclaw.json'))
assert.throws(()=>fs.readFileSync('/var/run/docker.sock'))
assert.deepEqual(fs.readdirSync('/sys/class/net'),['lo'])
const native=unixUpstream({origin:fixture.origin,socketPath:'/run/native.sock'})
const login=async user=>{const r=await native(new Request(fixture.origin+'/api/auth/v1/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.origin},body:JSON.stringify({email:user.email,password:user.password})}));assert(r.ok);return r.json()}
const owner=await login(fixture.owner),notification=await login(fixture.notification)
const claims=JSON.parse(Buffer.from(owner.auth_token.split('.')[1],'base64url'))
const date=new Date(),id=randomUUID(),schedule={date:date.toISOString().slice(0,10),time:date.toISOString().slice(11,16),timezone:'UTC'}
const created=await native(new Request(fixture.origin+'/api/meos/v1/resources/tasks',{method:'POST',headers:{Authorization:'Bearer '+owner.auth_token,Origin:fixture.origin,'Content-Type':'application/json','X-CSRF-Token':claims.csrf_token},body:JSON.stringify({value:{id,title:'Stitched native transport $(not-a-command)',notes:{type:'doc'},completed:false,priority:'none',durationMinutes:30,schedule}})}));assert.equal(created.status,201)
fs.mkdirSync('/output/state',{mode:0o700});fs.mkdirSync('/output/inbox',{mode:0o700})
const credentialFile='/output/credentials.json';fs.writeFileSync(credentialFile,JSON.stringify({authToken:'invalid',refreshToken:notification.refresh_token}),{mode:0o600})
let holdAck=true,blockedAcks=0,committedAcks=0,refreshes=0
const upstream=async request=>{
 const url=new URL(request.url),body=await request.text(),headers=new Headers(request.headers);if(headers.has('Origin'))headers.set('Origin',fixture.origin)
 if(url.pathname==='/api/auth/v1/refresh')refreshes++
 if(url.pathname==='/api/meos/v1/notifications'&&JSON.parse(body).op==='ack'){
  if(holdAck){blockedAcks++;return Response.json({error:'synthetic_ack_loss'},{status:503})}
  const response=await native(new Request(fixture.origin+url.pathname,{method:request.method,headers,body,signal:request.signal}));if(response.ok)committedAcks++;return response
 }
 return native(new Request(fixture.origin+url.pathname,{method:request.method,headers,body,signal:request.signal}))
}
let handle
const server=https.createServer({key:fs.readFileSync('/private/tls.key'),cert:fs.readFileSync('/private/tls.crt')},(req,res)=>handle(req,res))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='https://127.0.0.1:'+server.address().port
handle=notificationNodeHandler({origin,handle:createNotificationHost({origin,upstream})})
fs.writeFileSync('/output/config.json',JSON.stringify({url:origin,credentialsFile:credentialFile,stateDir:'/output/state',dispatch:['/opt/node/bin/node','/app/scripts/notification-durable-adapter.mjs','/output/inbox'],dispatchTimeoutSeconds:30}),{mode:0o600})
const children=[]
const start=()=>{const p=spawn('/opt/meos-agent',['run','/output/config.json'],{env:{PATH:'/usr/bin:/bin',SSL_CERT_FILE:'/private/tls.crt'},stdio:['ignore','ignore','ignore']});children.push(p);return p}
const until=async condition=>{const deadline=performance.now()+20000;while(!condition()){if(performance.now()>deadline)throw Error('Synthetic transport deadline');await new Promise(r=>setTimeout(r,25))}}
try{
 const first=start();await until(()=>blockedAcks>0);const exit=once(first,'exit');first.kill('SIGKILL');await exit
 const accepted=JSON.parse(fs.readFileSync('/output/state/state.json')),inbox=fs.readdirSync('/output/inbox').filter(n=>n.endsWith('.json'))
 assert.equal(inbox.length,1);assert.equal(Object.keys(accepted.accepted).length,1)
 const event=JSON.parse(fs.readFileSync('/output/inbox/'+inbox[0]));assert(event.starts.some(v=>v.id===id))
 const stableId=event.id,mtime=fs.statSync('/output/inbox/'+inbox[0]).mtimeMs
 holdAck=false;const second=start();await until(()=>committedAcks>0);const stopped=once(second,'exit');second.kill('SIGTERM');const [code]=await stopped;assert.equal(code,0)
 assert.equal(fs.readdirSync('/output/inbox').filter(n=>n.endsWith('.json')).length,1);assert.equal(fs.statSync('/output/inbox/'+inbox[0]).mtimeMs,mtime)
 assert(refreshes>=1);assert.notEqual(JSON.parse(fs.readFileSync(credentialFile)).authToken,'invalid')
 const state=JSON.parse(fs.readFileSync('/output/state/state.json'));assert(state.accepted[stableId]);assert.equal(state.pending??'','')
 const receipt={runId:fixture.runId,checks:['real native bearer refresh through TLS host','real guest planned event through Go client','durable synthetic dispatcher stdin receipt','SIGKILL before ack preserves accepted journal','restart replays without duplicate queue admission','real guest acknowledgement after durable handoff','SIGTERM graceful cancellation','production paths/network absent'],count:8}
 fs.writeFileSync('/output/client-live-checks.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt))
}finally{for(const p of children)if(p.exitCode===null&&p.signalCode===null)p.kill('SIGKILL');server.closeAllConnections();await new Promise(r=>server.close(r))}
