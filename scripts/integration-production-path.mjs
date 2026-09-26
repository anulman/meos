// SPDX-License-Identifier: Apache-2.0
// Runs only inside trusted candidate acceptance namespace; no production data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import {spawn} from 'node:child_process'
const config=JSON.parse(fs.readFileSync('/run/meos/runtime.json')),credentials=JSON.parse(fs.readFileSync('private/synthetic-credentials.json'))
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port
const child=spawn('/bin/sh',['-c','LISTEN_FDS=1 LISTEN_PID=$$ exec /opt/node/bin/node scripts/serve-real.mjs'],{stdio:['ignore','ignore','pipe',listener._handle.fd],env:{PATH:'/opt/node/bin:/usr/bin:/bin',HOME:'/tmp'}})
const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve)})
let error='';child.stderr.on('data',chunk=>error+=chunk);listener.close()
const request=(path,method='GET',body,headers={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers:{Host:new URL(config.origin).host,...headers}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}))});req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('timeout')));req.end(body)})
try{
 let ready=false;for(let i=0;i<40;i++){assert.equal(child.exitCode,null,error);try{if((await request('/config.js')).status===200){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}assert(ready)
 assert.equal((await request('/settings')).status,200)
 const login=await request('/api/auth/v1/login','POST',new URLSearchParams({email:credentials.users[0].email,password:credentials.users[0].password}).toString(),{'Content-Type':'application/x-www-form-urlencoded',Origin:config.origin});assert([200,303].includes(login.status));assert.equal(login.headers['set-cookie'].length,2)
 const cookie=login.headers['set-cookie'].map(v=>v.split(';')[0]).join('; ');const session=await request('/api/meos/v1/session','GET',undefined,{Cookie:cookie});assert.equal(session.status,200);assert(JSON.parse(session.body).user.id)
 for(const path of ['/api/_admin/user','/api/meos/v1/mcp','/api/meos/v1/bridge','/mockServiceWorker.js'])assert.equal((await request(path)).status,404)
 assert.equal((await request('/settings','GET',undefined,{Host:'foreign.invalid'})).status,400)
 fs.writeFileSync('production-path-evidence.json',JSON.stringify({runId:process.env.MEOS_ACCEPTANCE_RUN,count:4,checks:['actual serve-real entry consumes inherited listener and verifies production-mode instance','actual unixUpstream ordinary synthetic login returns two protected cookies and authenticated session','raw admin MCP bridge and legacy worker denied','foreign Host denied']},null,2));console.log('PASS 4 actual production-entrypoint checks in isolated candidate')
}finally{child.kill('SIGTERM');await Promise.race([exited,new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve()},2000))])}
