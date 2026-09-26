// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import {spawnSync} from 'node:child_process'
const checks=[];const endpoint=JSON.parse(fs.readFileSync('private/acceptance-endpoint.json'));assert.equal(endpoint.runId,process.env.MEOS_ACCEPTANCE_RUN);assert.ok(['https://meos-acceptance.invalid','https://meos.aidans.computer'].includes(endpoint.origin));const originHost=new URL(endpoint.origin).host
assert.equal(process.getuid(),61001)
assert.match(fs.readFileSync('/proc/self/status','utf8'),/CapEff:\s+0000000000000000/)
checks.push('dedicated non-root test UID distinct from backend, with zero capabilities')
const decoy=JSON.parse(fs.readFileSync('private/isolation-decoy.json'));assert.equal(decoy.uid,10001)
for(const target of ['/proc/'+decoy.pid+'/root'+decoy.path,'/proc/'+decoy.pid+'/fd/'+decoy.fd])assert.throws(()=>fs.readFileSync(target),e=>['EACCES','EPERM','ENOENT'].includes(e.code))
checks.push('backend-UID harmless process root and open-file descriptors inaccessible')
assert.deepEqual(Object.keys(process.env).sort(),['HOME','MEOS_ACCEPTANCE_RUN','PATH'])
checks.push('allowlisted environment; no inherited credentials')
for(const path of ['/home/clawy/.profile','/root/.ssh','/var/lib/docker','/mnt/HC_Volume_105243937','/run/docker.sock','/run/k3s','/run/meos-acceptance-data/main.db'])assert.equal(fs.existsSync(path),false,path)
checks.push('host credentials, production storage, Docker control and acceptance database files inaccessible')
async function denied(host,port){await new Promise((resolve,reject)=>{const socket=net.connect({host,port});socket.setTimeout(800);socket.once('connect',()=>{socket.destroy();reject(Error('Forbidden network reachable'))});socket.once('error',()=>{socket.destroy();resolve()});socket.once('timeout',()=>{socket.destroy();reject(Error('Network denial unproven (timeout)'))})})}
await denied('1.1.1.1',443);await denied('172.17.0.1',443);await denied('127.0.0.1',3180)
checks.push('internet and host gateway unroutable; host preview loopback unavailable')
await new Promise((resolve,reject)=>{http.get({socketPath:'/run/meos-acceptance-data/server.sock',path:'/api/meos/v1/session',headers:{Host:originHost}},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve)}).on('error',reject)})
await new Promise((resolve,reject)=>{http.get({socketPath:'/run/meos-acceptance-data/server.sock',path:'/api/meos/v1/instance',headers:{Host:originHost}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(body),{instanceId:process.env.MEOS_ACCEPTANCE_RUN,environment:endpoint.runtimeEnvironment??'acceptance'});resolve()}catch(e){reject(e)}})}).on('error',reject)})
checks.push('verified acceptance socket and immutable application instance match run identity')
fs.writeFileSync('isolation-proof.json',JSON.stringify({runId:process.env.MEOS_ACCEPTANCE_RUN,checks,count:checks.length},null,2))
console.log('Isolation checks passed: '+checks.length)
const mode=process.argv[2]
function run(args){const result=spawnSync('/opt/node/bin/node',args,{stdio:'inherit',env:args[0]==='--test'?{PATH:process.env.PATH}:process.env});assert.equal(result.status,0,args.join(' '))}
if(['build','browser','demo','restart','production-smoke','release'].includes(mode)){run(['scripts/licenses.mjs']);run(['node_modules/typescript/bin/tsc','--noEmit']);run(['node_modules/vite/bin/vite.js','build'])}
if(mode==='checks') {run(['scripts/generate-contract.mjs','--check']);run(['--test',...fs.readdirSync('scripts').filter(p=>/^backend-.*-tests.mjs$/.test(p)).map(p=>'scripts/'+p),'scripts/backend-tests.mjs']);run(['scripts/test-dates.mjs']);run(['scripts/test-planner-clock.mjs'])}
if(mode==='browser'||mode==='restart')await import('./integration-browser.mjs')
if(mode==='demo')await import('./integration-demo.mjs')

if(mode==='production-smoke')await import('./integration-production-path.mjs')

if(mode==='mcp')await import('./backend-mcp-live.mjs')
if(mode==='proxy')await import('./backend-proxy-live.mjs')
if(mode==='native'){const result=spawnSync('/usr/bin/python3',['scripts/backend-live-tests.py'],{stdio:'inherit',env:process.env});assert.equal(result.status,0)}

if(mode==='release'){await import('./integration-production-path.mjs');await import('./integration-browser.mjs')}
