// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import http from 'node:http'
import {createProtectedApiProxy} from '../backend/protected-proxy.mjs'
const q=new URL('../.qualification/',import.meta.url)
const endpoint=JSON.parse(readFileSync(new URL('acceptance-endpoint.json',q))),credentials=JSON.parse(readFileSync(new URL('synthetic-credentials.json',q)))
assert.equal(endpoint.runId,credentials.runId);assert.equal(process.getuid(),10001);assert.match(readFileSync('/proc/self/status','utf8'),/CapEff:\s+0000000000000000/)
const origin=endpoint.origin,checks=[]
const upstream=async request=>{
 const url=new URL(request.url);assert.equal(url.origin,origin)
 const body=request.method==='GET'?undefined:Buffer.from(await request.arrayBuffer())
 return new Promise((resolve,reject)=>{
  const req=http.request({socketPath:'/run/meos-acceptance-data/server.sock',method:request.method,path:url.pathname+url.search,headers:{...Object.fromEntries(request.headers),Host:url.host}},res=>{
   const parts=[];let size=0
   res.on('data',part=>{size+=part.length;if(size>500000){res.destroy(Error('Upstream body limit'));return}parts.push(part)})
   res.on('error',reject)
   res.on('end',()=>{const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(res.statusCode===204?null:Buffer.concat(parts),{status:res.statusCode,headers}))})
  });req.setTimeout(10000,()=>req.destroy(Error('Upstream timeout')));req.on('error',reject);req.end(body)
 })
}
const handle=createProtectedApiProxy({origin,upstream}),user=credentials.users[0]
const login=await handle(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:user.email,password:user.password})}))
assert.equal(login.status,200);assert.equal(await login.text(),'Signed in');checks.push('live form proxy does not export native tokens')
const cookies=login.headers.getSetCookie();assert.equal(cookies.length,2);for(const value of cookies)assert.match(value,/Secure; HttpOnly; SameSite=Lax; Max-Age=\d+$/);checks.push('live login cookies normalized Secure HttpOnly Lax')
const cookie=cookies.map(value=>value.split(';')[0]).join('; ')
let session=await handle(new Request(origin+'/api/meos/v1/session',{headers:{Cookie:cookie}}));const safe=await session.json();assert.equal(safe.user.id,user.id);assert.deepEqual(Object.keys(safe).sort(),['csrf','user']);checks.push('proxy reload uses safe session projection')
for(const path of ['/api/auth/v1/status','/api/auth/v1/logout','/api/admin/v1/users','/api/meos/v1/bridge/location'])assert.equal((await handle(new Request(origin+path,{headers:{Cookie:cookie}}))).status,404);checks.push('native token admin logout and bridge paths denied')
const logout=csrf=>new Request(origin+'/api/meos/auth/logout',{method:'POST',headers:{Origin:origin,'X-CSRF-Token':csrf,Cookie:cookie}})
assert.equal((await handle(logout('wrong'))).status,403);checks.push('live logout rejects wrong CSRF')
const result=await handle(logout(safe.csrf));assert.equal(result.status,204);assert.deepEqual(result.headers.getSetCookie(),['auth_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0','refresh_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0']);checks.push('live logout emits browser-valid cookie deletions')
const refresh=cookie.split('; ').find(value=>value.startsWith('refresh_token='));session=await handle(new Request(origin+'/api/meos/v1/session',{headers:{Cookie:refresh}}));assert.deepEqual(await session.json(),{user:null});checks.push('proxy logout revokes native refresh session')
const proof={runId:endpoint.runId,checks,count:checks.length,network:'none; UID10001 and zero effective capabilities'};writeFileSync(new URL('proxy-live-checks.json',q),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof))
