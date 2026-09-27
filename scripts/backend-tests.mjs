// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { admitArtifact, createArgs, sha256, validatePlan, verifyRuntime } from '../backend/isolation.mjs'

// Node's builtin TS stripping; no compiler/package installation required.
registerHooks({resolve(specifier, context, next) {
 if (context.parentURL?.includes('/src/lib/') && specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts',context)
 return next(specifier,context)
}})
const codecs = await import('../src/lib/backend/codecs.ts')
const { JsonTransport } = await import('../src/lib/backend/transport.ts')
const image = 'example.invalid/meos/trailbase@sha256:' + 'a'.repeat(64)
const plan = {schema:1,environment:'acceptance',runId:'b'.repeat(32),image,syntheticOnly:true,network:'none',credentials:'fresh-in-container',endpoint:'container-unix-socket',volume:'fresh-managed',identity:'fresh-synthetic'}
const names = validatePlan(plan)
const fixture = () => ({
 container:{Image:'sha256:image',NetworkSettings:{Networks:{none:{}}},Config:{User:'10001:10001',Labels:{'meos.acceptance.run':plan.runId,'meos.environment':'acceptance'},Env:['PATH=/usr/bin:/bin']},
  HostConfig:{Memory:536870912,NanoCpus:1000000000,PidsLimit:128,NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],PortBindings:{}},
  Mounts:[{Type:'volume',Name:names.volume,Destination:'/data'}]},
 volume:{Name:names.volume,Driver:'local',Options:null,Labels:{'meos.acceptance.run':plan.runId,'meos.environment':'acceptance'}}
})

