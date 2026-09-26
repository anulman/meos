// SPDX-License-Identifier: Apache-2.0
// Thin Node host adapter: the browser proxy and domain handler remain authoritative.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {createProtectedApiProxy} from './protected-proxy.mjs'
export function unixUpstream({origin,socketPath}){
 if(!path.isAbsolute(socketPath))throw Error('Absolute private socket required')
 return async request=>{const url=new URL(request.url);if(url.origin!==origin)throw Error('Foreign upstream forbidden');const body=request.method==='GET'?undefined:Buffer.from(await request.arrayBuffer());return new Promise((resolve,reject)=>{const req=http.request({socketPath,method:request.method,path:url.pathname+url.search,headers:{...Object.fromEntries(request.headers),Host:url.host}},res=>{const parts=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>67108864){res.destroy(Error('Response limit'));return}parts.push(chunk)});res.on('error',reject);res.on('end',()=>{const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(res.statusCode===204?null:Buffer.concat(parts),{status:res.statusCode,headers}))})});req.setTimeout(15000,()=>req.destroy(Error('Upstream timeout')));req.on('error',reject);req.end(body)})}
}
export function createNodeWebHandler({origin,root,upstream,demo=false,accessOwner}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('Exact HTTPS origin required');const directory=path.resolve(root),proxy=createProtectedApiProxy({origin,upstream})
 return async(req,res)=>{try{
  if(req.headers.host!==url.host||!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end('Invalid request target');return}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>150000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined});const response=(accessOwner?.check(request))??(await accessOwner?.session(request))??(await proxy(request))
  if(response){const headers=Object.fromEntries(response.headers);delete headers['set-cookie'];const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));return}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const pathname=new URL(request.url).pathname;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store')
  if(pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(req.method==='HEAD'?undefined:'window.MEOS_CONFIG='+JSON.stringify({demo,accessGated:!!accessOwner,timezone:'UTC',apiBase:'/api'})+';');return}
  let file;if(['/','/week','/settings'].includes(pathname))file=path.join(directory,'_shell.html');else if(/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname))file=path.join(directory,pathname.slice(1));else if(demo&&pathname==='/mockServiceWorker.js')file=path.join(directory,'mockServiceWorker.js')
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(directory)+path.sep)){res.writeHead(404);res.end('Not found');return}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream')
  if(pathname.startsWith('/assets/'))res.setHeader('Cache-Control','public, max-age=31536000, immutable')
  res.end(req.method==='HEAD'?undefined:fs.readFileSync(file))
 }catch{if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});res.end('Service unavailable')}}
}
