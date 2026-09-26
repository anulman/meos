// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createNodeWebHandler} from '../backend/node-web-server.mjs'
test('production web host validates target, restricts static paths and disables demo worker',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'meos-static-'));fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'_shell.html'),'<html>synthetic shell</html>');fs.writeFileSync(path.join(root,'assets/a.js'),'export {}');let calls=0
 const server=http.createServer(createNodeWebHandler({origin:'https://meos.invalid',root,upstream:async()=>{calls++;return Response.json({user:null})}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port
 const request=(url,headers={},method='GET',body)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:url,method,headers:{Host:'meos.invalid',...headers}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:data,headers:res.headers}))});req.on('error',reject);req.end(body)})
 try{
  assert.equal((await request('/settings',{Host:'foreign.invalid'})).status,400)
  assert.equal((await request('/settings')).status,200)
  const config=await request('/config.js');assert.match(config.body,/"demo":false/);assert.equal(config.headers['cache-control'],'no-store')
  for(const route of ['/mockServiceWorker.js','/private/synthetic-credentials.json','/backend/domain.mjs','/assets/../secret','/api/auth/v1/status','/api/admin/v1/users','/api/meos/v1/mcp'])assert.equal((await request(route)).status,404)
  assert.equal(calls,0);assert.equal((await request('/api/meos/v1/session')).status,200);assert.equal(calls,1)
  assert.equal((await request('/assets/a.js')).headers['content-type'],'text/javascript; charset=utf-8')
  assert.equal((await request('/api/meos/v1/resources/tasks',{'Content-Type':'application/json'},'POST','x'.repeat(150001))).status,413);assert.equal(calls,1)
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true})}
})
