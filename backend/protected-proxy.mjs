// SPDX-License-Identifier: Apache-2.0
// Narrow same-origin route adapter. No authentication implementation, credentials,
// business commands, persistence or arbitrary upstream URL selection lives here.
import {boundedText} from './body.mjs'
const cookieNames=new Set(['auth_token','refresh_token'])
const json=(value,status)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
const denied=(status=404)=>json({error:{code:status===403?'forbidden':'not_found',message:status===403?'Request rejected':'Route not found'}},status)
const clearCookies=()=>[...cookieNames].map(name=>`${name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`)
function safeCookies(response) {
 const values=response.headers.getSetCookie()
 return values.map(raw=>{
  const parts=raw.split(';').map(part=>part.trim()),at=parts[0].indexOf('='),name=parts[0].slice(0,at),value=parts[0].slice(at+1)
  if(!cookieNames.has(name)||! /^[A-Za-z0-9._~+/-]*={0,2}$/.test(value))throw Error('Unexpected native cookie')
  const age=parts.find(part=>/^max-age=/i.test(part))?.slice(8)
  if(value&&(!age||!/^\d+$/.test(age)||Number(age)>31536000))throw Error('Unexpected cookie lifetime')
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value?age:0}`
 })
}
function copyCookies(headers,values){for(const value of values)headers.append('Set-Cookie',value)}
export function createProtectedApiProxy({origin,upstream}) {
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('HTTPS origin required')
 function upstreamRequest(request,path,method=request.method,body) {
  const headers=new Headers()
  for(const key of ['Cookie','Content-Type','Origin','X-CSRF-Token','Sec-Fetch-Site'])if(request.headers.has(key))headers.set(key,request.headers.get(key))
  // No caller Authorization, __context, forwarding, host or arbitrary headers.
  return new Request(origin+path,{method,headers,body})
 }
 const sameOrigin=request=>request.headers.get('Origin')===origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site'
 return async request=>{
  const url=new URL(request.url),path=url.pathname
  if(url.origin!==origin)return denied(403)
  if(!path.startsWith('/api/'))return undefined
  try {
   if(path==='/api/auth/v1/login') {
    if(request.method!=='POST'||!sameOrigin(request)||url.search)return denied(403)
    if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type')??''))return denied(403)
    const form=new URLSearchParams(await boundedText(request,8192))
    if([...form.keys()].some(key=>!['email','password'].includes(key))||form.getAll('email').length!==1||form.getAll('password').length!==1||!form.get('email')||!form.get('password'))return denied(403)
    const result=await upstream(upstreamRequest(request,path,'POST',form.toString()))
    const headers=new Headers({'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'})
    if(result.status!==200&&result.status!==303)return new Response('Sign-in failed',{status:result.status>=500?503:401,headers})
    const cookies=safeCookies(result)
    if(cookies.length!==2||new Set(cookies.map(value=>value.split('=')[0])).size!==2)throw Error('Incomplete native login cookies')
    copyCookies(headers,cookies)
    if(result.status===303)headers.set('Location','/')
    return new Response(result.status===303?null:'Signed in',{status:result.status,headers})
   }
   if(path==='/api/meos/auth/logout') {
    if(request.method!=='POST'||!sameOrigin(request)||url.search)return denied(403)
    const session=await upstream(upstreamRequest(request,'/api/meos/v1/session','GET'))
    if(!session.ok)return denied(403)
    const safe=await session.json(),csrf=request.headers.get('X-CSRF-Token')
    if(!safe?.user||typeof safe.csrf!=='string'||!csrf||csrf!==safe.csrf)return denied(403)
    const result=await upstream(upstreamRequest(request,'/api/auth/v1/logout','GET'))
    if(!result.ok&&result.status!==303)return json({error:{code:'unavailable',message:'Sign-out failed'}},503)
    const headers=new Headers({'Cache-Control':'no-store'});copyCookies(headers,clearCookies())
    return new Response(null,{status:204,headers})
   }
   if(path.startsWith('/api/meos/v1/')&&['GET','POST','PUT','DELETE'].includes(request.method)) {
    const body=['POST','PUT'].includes(request.method)?await boundedText(request,150000):undefined
    const result=await upstream(upstreamRequest(request,path+url.search,request.method,body))
    const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'})
    copyCookies(headers,safeCookies(result))
    return new Response(result.status===204?null:await result.arrayBuffer(),{status:result.status,headers})
   }
   return denied()
  }catch{return json({error:{code:'unavailable',message:'Service unavailable'}},503)}
 }
}
