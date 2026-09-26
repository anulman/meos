// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import {spawnSync} from 'node:child_process'
const checks=[]
assert.equal(process.getuid(),10001)
assert.match(fs.readFileSync('/proc/self/status','utf8'),/CapEff:\s+0000000000000000/)
checks.push('non-root with zero capabilities')
assert.deepEqual(Object.keys(process.env).sort(),['HOME','MEOS_ACCEPTANCE_RUN','PATH'])
checks.push('allowlisted environment; no inherited credentials')
for(const path of ['/home/clawy/.profile','/root/.ssh','/var/lib/docker','/mnt/HC_Volume_105243937','/run/docker.sock','/run/k3s','/run/meos-acceptance-data/main.db'])assert.equal(fs.existsSync(path),false,path)
checks.push('host credentials, production storage, Docker control and acceptance database files inaccessible')
async function denied(host,port){await new Promise((resolve,reject)=>{const socket=net.connect({host,port});socket.setTimeout(800);socket.once('connect',()=>{socket.destroy();reject(Error('Forbidden network reachable'))});socket.once('error',()=>{socket.destroy();resolve()});socket.once('timeout',()=>{socket.destroy();reject(Error('Network denial unproven (timeout)'))})})}
await denied('1.1.1.1',443);await denied('172.17.0.1',443);await denied('127.0.0.1',3180)
checks.push('internet and host gateway unroutable; host preview loopback unavailable')
await new Promise((resolve,reject)=>{http.get({socketPath:'/run/meos-acceptance-data/server.sock',path:'/api/meos/v1/session',headers:{Host:'meos-acceptance.invalid'}},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve)}).on('error',reject)})
checks.push('verified acceptance socket responds')
fs.writeFileSync('isolation-proof.json',JSON.stringify({runId:process.env.MEOS_ACCEPTANCE_RUN,checks,count:checks.length},null,2))
console.log('Isolation checks passed: '+checks.length)
const mode=process.argv[2]
function run(args){const result=spawnSync('/opt/node/bin/node',args,{stdio:'inherit'});assert.equal(result.status,0,args.join(' '))}
if(['build','browser','demo'].includes(mode)){run(['scripts/licenses.mjs']);run(['node_modules/typescript/bin/tsc','--noEmit']);run(['node_modules/vite/bin/vite.js','build'])}
if(mode==='checks') {run(['scripts/generate-contract.mjs','--check']);run(['--test',...fs.readdirSync('scripts').filter(p=>/^backend-.*-tests.mjs$/.test(p)).map(p=>'scripts/'+p),'scripts/backend-tests.mjs']);run(['scripts/test-dates.mjs']);run(['scripts/test-planner-clock.mjs'])}
if(mode==='browser'||mode==='demo')await import('./integration-browser.mjs')
