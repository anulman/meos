// SPDX-License-Identifier: Apache-2.0
// Thin Node host adapter: the browser proxy and domain handler remain authoritative.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {createProtectedApiProxy} from './protected-proxy.mjs'
export function unixUpstream({origin,socketPath}){
 if(!path.isAbsolute(socketPath))throw Error('Absolute private socket required')
 return async request=>{
  const url=new URL(request.url);if(url.origin!==origin)throw Error('Foreign upstream forbidden')
  const streaming=request.method==='GET'&&url.pathname==='/api/records/v1/browser_changes/subscribe/*'&&!url.search
  // Native subscriptions retain their principal. End within 55s so every reconnect
  // rechecks both the external Access identity and native owner session.
  const signal=streaming?AbortSignal.any([request.signal,AbortSignal.timeout(55000)]):request.signal
  const body=request.method==='GET'?undefined:Buffer.from(await request.arrayBuffer())
  return new Promise((resolve,reject)=>{
   const req=http.request({socketPath,signal,method:request.method,path:url.pathname+url.search,headers:{...Object.fromEntries(request.headers),Host:url.host}},res=>{
    const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1])
    if(streaming){resolve(new Response(res.statusCode===204?null:Readable.toWeb(res),{status:res.statusCode,headers}));return}
    const parts=[];let size=0
    res.on('data',chunk=>{size+=chunk.length;if(size>67108864){res.destroy(Error('Response limit'));return}parts.push(chunk)})
    res.on('error',reject);res.on('end',()=>resolve(new Response(res.statusCode===204?null:Buffer.concat(parts),{status:res.statusCode,headers})))
   })
   // Native SSE keepalive interval is ~15s; do not race it with the ordinary timeout.
   if(!streaming)req.setTimeout(15000,()=>req.destroy(Error('Upstream timeout')))
   req.on('error',reject);req.end(body)
  })
 }
}
export function createNodeWebHandler({origin,root,upstream,demo=false,accessOwner,calendarRoutes}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('Exact HTTPS origin required');const directory=path.resolve(root),proxy=createProtectedApiProxy({origin,upstream})
 return async(req,res)=>{try{
  if(req.headers.host!==url.host||!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end('Invalid request target');return}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>150000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
  const cancelled=new AbortController();res.once('close',()=>cancelled.abort());
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined,signal:cancelled.signal});
  const response=(accessOwner?.check(request))??(await accessOwner?.session(request))??(await calendarRoutes?.(request))??(await proxy(request))
  if(response){const headers=Object.fromEntries(response.headers);delete headers['set-cookie'];const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;res.writeHead(response.status,headers);if(response.headers.get('Content-Type')==='text/event-stream'&&response.body){res.flushHeaders();await pipeline(Readable.fromWeb(response.body),res)}else res.end(Buffer.from(await response.arrayBuffer()));return}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const pathname=new URL(request.url).pathname;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store')
  if(pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(req.method==='HEAD'?undefined:'window.MEOS_CONFIG='+JSON.stringify({demo,accessGated:!!accessOwner,timezone:'UTC',apiBase:'/api'})+';');return}
  let file;if(['/','/week','/settings'].includes(pathname))file=path.join(directory,'_shell.html');else if(/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname))file=path.join(directory,pathname.slice(1));else if(pathname==='/llms.txt'||/^\/skills\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.md$/.test(pathname))file=path.join(directory,pathname.slice(1));else if(demo&&pathname==='/mockServiceWorker.js')file=path.join(directory,'mockServiceWorker.js')
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(directory)+path.sep)){res.writeHead(404);res.end('Not found');return}
  res.setHeader('Content-Type',({'.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream')
  if(pathname.startsWith('/assets/'))res.setHeader('Cache-Control','public, max-age=31536000, immutable')
  res.end(req.method==='HEAD'?undefined:fs.readFileSync(file))
 }catch{if(!res.headersSent){res.writeHead(503,{'Cache-Control':'no-store'});res.end('Service unavailable')}else res.destroy()}}
}
