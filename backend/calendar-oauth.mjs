// SPDX-License-Identifier: Apache-2.0
// No network or persistence implementation lives here. The host MUST supply a
// protected durable store and a fixed-target Google broker, never browser tokens.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto'

export const calendarScopes=Object.freeze([
 'https://www.googleapis.com/auth/calendar.events.owned.readonly',
 'https://www.googleapis.com/auth/calendar.app.created',
 'openid','email',
])
export class CalendarOAuthError extends Error {
 constructor(code){super(({configuration:'Google Calendar connection is not configured.',invalid_callback:'Connection request is invalid or expired. Start again.',denied:'Google Calendar connection was not approved.',account_mismatch:'Choose the configured owner Google account.',missing_scopes:'Required Calendar permissions were not granted.',reconnect_required:'Reconnect Google Calendar to continue.',unavailable:'Google Calendar connection is temporarily unavailable.',busy:'Google Calendar connection is already refreshing.'})[code]??'Google Calendar connection failed.');this.name='CalendarOAuthError';this.code=code}
}
const fail=code=>{throw new CalendarOAuthError(code)}
const hash=value=>createHash('sha256').update(value).digest('hex')
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)))
const text=(value,max=4096)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)
const token=value=>text(value,16384)
const binding=(owner,session)=>{if(!text(owner,256)||!text(session,4096))fail('invalid_callback');return {ownerHash:hash(owner),sessionHash:hash(session)}}
const safe=async fn=>{try{return await fn()}catch(e){if(e instanceof CalendarOAuthError)throw e;fail('unavailable')}}

/** Store contract (all methods async, atomic and durable before resolving):
 * putAttempt(hash,record): insert-only, stamps current owner connection generation
 * as `generation` in the stored attempt; consumeAttempt(hash): atomically REMOVE
 * and return record (or null), even if later identity/session checks fail.
 * saveConnection(owner,record,{generation}): atomically persist credentials only
 * if that owner generation is current; return true on success, false if fenced.
 * beginRefresh(owner,now): acquire exclusive fenced lease and return
 * {lease,refreshToken,scope}; null means no connection, {busy:true} means leased.
 * finishRefresh(owner,lease,record): CAS lease; return true only if still current.
 * failRefresh(owner,lease,{reconnectRequired}): CAS lease, remove invalid tokens
 * on reconnectRequired; otherwise release lease retaining prior credentials.
 * Disconnect/reconnect must fence existing leases AND pending OAuth attempts;
 * expired/crashed leases must
 * never blindly retry a refresh with uncertain rotation. Host owns reconciliation.
 * Identity verifier MUST cryptographically verify Google's ID token signature,
 * allowed issuer, audience=clientId, expiry and nonce; return {email,emailVerified}.
 * tokenExchange/refreshExchange receive no caller-controlled target URL. Their
 * errors may contain secrets; this module never forwards those messages.
 */
