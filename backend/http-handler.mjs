// SPDX-License-Identifier: Apache-2.0
import { DomainError, uuid } from './domain.mjs'
import { boundedText } from './body.mjs'

const resources=new Set(['projects','tasks','routines','occurrences','outcomes','periodNotes'])
const status={validation:422,unauthenticated:401,expired:401,forbidden:403,conflict:409,not_found:404,unavailable:503,invalid_response:502}
const response=(body,code=200)=>new Response(code===204?null:JSON.stringify(body),{status:code,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
function csrfEqual(left,right) {
 if(typeof left!=='string'||typeof right!=='string'||left.length>256||right.length>256||!left.length||left.length!==right.length)return false
 let diff=0;for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i)
 return diff===0
}
/** Runtime binding supplies `user` from authenticated TrailBase context, NOT body/headers.
 * This is a handler function, not a second general-purpose server or an auth implementation.
 */
function createHttpFlow({commands,weather,bridge,origin,basePath='/api/meos/v1'}) {
 const expected=new URL(origin)
 if(expected.origin!==origin||!['https:','http:'].includes(expected.protocol)||!/^\/[a-z0-9/_-]+$/.test(basePath))throw new Error('Invalid handler routing configuration')
 return function* handle(request,user) {
  try {
   if(!user)throw new DomainError('unauthenticated','Sign in required')
   uuid(user.id)
   const url=new URL(request.url)
   if(url.origin!==origin||!url.pathname.startsWith(basePath+'/'))throw new DomainError('not_found','Route not found')
   const parts=url.pathname.slice(basePath.length+1).split('/')
   const method=request.method
   if(!['GET','POST','PUT','DELETE'].includes(method))throw new DomainError('not_found','Route not found')
   if(method!=='GET') {
    if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site'||!csrfEqual(request.headers.get('X-CSRF-Token'),user.csrf))throw new DomainError('forbidden','Mutation origin or CSRF rejected')
   }
   let body
   if(method==='POST'||method==='PUT') {
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))throw new DomainError('validation','JSON body required')
    const length=Number(request.headers.get('Content-Length')??0)
    if(length>150000)throw new DomainError('validation','Request too large')
    const text=yield {kind:'body',request,maxBytes:150000}
    try{body=JSON.parse(text)}catch{throw new DomainError('validation','Invalid JSON')}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['value','expectedRevision'].includes(key)))throw new DomainError('validation','Invalid command envelope')
   }
   if(parts.length===2&&parts[0]==='bridge'&&parts[1]==='location'&&method==='POST'&&bridge) {
    if(body.expectedRevision!==undefined)throw new DomainError('validation','Revision is not a location field')
    return response(yield {kind:'bridge',userId:user.id,observation:body.value})
   }
   if(bridge?.ownerFor(user.id))throw new DomainError('forbidden','Bridge identity cannot access planner resources')
   if(parts[0]==='resources'&&resources.has(parts[1])) {
    const kind=parts[1],id=parts[2]
    if(parts.length>3)throw new DomainError('not_found','Route not found')
    if(method==='GET')return response(id?commands.get(user.id,kind,id):commands.list(user.id,kind,{cursor:url.searchParams.get('cursor')??undefined,limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):100}))
    if(method==='POST'&&!id)return response(commands.create(user.id,kind,body.value),201)
    if(method==='PUT'&&id){if(body.value?.id!==id)throw new DomainError('validation','Resource identity mismatch');return response(commands.update(user.id,kind,body.value,body.expectedRevision))}
    if(method==='DELETE'&&kind==='outcomes'&&id){commands.removeOutcome(user.id,id,Number(url.searchParams.get('revision')));return response(null,204)}
   }
   if(parts[0]==='commands'&&method==='POST') {
    if(parts[1]==='archive-project'&&parts.length===3)return response(commands.archiveProject(user.id,parts[2],body.expectedRevision))
    if(parts.length===2&&['occurrence','period-note'].includes(parts[1]))return response(commands.saveNatural(user.id,parts[1]==='occurrence'?'occurrences':'periodNotes',body.value,body.expectedRevision))
   }
   if(parts.length===1&&parts[0]==='preferences') {
    if(method==='GET')return response(commands.getPreferences(user.id))
    if(method==='PUT')return response(commands.savePreferences(user.id,body.value,body.expectedRevision))
   }
   if(parts.length===1&&parts[0]==='weather'&&method==='GET'&&weather)return response(yield {kind:'weather',userId:user.id,preferences:commands.getPreferences(user.id).value})
   throw new DomainError('not_found','Route not found')
  }catch(error){
   if(error instanceof DomainError)return response({error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}},status[error.code]??500)
   // No SQL, request body, coordinates, stack or credential detail leaves this boundary.
   return response({error:{code:'unavailable',message:'Service unavailable'}},503)
  }
 }
}

/** Async Fetch adapter and synchronous WASIp2 adapter drive identical routing,
 * authorization, validation and command code. Effects are the only difference. */
export function createHttpHandler(options) {
 const flow=createHttpFlow(options)
 return async (request,user)=>{
  const iterator=flow(request,user);let step=iterator.next()
  while(!step.done) {
   try {
    const effect=step.value
    const value=await (effect.kind==='body'?boundedText(effect.request,effect.maxBytes):effect.kind==='bridge'?options.bridge.ingest(effect.userId,effect.observation):options.weather.read(effect.userId,effect.preferences))
    step=iterator.next(value)
   }catch(error){step=iterator.throw(error)}
  }
  return step.value
 }
}
export function createSynchronousHttpHandler(options,{readText}) {
 const flow=createHttpFlow(options)
 return (request,user)=>{
  const iterator=flow(request,user);let step=iterator.next()
  while(!step.done) {
   try {
    const effect=step.value
    const value=effect.kind==='body'?readText(effect.request,effect.maxBytes):effect.kind==='bridge'?options.bridge.ingest(effect.userId,effect.observation):options.weather.read(effect.userId,effect.preferences)
    if(value&&typeof value.then==='function')throw new Error('Async effect in synchronous guest')
    step=iterator.next(value)
   }catch(error){step=iterator.throw(error)}
  }
  return step.value
 }
}
