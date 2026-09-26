// SPDX-License-Identifier: Apache-2.0
// Transport only: identity and durable state are owned by the native guest.
import {setTimeout as delay} from 'node:timers/promises'
import {boundedText} from './body.mjs'
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
export function createNotificationHost({origin,upstream,maxActive=128}) {
 let active=0
 return async request=>{
  const url=new URL(request.url),op=url.pathname.split('/').at(-1)
  if(url.origin!==origin||url.search||request.method!=='POST'||request.headers.has('Cookie')||request.headers.has('Origin'))return json({error:'forbidden'},403)
  if(!['poll','ack','status','configure','reconcile','refresh'].some(name=>url.pathname==='/api/meos/agent/'+name))return json({error:'not_found'},404)
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return json({error:'validation'},415)
  if(active>=maxActive)return new Response(null,{status:429,headers:{'Retry-After':'5'}})
  active++
  try {
   const body=JSON.parse(await boundedText(request,150000))
   if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'validation'},400)
   if(op==='refresh') {
    if(Object.keys(body).length!==1||typeof body.refresh_token!=='string'||body.refresh_token.length>4096)return json({error:'validation'},400)
    const result=await upstream(new Request(origin+'/api/auth/v1/refresh',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:request.signal}))
    if(!result.ok)return json({error:result.status>=500?'unavailable':'unauthenticated'},result.status>=500?503:401)
    const value=await result.json();return json({auth_token:value.auth_token,refresh_token:value.refresh_token})
   }
   const bearer=request.headers.get('Authorization')??''
   if(!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer))return json({error:'unauthenticated'},401)
   if(body.op!==undefined)return json({error:'validation'},400)
   const waitMs=body.waitMs??25000;delete body.waitMs
   if(!Number.isInteger(waitMs)||waitMs<0||waitMs>60000)return json({error:'validation'},400)
   const deadline=performance.now()+(op==='poll'?waitMs:0)
   const operationSignal=op==='poll'&&waitMs>0?AbortSignal.any([request.signal,AbortSignal.timeout(waitMs)]):request.signal
   do {
    request.signal.throwIfAborted()
    const result=await upstream(new Request(origin+'/api/meos/v1/notifications',{method:'POST',headers:{Authorization:bearer,'Content-Type':'application/json'},body:JSON.stringify({...body,op}),signal:operationSignal}))
    if(!result.ok)return json({error:({401:'unauthenticated',403:'forbidden',409:'conflict',400:'validation'})[result.status]??'unavailable'},result.status)
    const value=await result.json()
    if(op!=='poll'||value.items?.length||performance.now()>=deadline)return json(value)
    await delay(Math.min(1000,Math.max(1,deadline-performance.now())),undefined,{signal:request.signal})
    if(performance.now()>=deadline)return json(value)
   }while(true)
  }catch(e){if(request.signal.aborted)throw e;return json({error:e instanceof SyntaxError?'validation':'unavailable'},e instanceof SyntaxError?400:503)}
  finally{active--}
 }
}
export function notificationNodeHandler({origin,handle}) {
 return async(req,res)=>{
  const abort=new AbortController(),disconnect=()=>{if(!res.writableEnded)abort.abort()};res.on('close',disconnect)
  try {
   if(req.headers.host!==new URL(origin).host||!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return}
   const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>150000){res.writeHead(413);res.end();return}chunks.push(chunk)}
   const response=await handle(new Request(origin+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined,signal:abort.signal}))
   if(!abort.signal.aborted){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}
  }catch{if(!abort.signal.aborted){res.writeHead(503);res.end()}}
  finally{res.off('close',disconnect)}
 }
}
