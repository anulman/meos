// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
const root=path.resolve('dist/client')
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1:3181');if(url.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.MEOS_CONFIG={demo:true,timezone:"UTC",apiBase:"/api"}');return}let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+'/'))file=root+'/_shell.html';if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=root+'/_shell.html';res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file))})
await new Promise(resolve=>server.listen(3181,'127.0.0.1',resolve));fs.mkdirSync('artifacts',{recursive:true})
const suites=['browser.mjs','browser-b.mjs','browser-c.mjs','browser-d.mjs','browser-shell.mjs','browser-anchor.mjs']
try{for(const script of suites)await new Promise((resolve,reject)=>{const proc=spawn('/opt/node/bin/node',['scripts/'+script],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:'/tmp',CHROMIUM_PATH:'/opt/playwright/browsers/chromium-1208/chrome-linux64/chrome',PREVIEW_URL:'http://127.0.0.1:3181',MEOS_TEST_URL:'http://127.0.0.1:3181'}});proc.on('error',reject);proc.on('exit',code=>code===0?resolve():reject(Error(script+' failed '+code))) });fs.writeFileSync('demo-evidence.json',JSON.stringify({suites,count:suites.length,runId:process.env.MEOS_ACCEPTANCE_RUN},null,2))}finally{await new Promise(resolve=>server.close(resolve))}
