// SPDX-License-Identifier: Apache-2.0
import './install-platform.mjs'
import url from 'whatwg-url'
import {readIncomingText} from './streams.mjs'
import sql from 'trailbase:database/sqlite@0.1.1'
import http from 'wasi:http/types@0.2.12'
import outgoing from 'wasi:http/outgoing-handler@0.2.12'
import {GuestHeaders,GuestResponse,Utf8Decoder,Utf8Encoder} from './platform.mjs'
import {createDatabasePort,decodeHostContext,sessionResponse,quickJsTransactionClass} from '../trailbase-port.mjs'
import {createCommands} from '../commands.mjs'
import {createSynchronousHttpHandler} from '../http-handler.mjs'
import {DomainError} from '../domain.mjs'
import {readInstance} from '../instance.mjs'
import {createSynchronousWeather} from '../weather.mjs'
import {createWeatherStorage} from '../weather-storage.mjs'

Object.assign(globalThis,{URL:url.URL,URLSearchParams:url.URLSearchParams})
// Set by the reviewed build, not by an incoming request or an owner-writable DTO.
const origin=MEOS_GUEST_ORIGIN
const database=createDatabasePort(quickJsTransactionClass(sql.Transaction))
const commands=createCommands(database)
const encode=new Utf8Encoder(),decode=new Utf8Decoder('utf-8',{fatal:true})
const dispose=resource=>resource?.[Symbol.dispose]?.()

const readText=(request,maxBytes)=>readIncomingText(request.incoming,maxBytes)
function fetchWeather(address,{timeoutMs}) {
 const target=new URL(address)
 if(target.origin!=='https://api.open-meteo.com'||target.pathname!=='/v1/forecast'||target.username||target.password)throw new DomainError('unavailable','Invalid provider target')
 const fields=new http.Fields();fields.set('accept',[encode.encode('application/json')])
 const request=new http.OutgoingRequest(fields)
 request.setMethod({tag:'get'});request.setScheme({tag:'https'});request.setAuthority(target.host);request.setPathWithQuery(target.pathname+target.search)
 const options=new http.RequestOptions(),timeout=timeoutMs*1000000
 options.setConnectTimeout(timeout);options.setFirstByteTimeout(timeout);options.setBetweenBytesTimeout(timeout)
 let future,pollable
 try {
  future=outgoing.handle(request,options);pollable=future.subscribe();pollable.block()
  const ready=future.get()
  if(ready?.tag!=='ok'||ready.val?.tag!=='ok')throw new DomainError('unavailable','Weather provider unavailable')
  const incoming=ready.val.val
  const ok=incoming.status()>=200&&incoming.status()<300
  if(!ok){dispose(incoming);return {ok:false}}
  return {ok:true,incoming}
 }finally{dispose(pollable);dispose(future);dispose(options)}
}
const weather=createSynchronousWeather({storage:createWeatherStorage(database),fetcher:fetchWeather,readText:(response,maxBytes)=>{
 try{return readText(response,maxBytes)}finally{dispose(response.incoming)}
}})
const handle=createSynchronousHttpHandler({commands,weather,origin},{readText})
export const initEndpoint={getManifest(){
 return JSON.stringify({metadata:{display_name:'MeOS',guest_runtime:'ecma_script',version:'0.1.0'},http_handlers:['get','post','put','delete'].map(method=>({method,path:'/api/meos/v1/{*path}'})),job_handlers:[],sqlite_functions:[]})
}}
export const sqliteFunctionEndpoint={dispatchScalarFunction(){throw {tag:'other',val:'No SQL functions registered'}}}
function respond(out,value) {
 const fields=new http.Fields()
 for(const [name,header] of value.headers.entries())fields.set(name,[encode.encode(header)])
 const response=new http.OutgoingResponse(fields);response.setStatusCode(value.status)
 const body=response.body()
 http.ResponseOutparam.set(out,{tag:'ok',val:response})
 let output
 try {
  output=body.write()
  for(let start=0;start<value.bytes.length;start+=16384)output.blockingWriteAndFlush(value.bytes.subarray(start,start+16384))
 }finally{dispose(output)}
 http.OutgoingBody.finish(body,null)
}
export const incomingHandler={handle(incoming,out){
 let result,headers
 try {
  headers=incoming.headers()
  const values=new GuestHeaders(headers.entries().map(([key,value])=>[key,decode.decode(value)]))
  const authority=incoming.authority(),path=incoming.pathWithQuery(),method=incoming.method().tag.toUpperCase()
  if(authority!==new URL(origin).host||typeof path!=='string'||!path.startsWith('/'))throw new DomainError('validation','Invalid request target')
  const instance=readInstance(database,MEOS_GUEST_ENVIRONMENT)
  const request={url:origin+path,method,headers:values,incoming}
  const user=decodeHostContext(values.get('__context'))
  result=method==='GET'&&path==='/api/meos/v1/instance'
   ?new GuestResponse(JSON.stringify(instance),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
   :method==='GET'&&path==='/api/meos/v1/session'?sessionResponse(user):handle(request,user)
 }catch(error){
  const unauthorized=error instanceof DomainError&&error.code==='unauthenticated'
  result=new GuestResponse(JSON.stringify({error:{code:unauthorized?'unauthenticated':'unavailable',message:unauthorized?'Sign in required':'Service unavailable'}}),{status:unauthorized?401:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
 }finally{dispose(headers)}
 try{respond(out,result)}finally{dispose(incoming)}
}}
