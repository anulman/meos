// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {createMcpHandler} from '../backend/mcp.mjs'
import {runSearchWorker} from './search-worker.mjs'
const vector=Array.from({length:1536},(_,i)=>i?0:1)
test('installed worker doctor and batch use private native socket; scope denial survives transport',async()=>{
 const root=mkdtempSync(join(tmpdir(),'meos-search-socket-')),socket=join(root,'backend.sock'),origin='https://inaccessible-browser.example.invalid'
 let scopes=['search:index'],commits=0,leases=0,publicRequests=0
 const commands={agentGrant:()=>({active:true,owner:'01992ac0-0000-7000-8000-000000000001',scopes}),invoke(owner,name,args){
  if(name==='search_index_status')return {enabled:true,model:'text-embedding-3-small',dimensions:1536,pending:1}
  if(name==='search_index_batch'){leases++;return {enabled:true,model:'text-embedding-3-small',dimensions:1536,items:[{id:1,revision:1,text:'Synthetic text',attempt:1}]}}
  if(name==='search_index_commit'){assert.deepEqual(args.embedding,vector);commits++;return {accepted:true}}
  throw Error('unexpected operation')
 }}
 const handler=createMcpHandler({commands,origin,readText:r=>r.bodyText})
 const server=http.createServer(async(req,res)=>{
  if(req.url!=='/api/meos/v1/mcp'){publicRequests++;res.writeHead(403);res.end();return}
  assert.equal(req.headers.host,new URL(origin).host)
  let body='';for await(const part of req)body+=part
  const response=handler({method:req.method,headers:new Headers(req.headers),bodyText:body},req.headers.authorization==='Bearer synthetic-native-token'?{id:'01992ac0-0000-7000-8000-000000000002'}:null)
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
 })
 await new Promise(resolve=>server.listen(socket,resolve))
 const env={MEOS_SEARCH_ENABLED:'true',MEOS_PUBLIC_ORIGIN:origin,MEOS_SEARCH_SOCKET:socket,MEOS_SEARCH_AGENT_TOKEN:'synthetic-native-token',MEOS_OPENAI_API_KEY:'synthetic-provider-not-used'}
 try{
  // Actual installed entrypoint as a child, not a mocked fetch or alternate URL.
  const child=spawn(process.execPath,[new URL('./search-worker.mjs',import.meta.url).pathname,'--doctor'],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
  assert.equal(await new Promise(resolve=>child.on('exit',resolve)),0,stderr)
  const doctor=JSON.parse(stdout);assert.equal(doctor.transport,'private-native-socket');assert.equal(doctor.authenticated,true);assert.equal(doctor.providerContacted,false);assert.equal(leases,0)
  const batch=await runSearchWorker({env,embed:async text=>{assert.equal(text,'Synthetic text');return vector}})
  assert.equal(batch.completed,1);assert.equal(commits,1);assert.equal(publicRequests,0)
  scopes=['search:read'];await assert.rejects(runSearchWorker({env,doctor:true}));assert.equal(leases,1)
  await assert.rejects(runSearchWorker({env:{...env,MEOS_SEARCH_AGENT_TOKEN:'wrong'},doctor:true}))
  const unit=readFileSync(new URL('../deployment/meos-search.service',import.meta.url),'utf8')
  assert.match(unit,/AF_UNIX/);assert.match(unit,/BindReadOnlyPaths=@BACKEND_SOCKET@:\/run\/meos-search\/backend.sock/)
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true})}
})
