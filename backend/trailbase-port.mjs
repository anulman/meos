// SPDX-License-Identifier: Apache-2.0
// Independently authored conversion boundary for trailbase:database/sqlite@0.1.1.
// No TrailBase guest SDK is imported. The admitted component compiler must inject
// the generated Transaction resource; this file alone is NOT a deployed binding.
import { DomainError, uuid } from './domain.mjs'

const invalid = () => { throw new DomainError('unavailable', 'Invalid runtime value') }
export function toSqlValue(value) {
 if(value===null)return {tag:'null'}
 if(typeof value==='string')return {tag:'text',val:value}
 if(value instanceof Uint8Array)return {tag:'blob',val:value}
 if(typeof value==='number'&&Number.isFinite(value)) {
  if(Number.isInteger(value)) {
   if(!Number.isSafeInteger(value))return invalid()
   return {tag:'integer',val:BigInt(value)}
  }
  return {tag:'real',val:value}
 }
 return invalid()
}
export function fromSqlValue(value) {
 if(!value||typeof value!=='object')return invalid()
 switch(value.tag) {
  case 'null':return null
  case 'text':if(typeof value.val==='string')return value.val;break
  case 'blob':if(value.val instanceof Uint8Array)return value.val;break
  case 'integer':if(typeof value.val==='bigint'&&value.val>=BigInt(Number.MIN_SAFE_INTEGER)&&value.val<=BigInt(Number.MAX_SAFE_INTEGER))return Number(value.val);break
  case 'real':if(typeof value.val==='number'&&Number.isFinite(value.val))return value.val;break
 }
 return invalid()
}
export function createDatabasePort(Transaction) {
 if(typeof Transaction!=='function')throw new TypeError('Transaction resource required')
 return {begin() {
  const resource=new Transaction();let closed=false
  const open=()=>{if(closed)throw new DomainError('unavailable','Transaction closed')}
  const params=values=>{if(!Array.isArray(values))return invalid();return values.map(toSqlValue)}
  const finish=method=>{
   open()
   // Failed commit remains rollback-able by the command layer. Successful
   // completion drops the component resource so host table entries cannot leak.
   resource[method]();closed=true
   resource[Symbol.dispose]?.()
  }
  return {
   query(sql,values=[]) {
    open();if(typeof sql!=='string')return invalid()
    const rows=resource.query(sql,params(values))
    if(!Array.isArray(rows)||rows.some(row=>!Array.isArray(row)))return invalid()
    return rows.map(row=>row.map(fromSqlValue))
   },
   execute(sql,values=[]) {
    open();if(typeof sql!=='string')return invalid()
    const count=resource.execute(sql,params(values))
    if(typeof count!=='bigint'||count<0n||count>BigInt(Number.MAX_SAFE_INTEGER))return invalid()
    return Number(count)
   },
   commit:()=>finish('commit'),rollback:()=>finish('rollback'),
  }
 }}
}

/** Accept only host-overwritten __context from the private WASI entrypoint.
 * Never mount this decoder behind a generic HTTP server: header trust depends
 * on pinned host overwrite behavior, which still needs a live forgery proof.
 */
export function decodeHostContext(raw) {
 if(typeof raw!=='string'||raw.length>16384)throw new DomainError('unauthenticated','Sign in required')
 let context
 try{context=JSON.parse(raw)}catch{throw new DomainError('unauthenticated','Sign in required')}
 if(context?.kind!=='Http'||!context.user)return null
 const user=context.user
 if(typeof user.id!=='string'||! /^[A-Za-z0-9_-]{22}==$/.test(user.id)||typeof user.csrf_token!=='string'||!/^[A-Za-z0-9]{20}$/.test(user.csrf_token))throw new DomainError('unauthenticated','Invalid runtime identity')
 const bytes=Uint8Array.from(atob(user.id.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))
 // Require canonical base64url; reject alternate pad-bit encodings.
 if(btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_')!==user.id)throw new DomainError('unauthenticated','Invalid runtime identity')
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
 const id=uuid(`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`)
 return {id,csrf:user.csrf_token}
}

/** Safe reload/CSRF delivery: deliberately excludes auth and refresh tokens. */
export function sessionResponse(user) {
 return new Response(JSON.stringify(user?{user:{id:user.id},csrf:user.csrf}:{user:null}),{
  status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'},
 })
}

/** QuickJS0.4.x maps WIT64-bit integers to Number, unlike Jco's BigInt ABI.
 * MeOS intentionally accepts only safe integers; reject before conversion in
 * both directions so precision loss can never become an accepted SQL value. */
export function quickJsTransactionClass(Transaction) {
 const checked=value=>{if(!Number.isSafeInteger(value))return invalid();return value}
 const toRuntime=value=>value.tag==='integer'?{tag:'integer',val:checked(Number(value.val))}:value
 const fromRuntime=value=>value?.tag==='integer'?{tag:'integer',val:BigInt(checked(value.val))}:value
 return class QuickJsTransaction {
  constructor(){this.resource=new Transaction()}
  query(sql,values){return this.resource.query(sql,values.map(toRuntime)).map(row=>row.map(fromRuntime))}
  execute(sql,values){return BigInt(checked(this.resource.execute(sql,values.map(toRuntime))))}
  commit(){return this.resource.commit()}
  rollback(){return this.resource.rollback()}
  [Symbol.dispose](){this.resource[Symbol.dispose]?.()}
 }
}
