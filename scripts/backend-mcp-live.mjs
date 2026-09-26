// SPDX-License-Identifier: Apache-2.0
import {readFileSync,writeFileSync} from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createRuntime} from '/run/meos-mcporter/node_modules/mcporter/dist/runtime.js'
const q=new URL('../.qualification/',import.meta.url),credentials=JSON.parse(readFileSync(new URL('synthetic-credentials.json',q))),endpoint=JSON.parse(readFileSync(new URL('acceptance-endpoint.json',q)))
assert.equal(credentials.runId,endpoint.runId);assert.equal(process.getuid(),10001)
assert.match(readFileSync('/proc/self/status','utf8'),/CapEff:\s+0000000000000000/)
assert.throws(()=>readFileSync('/home/clawy/.openclaw/openclaw.json'));assert.throws(()=>readFileSync('/var/run/docker.sock'))
await new Promise((resolve,reject)=>{const s=net.createConnection({host:'192.0.2.1',port:5432});s.on('connect',()=>{s.destroy();reject(Error('production network available'))});s.on('error',resolve);s.setTimeout(1000,()=>{s.destroy();reject(Error('no immediate network denial'))})})
const checks=['production network, paths and credentials denied']
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name)}
function upstream(path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request({socketPath:'/run/meos-acceptance-data/server.sock',path,method,headers:{Host:'meos-acceptance.invalid',...headers}},res=>{const data=[];res.on('data',b=>data.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(data).toString()}))});req.on('error',reject);req.end(body)})}
async function login(role){const user=credentials.users.find(x=>x.email.startsWith(role+'-'));assert.ok(user);const r=await upstream('/api/auth/v1/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:endpoint.origin},body:new URLSearchParams({email:user.email,password:user.password}).toString()});assert.ok([200,303].includes(r.status));const cookies=r.headers['set-cookie'];return {cookie:cookies.map(s=>s.split(';')[0]).join('; '),token:cookies.find(s=>s.startsWith('auth_token=')).split(';')[0].slice('auth_token='.length)}}
const agent=await login('agent'),owner=await login('owner')
const ownerSession=JSON.parse((await upstream('/api/meos/v1/session',{headers:{Cookie:owner.cookie}})).body)
const browserHeaders={Cookie:owner.cookie,Origin:endpoint.origin,'X-CSRF-Token':ownerSession.csrf,'Content-Type':'application/json'}
const operation=(name,input)=>upstream('/api/meos/v1/operations/'+name,{method:'POST',headers:browserHeaders,body:JSON.stringify(input)})
// Only a loopback relay inside the disposable network namespace. Fixed UDS only.
const server=http.createServer(async(req,res)=>{try{if(req.url!=='/mcp'){res.writeHead(404).end();return}const chunks=[];for await(const c of req)chunks.push(c);const r=await upstream('/api/meos/v1/mcp',{method:req.method,headers:{...req.headers,host:'meos-acceptance.invalid'},body:Buffer.concat(chunks)});res.writeHead(r.status,r.headers);res.end(r.body)}catch{res.writeHead(503).end()}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const runtime=await createRuntime({servers:[{name:'meos',command:{kind:'http',url:new URL('http://127.0.0.1:'+server.address().port+'/mcp'),headers:{Authorization:'Bearer '+agent.token}}}],rootDir:'/tmp',logger:{debug(){},info(){},warn(){},error(){}}})
try{
 const tools=await runtime.listTools('meos',{includeSchema:true,disableOAuth:true,timeoutMs:10000})
 check('MCPorter 0.14.1 actual Streamable HTTP initialization and scoped discovery',tools.some(t=>t.name==='list_agenda')&&tools.some(t=>t.name==='apply_schedule')&&!tools.some(t=>t.name==='bind_external_event'))
 const today=new Date().toISOString().slice(0,10),id=randomUUID(),input={value:{id,title:'MCPorter synthetic task',notes:{type:'doc'},completed:false,priority:'none',schedule:{date:today,time:'13:15',timezone:'UTC'}},idempotencyKey:randomUUID()}
 const call=(name,args)=>runtime.callTool('meos',name,{args,disableOAuth:true,timeoutMs:10000})
 const created=await call('create_task',input)
 check('real MCPorter tool call returns structured output',created.structuredContent?.value?.id===id)
 const repeat=await call('create_task',input);check('MCP retry is idempotent',repeat.structuredContent?.revision===1)
 const agenda=await call('list_agenda',{date:today,timezone:'UTC'});check('MCP reads owner-bound browser domain data',agenda.structuredContent.items.some(x=>x.value.id===id))
 const actual=await upstream('/api/meos/v1/resources/tasks/'+id,{headers:{Cookie:owner.cookie}});check('browser reads same MCP-created record',actual.status===200&&JSON.parse(actual.body).value.id===id)
 const deny=await upstream('/api/meos/v1/resources/tasks',{headers:{Authorization:'Bearer '+agent.token}});check('agent native token denied browser resource API',deny.status===403)
 const rpc={jsonrpc:'2.0',id:99,method:'tools/list'},h={'Content-Type':'application/json',Accept:'application/json, text/event-stream'}
 check('owner native token has no implicit agent grant',(await upstream('/api/meos/v1/mcp',{method:'POST',headers:{...h,Authorization:'Bearer '+owner.token},body:JSON.stringify(rpc)})).status===403)
 check('browser cookies cannot authenticate MCP',(await upstream('/api/meos/v1/mcp',{method:'POST',headers:{...h,Cookie:owner.cookie},body:JSON.stringify(rpc)})).status===401)
 check('MCP cross-origin denied',(await upstream('/api/meos/v1/mcp',{method:'POST',headers:{...h,Authorization:'Bearer '+agent.token,Origin:'https://evil.invalid'},body:JSON.stringify(rpc)})).status===403)
 const r={id:randomUUID(),title:'Independent daily',notes:{type:'doc'},timezone:'UTC',time:'10:00',weekdays:[0,1,2,3,4,5,6],recurrenceIntent:{text:'every day',anchorDate:today}}
 let result=await upstream('/api/meos/v1/resources/routines',{method:'POST',headers:browserHeaders,body:JSON.stringify({value:r})});check('routine creation with shared recurrence contract live',result.status===201)
 const dates=Array.from({length:15},(_,i)=>new Date(Date.parse(today+'T00:00Z')+i*86400000).toISOString().slice(0,10))
 result=await operation('materialize_routine',{routineId:r.id,through:dates.at(-1),ids:Object.fromEntries(dates.map(d=>[d,randomUUID()])),idempotencyKey:randomUUID()});check('real guest materializes exactly bounded rolling horizon',result.status===200&&JSON.parse(result.body).items.length===15)
 const items=JSON.parse(result.body).items,first=items[0]
 result=await operation('move_occurrence',{id:first.value.id,expectedRevision:first.revision,idempotencyKey:randomUUID(),schedule:{date:dates[1],time:'12:00',timezone:'UTC'},title:'Moved independently'})
 check('real guest move preserves original slot and identity',result.status===200&&JSON.parse(result.body).value.date===today&&JSON.parse(result.body).value.id===first.value.id)
 const tooFar=new Date(Date.parse(today+'T00:00Z')+15*86400000).toISOString().slice(0,10)
 result=await operation('materialize_routine',{routineId:r.id,through:tooFar,ids:{},idempotencyKey:randomUUID()});check('real guest rejects day fifteen',result.status===422)
 const unscheduled={...input.value,id:randomUUID(),schedule:undefined}
 await operation('create_task',{value:unscheduled,idempotencyKey:randomUUID()})
 result=await operation('list_agenda',{date:today,timezone:'UTC'});check('real daily agenda excludes unscheduled',result.status===200&&!JSON.parse(result.body).items.some(x=>x.value.id===unscheduled.id))
 const conflict=await call('create_task',{...input,value:{...input.value,title:'Different'}});check('MCP typed payload conflict',conflict.isError===true&&JSON.parse(conflict.content[0].text).error.code==='conflict')
 const preview=await call('preview_schedule',{changes:[{kind:'tasks',id,expectedRevision:1,schedule:{date:today,time:'14:00',timezone:'UTC'}}]});check('real guest preview is non-mutating',preview.structuredContent.applied===false)
 const applyInput={changes:[{kind:'tasks',id,expectedRevision:1,schedule:{date:today,time:'14:00',timezone:'UTC'}},{kind:'occurrences',id:first.value.id,expectedRevision:1,schedule:null}],idempotencyKey:randomUUID()}
 const failed=await call('apply_schedule',applyInput);check('real guest stale schedule rejected atomically',failed.isError===true)
 result=await upstream('/api/meos/v1/resources/tasks/'+id,{headers:{Cookie:owner.cookie}});check('real guest failed schedule leaves first target unchanged',JSON.parse(result.body).revision===1)
 writeFileSync(new URL('mcp-live-checks.json',q),JSON.stringify({runId:endpoint.runId,mcporter:'0.14.1',checks,count:checks.length},null,2));console.log(JSON.stringify({count:checks.length,checks}))
}finally{await runtime.close();await new Promise(resolve=>server.close(resolve))}