export function createCalendarOAuth({config,store,tokenExchange,refreshExchange,verifyIdentity,now=Date.now,random=randomBytes}) {
 config=config&&Object.freeze({...config})
 if(!config||!text(config.clientId,512)||!/^[-a-zA-Z0-9_.]+\.apps\.googleusercontent\.com$/.test(config.clientId)||!text(config.ownerEmail,320)||!/^\S+@\S+\.\S+$/.test(config.ownerEmail))fail('configuration')
 let origin;try{origin=new URL(config.origin)}catch{fail('configuration')}
 if(origin.protocol!=='https:'||origin.origin!==config.origin||origin.username||origin.password)fail('configuration')
 const redirectUri=origin.origin+'/api/calendar/google/callback'
 if(config.redirectUri!==redirectUri)fail('configuration')
 for(const name of ['putAttempt','consumeAttempt','saveConnection','beginRefresh','finishRefresh','failRefresh'])if(typeof store?.[name]!=='function')fail('configuration')
 for(const fn of [tokenExchange,refreshExchange,verifyIdentity,now,random])if(typeof fn!=='function')fail('configuration')
 const clock=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0)fail('unavailable');return n}
 const secret=()=>{const bytes=random(32);if(!(bytes instanceof Uint8Array)||bytes.length!==32)fail('unavailable');return Buffer.from(bytes).toString('base64url')}
 function credentials(result,previousScope,previousRefresh){
  if(!result||typeof result!=='object'||!token(result.access_token)||result.token_type?.toLowerCase()!=='bearer'||!Number.isSafeInteger(result.expires_in)||result.expires_in<1||result.expires_in>86400)fail('reconnect_required')
  const scope=result.scope??previousScope
  if(!text(scope,4096))fail('missing_scopes')
  const granted=new Set(scope.split(/\s+/))
  // Google's token endpoint can canonicalize the email request shorthand.
  if(granted.has('https://www.googleapis.com/auth/userinfo.email'))granted.add('email')
  if(!calendarScopes.every(s=>granted.has(s)))fail('missing_scopes')
  const refreshToken=result.refresh_token??previousRefresh
  if(!token(refreshToken))fail('reconnect_required')
  return {accessToken:result.access_token,refreshToken,scope,expiresAt:clock()+result.expires_in*1000}
 }
 return {
  start:({owner,session})=>safe(async()=>{
   const bound=binding(owner,session),state=secret(),verifier=secret(),nonce=secret(),createdAt=clock()
   await store.putAttempt(hash(state),{...bound,verifier,nonce,createdAt,expiresAt:createdAt+600000})
   const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
   for(const [k,v]of Object.entries({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:calendarScopes.join(' '),access_type:'offline',prompt:'consent',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:config.ownerEmail}))url.searchParams.set(k,v)
   return {authorizationUrl:url.href,expiresAt:createdAt+600000}
  }),
  callback:({owner,session,state,code,error})=>safe(async()=>{
   const bound=binding(owner,session)
   if(!text(state,100)||!/^[-\w]{43}$/.test(state))fail('invalid_callback')
   // Consumption precedes exchange; a failed/uncertain exchange needs a NEW
   // authorization, never replay of a one-time code whose effects are unknown.
   const attempt=await store.consumeAttempt(hash(state)),time=clock()
   if(!attempt||!text(attempt.generation,512)||!same(attempt.ownerHash,bound.ownerHash)||!same(attempt.sessionHash,bound.sessionHash)||!Number.isSafeInteger(attempt.createdAt)||!Number.isSafeInteger(attempt.expiresAt)||time<attempt.createdAt||time>=attempt.expiresAt||!token(attempt.verifier)||!token(attempt.nonce))fail('invalid_callback')
   if(error!==undefined){if(code!==undefined)fail('invalid_callback');fail('denied')}
   if(!token(code))fail('invalid_callback')
   let result;try{result=await tokenExchange({code,codeVerifier:attempt.verifier,redirectUri,clientId:config.clientId,grantType:'authorization_code'})}catch{fail('reconnect_required')}
   const record=credentials(result)
   if(!token(result.id_token))fail('reconnect_required')
   let identity;try{identity=await verifyIdentity({idToken:result.id_token,clientId:config.clientId,nonce:attempt.nonce,now:clock()})}catch{fail('account_mismatch')}
   if(identity?.emailVerified!==true||!same(identity.email?.toLowerCase(),config.ownerEmail.toLowerCase()))fail('account_mismatch')
   if(await store.saveConnection(owner,{...record,email:config.ownerEmail,connectedAt:time},{generation:attempt.generation})!==true)fail('reconnect_required')
   return {status:'connected',email:config.ownerEmail}
  }),
  refresh:({owner})=>safe(async()=>{
   if(!text(owner,256))fail('invalid_callback')
   const claim=await store.beginRefresh(owner,clock())
   if(!claim)fail('reconnect_required');if(claim.busy)fail('busy')
   if(!text(claim.lease,512)||!token(claim.refreshToken))fail('reconnect_required')
   let result
   try{result=await refreshExchange({refreshToken:claim.refreshToken,clientId:config.clientId,grantType:'refresh_token'})}
   catch{
    // Transport ambiguity can include a successful rotated grant: fail closed.
    await store.failRefresh(owner,claim.lease,{reconnectRequired:true});fail('reconnect_required')
   }
   if(result?.error){const revoked=['invalid_grant','invalid_client','unauthorized_client'].includes(result.error);await store.failRefresh(owner,claim.lease,{reconnectRequired:revoked});fail(revoked?'reconnect_required':'unavailable')}
   let record;try{record=credentials(result,claim.scope,claim.refreshToken)}catch{
    await store.failRefresh(owner,claim.lease,{reconnectRequired:true});fail('reconnect_required')
   }
   if(await store.finishRefresh(owner,claim.lease,record)!==true)fail('reconnect_required')
   return {status:'connected',expiresAt:record.expiresAt}
  }),
 }
}
