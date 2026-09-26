// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {createProtectedApiProxy} from '../backend/protected-proxy.mjs'
const origin='https://meos-acceptance.invalid'
test('proxy denies native token/admin/record paths and JSON login before upstream',async()=>{
 let calls=0;const handle=createProtectedApiProxy({origin,upstream:()=>{calls++;throw Error('unexpected')}})
 for(const path of ['/api/auth/v1/status','/api/auth/v1/logout','/api/auth/v1/register','/api/admin/v1/users','/api/records/v1/tasks'])assert.equal((await handle(new Request(origin+path))).status,404)
 assert.equal((await handle(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}))).status,403)
 assert.equal(calls,0)
})
test('logout requires origin and verified CSRF then canonical protected deletions',async()=>{
 const calls=[];const handle=createProtectedApiProxy({origin,upstream:async request=>{calls.push(new URL(request.url).pathname);return request.url.endsWith('/session')?Response.json({user:{id:'synthetic'},csrf:'expected'}):new Response('logged out')}})
 const request=(token='expected',source=origin)=>new Request(origin+'/api/meos/auth/logout',{method:'POST',headers:{Origin:source,'X-CSRF-Token':token,Cookie:'auth_token=synthetic'}})
 assert.equal((await handle(request('bad'))).status,403);assert.equal(calls.length,1)
 assert.equal((await handle(request('expected','https://production.invalid'))).status,403);assert.equal(calls.length,1)
 const result=await handle(request());assert.equal(result.status,204)
 assert.deepEqual(result.headers.getSetCookie(),['auth_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0','refresh_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'])
 assert.equal(calls.at(-1),'/api/auth/v1/logout')
})
test('form login strips forged host context/bearer and normalizes cookie attributes',async()=>{
 let forwarded;const handle=createProtectedApiProxy({origin,upstream:async request=>{forwarded=request;return new Response('logged in',{headers:[['Set-Cookie','auth_token=abc.def; HttpOnly; Secure; SameSite=None; Max-Age=300'],['Set-Cookie','refresh_token=xyz; HttpOnly; Secure; SameSite=None; Max-Age=86400']]})}})
 const result=await handle(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','__context':'forged',Authorization:'Bearer fake'},body:'email=synthetic%40example.invalid&password=test'}))
 assert.equal(result.status,200);assert.equal(forwarded.headers.has('__context'),false);assert.equal(forwarded.headers.has('Authorization'),false)
 assert.match(result.headers.getSetCookie()[0],/Secure; HttpOnly; SameSite=Lax; Max-Age=300$/)
 assert.equal(await result.text(),'Signed in')
})