test('UUID encoding round-trips stable IDs and rejects noncanonical or malformed encodings',()=>{
 for(const id of ['0dd996fc-092d-4dbb-bac1-165e0d559c44','01994a49-9999-7999-8999-000000000001']) assert.equal(codecs.base64ToUuid(codecs.uuidToBase64(id)),id)
 assert.throws(()=>codecs.uuidToBase64('owner-controlled string'),{code:'validation'})
 assert.throws(()=>codecs.base64ToUuid('A'.repeat(22)),{code:'invalid_response'})
 const encoded=codecs.uuidToBase64('0dd996fc-092d-4dbb-bac1-165e0d559c44')
 assert.throws(()=>codecs.base64ToUuid(encoded.slice(0,-1)+'B'),{code:'invalid_response'})
})
test('inclusive calendar periods reject impossible dates and exclusive-end drift',()=>{
 codecs.assertPeriod({start:'2024-02-29',end:'2024-02-29'},'day')
 codecs.assertPeriod({start:'2026-12-28',end:'2027-01-03'},'week')
 for(const p of [{start:'2026-02-29',end:'2026-02-29'},{start:'2026-03-08',end:'2026-03-15'}]) assert.throws(()=>codecs.assertPeriod(p,'week'),{code:'validation'})
 assert.equal(codecs.isRealDate('0000-01-01'),false)
})
test('null, false and explicit clear remain different; writes require safe revisions',()=>{
 assert.equal(codecs.decodeBoolean(0),false);assert.equal(codecs.decodeBoolean(1),true)
 assert.throws(()=>codecs.decodeBoolean(null),{code:'invalid_response'})
 assert.equal(codecs.nullable(null),undefined);assert.equal(codecs.nullable(false),false)
 assert.equal(codecs.encodeOptional(undefined),null);assert.equal(codecs.encodeOptional(false),false)
 for(const value of [undefined,0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>codecs.assertRevision(value),{code:'validation'})
 codecs.assertRevision(0,true);codecs.assertRevision(1)
})
test('pagination does not silently truncate or spin on repeating cursors',async()=>{
 const calls=[]
 const rows=await codecs.collectPages(async cursor=>{calls.push(cursor);return cursor?{items:[{value:'two'}]}:{items:[{value:'one'}],nextCursor:'next'}})
 assert.equal(rows.length,2);assert.deepEqual(calls,[undefined,'next'])
 await assert.rejects(codecs.collectPages(async()=>({items:[],nextCursor:'same'})),{code:'invalid_response'})
 await assert.rejects(codecs.collectPages(async()=>({items:[],nextCursor:'more'}),1),{code:'invalid_response'})
})
test('transport blocks foreign URLs and mutations without CSRF; never follows redirects',async()=>{
 assert.throws(()=>new JsonTransport('https://production.invalid/api',()=>undefined),{code:'validation'})
 let calls=0
 const transport=new JsonTransport('/api',()=>undefined,async()=>{calls++;return Response.json({})})
 await assert.rejects(transport.request('/tasks',x=>x,{method:'POST',body:{}}),{code:'unauthenticated'})
 await assert.rejects(transport.request('/%2e%2e/private',x=>x),{code:'validation'})
 assert.equal(calls,0)
 const safe=new JsonTransport('/api',()=> 'synthetic-csrf',async(url,options)=>{
  assert.equal(url,'/api/tasks');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error')
  assert.equal(options.headers['X-CSRF-Token'],'synthetic-csrf');return Response.json({ok:true})
 })
 assert.deepEqual(await safe.request('/tasks',x=>x,{method:'POST'}),{ok:true})
})
test('late old-session success and JSON-body race are rejected after logout',async()=>{
 let release
 const transport=new JsonTransport('/api',()=>undefined,()=>new Promise(resolve=>{release=resolve}))
 const request=transport.request('/tasks',x=>x)
 transport.invalidateSession();release(Response.json({private:'old user'}))
 await assert.rejects(request,{code:'aborted'})
 let releaseBody
 const slow=new JsonTransport('/api',()=>undefined,async()=>({ok:true,status:200,json:()=>new Promise(resolve=>{releaseBody=resolve})}))
 const pending=slow.request('/tasks',x=>x)
 await new Promise(resolve=>setImmediate(resolve));slow.invalidateSession();releaseBody({private:'old user'})
 await assert.rejects(pending,{code:'aborted'})
})
test('HTTP failures have stable codes; malformed success never becomes valid data',async()=>{
 for(const [status,code] of [[401,'unauthenticated'],[403,'forbidden'],[409,'conflict'],[412,'conflict'],[503,'unavailable']]) {
  const transport=new JsonTransport('/api',()=>undefined,async()=>new Response('do not parse prose',{status}))
  await assert.rejects(transport.request('/tasks',x=>x),{code})
 }
 await assert.rejects(new JsonTransport('/api',()=>undefined,async()=>new Response('<html>')).request('/tasks',x=>x),{code:'invalid_response'})
})
test('production-target plans rejected harmlessly before any runtime invocation',()=>{
 for(const patch of [
  {environment:'production'},{endpoint:'https://production.invalid'},{endpoint:'http://127.0.0.1:3180'},
  {volume:'/production/data'},{volume:'prod-db'},{credentials:'prod-token'},
  {identity:'real-owner'},{network:'host'},{network:'production'},{syntheticOnly:false},{binds:['/var/run/docker.sock']}
 ]) assert.throws(()=>validatePlan({...plan,...patch}),/Acceptance denied/)
 const args=createArgs(plan,{command:['serve']})
 assert.equal(args.includes('--publish'),false);assert.equal(args[args.indexOf('--network')+1],'none')
 assert.equal(args[args.indexOf('--pull')+1],'never')
})
test('runtime inspection catches changed instance, volumes, networks and identity',()=>{
 const good=fixture();verifyRuntime(good.container,good.volume,plan,'sha256:image')
 for(const mutate of [
  f=>{f.container.Image='sha256:production'},
  f=>{f.container.Config.User='0:0'},
  f=>{f.container.HostConfig.NetworkMode='host'},
  f=>{f.container.NetworkSettings.Networks.production={}},
  f=>{f.container.HostConfig.Privileged=true},
  f=>{f.container.HostConfig.IpcMode='container:production'},
  f=>{f.container.HostConfig.CapAdd=['SYS_ADMIN']},
  f=>{f.container.HostConfig.SecurityOpt.push('seccomp=unconfined')},
  f=>{f.container.HostConfig.Memory=0},
  f=>{f.container.HostConfig.PortBindings={'80/tcp':[{}]}},
  f=>{f.container.HostConfig.Binds=['/production:/data']},
  f=>{f.container.Mounts[0].Name='production-data'},
  f=>{f.volume.Options={device:'/production'}},
  f=>{f.volume.Labels['meos.acceptance.run']='production'},
  f=>{f.container.Config.Env.push('DATABASE_URL=production')}
 ]) {const f=fixture();mutate(f);assert.throws(()=>verifyRuntime(f.container,f.volume,plan,'sha256:image'),/Acceptance denied/)}
})
test('invented candidate cannot self-admit; unknown/compound component license fails closed',()=>{
 assert.throws(()=>admitArtifact(image,{artifacts:[]},{}),/not in reviewed registry/)
 // Only fixture data tests the pure validator; never copied into the production registry.
 const source=Buffer.from('synthetic source'),notices=Buffer.from('synthetic notices')
 const build=license=>{
  const inventory=Buffer.from(JSON.stringify({image,coverage:'complete-runtime-and-linked-components',components:[{name:'synthetic',version:'1',artifactDigest:'sha256:'+'c'.repeat(64),selectedLicense:license}]}))
  return {evidence:{inventory,source,notices},registry:{artifacts:[{image,version:'0.33.22',reviewStatus:'approved',cliSourceReviewed:true,inventoryDigest:sha256(inventory),sourceDigest:sha256(source),noticesDigest:sha256(notices),command:['serve'],dataPath:'/data'}]}}
 }
 const valid=build('MIT');assert.equal(admitArtifact(image,valid.registry,valid.evidence).version,'0.33.22')
 for(const license of ['UNKNOWN','LGPL-3.0','MIT OR Apache-2.0']) {const f=build(license);assert.throws(()=>admitArtifact(image,f.registry,f.evidence),/unapproved component/)}
 assert.throws(()=>admitArtifact(image,valid.registry,{...valid.evidence,source:Buffer.from('changed')}),/source digest mismatch/)
})
test('actual launcher denies unreviewed artifact before Docker or service creation',()=>{
 const registry=JSON.parse(readFileSync(new URL('../backend/reviewed-artifacts.json',import.meta.url),'utf8'))
 assert.equal(registry.artifacts.some(entry=>entry.image===image),false,'fixture admission must never populate real registry')
 const result=spawnSync(process.execPath,[new URL('./backend-launch.mjs',import.meta.url).pathname,image],{encoding:'utf8',env:{PATH:'/nonexistent'}})
 assert.notEqual(result.status,0);assert.match(result.stderr,/image absent from reviewed registry/)
 assert.doesNotMatch(result.stderr,/Docker operation failed/)
})
test('cross-tab identity epoch fences late success even before queued storage event',async()=>{
 let epoch='owner-a',release
 const transport=new JsonTransport('/api',()=>undefined,async()=>({ok:true,status:200,json:()=>new Promise(resolve=>{release=resolve})}),()=>epoch)
 const pending=transport.request('/tasks',x=>x)
 await new Promise(resolve=>setImmediate(resolve));epoch='owner-b';release({private:'previous owner'})
 await assert.rejects(pending,{code:'aborted'})
})
