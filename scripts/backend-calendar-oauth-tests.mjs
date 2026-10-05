// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createCalendarOAuth,CalendarOAuthError,calendarScopes} from '../backend/calendar-oauth.mjs'
const config={clientId:'synthetic.apps.googleusercontent.com',ownerEmail:'owner@example.invalid',origin:'https://meos.example.invalid',redirectUri:'https://meos.example.invalid/api/calendar/google/callback'}
function fixture(overrides={}){
 let time=1000000,counter=0,connection,lease,exchanges=0,generation='epoch-1'
 const attempts=new Map(),seen={}
 const store={async putAttempt(key,value){assert(!attempts.has(key));attempts.set(key,{...value,generation})},async consumeAttempt(key){const v=attempts.get(key);attempts.delete(key);return v},async saveConnection(owner,value,expected){if(expected.generation!==generation)return false;connection={...value,owner};lease=undefined;generation='epoch-'+(++counter);return true},async beginRefresh(){if(!connection)return null;if(lease)return {busy:true};lease='lease-'+(++counter);return {lease,refreshToken:connection.refreshToken,scope:connection.scope}},async finishRefresh(owner,current,value){if(current!==lease)return false;connection={...connection,...value};lease=undefined;return true},async failRefresh(owner,current,{reconnectRequired}){if(current!==lease)return false;lease=undefined;if(reconnectRequired)connection=undefined;return true}}
 const response={access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:calendarScopes.join(' '),id_token:'synthetic-id'}
 const options={config,store,now:()=>time,random:n=>Buffer.alloc(n,++counter),tokenExchange:async input=>{exchanges++;seen.exchange=input;return {...response}},refreshExchange:async input=>{seen.refresh=input;return {...response,refresh_token:'rotated-synthetic-refresh'}},verifyIdentity:async input=>{seen.identity=input;return {email:config.ownerEmail,emailVerified:true}},...overrides}
 const core=createCalendarOAuth(options)
 const start=async()=>{const result=await core.start({owner:'synthetic-owner',session:'synthetic-session'});return new URL(result.authorizationUrl)}
 const callback=async(url,extra={})=>core.callback({owner:'synthetic-owner',session:'synthetic-session',state:url.searchParams.get('state'),code:'synthetic-code',...extra})
 return {core,options,store,attempts,seen,response,start,callback,setTime:n=>time=n,get connection(){return connection},get exchanges(){return exchanges},fence:()=>{lease='new-generation';generation='new-generation';connection=undefined}}
}
test('OAuth start persists owner/session-bound expiring state and PKCE without verifier in URL',async()=>{
 const f=fixture(),url=await f.start(),a=[...f.attempts.values()][0]
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri)
 assert.equal(url.searchParams.get('scope'),calendarScopes.join(' '));assert.equal(url.searchParams.get('access_type'),'offline')
 assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(a.verifier).digest('base64url'))
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(!url.href.includes(a.verifier));assert(!f.attempts.has(url.searchParams.get('state')))
 assert.equal(a.expiresAt-a.createdAt,600000);assert.notEqual(a.ownerHash,'synthetic-owner')
})
test('callback stores secrets privately, verifies identity/nonce and returns safe connected result',async()=>{
 const f=fixture(),url=await f.start(),a=[...f.attempts.values()][0],result=await f.callback(url)
 assert.deepEqual(result,{status:'connected',email:config.ownerEmail});assert.equal(f.connection.refreshToken,'synthetic-refresh')
 assert.equal(f.seen.exchange.codeVerifier,a.verifier);assert.equal(f.seen.identity.nonce,a.nonce);assert.equal(f.attempts.size,0)
 assert(!JSON.stringify(result).includes('synthetic-access'))
})
test('single-use state rejects replay and parallel callbacks before second exchange',async()=>{
 const f=fixture(),url=await f.start(),results=await Promise.allSettled([f.callback(url),f.callback(url)])
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.exchanges,1)
 await assert.rejects(f.callback(url),{code:'invalid_callback'})
})
for(const change of [{owner:'other-owner'},{session:'other-session'}])test('mismatched binding consumes state without exchange '+Object.keys(change)[0],async()=>{
 const f=fixture(),url=await f.start();await assert.rejects(f.callback(url,change),{code:'invalid_callback'});assert.equal(f.exchanges,0);await assert.rejects(f.callback(url),{code:'invalid_callback'})
})
test('expiry boundary and backwards clock rejected',async()=>{
 for(const time of [999999,1600000]){const f=fixture(),url=await f.start();f.setTime(time);await assert.rejects(f.callback(url),{code:'invalid_callback'});assert.equal(f.exchanges,0)}
})
test('denial and malformed callbacks never exchange codes or leak provider error',async()=>{
 const f=fixture(),url=await f.start();await assert.rejects(f.callback(url,{code:undefined,error:'secret-provider-diagnostic'}),e=>e.code==='denied'&&!e.message.includes('secret'))
 assert.equal(f.exchanges,0);await assert.rejects(f.callback(url,{state:'bad'}),{code:'invalid_callback'})
})
test('missing scope, refresh grant or ID token cannot create connected state',async()=>{
 for(const patch of [{scope:'openid email'},{refresh_token:undefined},{id_token:undefined}]){const f=fixture();f.response.scope=calendarScopes.join(' ');Object.assign(f.response,patch);const url=await f.start();await assert.rejects(f.callback(url),CalendarOAuthError);assert.equal(f.connection,undefined)}
})
test('wrong account, unverified email and failed verifier cannot connect',async()=>{
 for(const verifyIdentity of [async()=>({email:'other@example.invalid',emailVerified:true}),async()=>({email:config.ownerEmail,emailVerified:false}),async()=>{throw Error('secret-id-token')}]){const f=fixture({verifyIdentity}),url=await f.start();await assert.rejects(f.callback(url),{code:'account_mismatch'});assert.equal(f.connection,undefined)}
})
test('uncertain code exchange consumes state and requires fresh authorization',async()=>{
 const f=fixture({tokenExchange:async()=>{throw Error('secret-code network timeout')}}),url=await f.start()
 await assert.rejects(f.callback(url),e=>e.code==='reconnect_required'&&!e.message.includes('secret'));await assert.rejects(f.callback(url),{code:'invalid_callback'});assert.equal(f.connection,undefined)
})
test('configuration rejects non-HTTPS and foreign callback before persistence',()=>{
 for(const patch of [{origin:'http://meos.example.invalid'},{redirectUri:'https://evil.example.invalid/callback'},{clientId:'x&redirect_uri=evil'},{origin:'https://meos.example.invalid/path'}])assert.throws(()=>fixture({config:{...config,...patch}}),{code:'configuration'})
})
test('refresh persists rotation, returns no token and retains refresh token when omitted',async()=>{
 const f=fixture();await f.callback(await f.start());const result=await f.core.refresh({owner:'synthetic-owner'});assert.equal(f.connection.refreshToken,'rotated-synthetic-refresh');assert(!JSON.stringify(result).includes('synthetic'))
 const g=fixture({refreshExchange:async()=>({access_token:'new-access',expires_in:3600,token_type:'Bearer'})});await g.callback(await g.start());await g.core.refresh({owner:'synthetic-owner'});assert.equal(g.connection.refreshToken,'synthetic-refresh')
})
test('only rejected refresh grants clear credentials; temporary and malformed failures retain them',async()=>{
 const rejected=fixture({refreshExchange:async()=>({error:'invalid_grant',error_description:'secret'})});await rejected.callback(await rejected.start());await assert.rejects(rejected.core.refresh({owner:'synthetic-owner'}),{code:'reconnect_required'});assert.equal(rejected.connection,undefined)
 for(const response of [{error:'invalid_client'},{error:'unauthorized_client'},{error:'temporarily_unavailable'},{error:'unknown-secret'},{access_token:'new',expires_in:-1},{}]){
  const f=fixture({refreshExchange:async()=>response});await f.callback(await f.start());await assert.rejects(f.core.refresh({owner:'synthetic-owner'}),{code:'unavailable'});assert.equal(f.connection.refreshToken,'synthetic-refresh')
 }
 const f=fixture({refreshExchange:async()=>{throw Error('secret network timeout')}});await f.callback(await f.start());await assert.rejects(f.core.refresh({owner:'synthetic-owner'}),e=>e.code==='unavailable'&&!e.message.includes('secret'));assert.equal(f.connection.refreshToken,'synthetic-refresh')
})
test('refresh lease fences concurrent refresh and disconnect/reconnect generation',async()=>{
 let resolve;const f=fixture({refreshExchange:()=>new Promise(r=>resolve=r)});await f.callback(await f.start());const first=f.core.refresh({owner:'synthetic-owner'});await new Promise(r=>setImmediate(r));await assert.rejects(f.core.refresh({owner:'synthetic-owner'}),{code:'busy'});f.fence();resolve({...f.response});await assert.rejects(first,{code:'unavailable'});assert.equal(f.connection,undefined)
})
test('persistence and malformed provider errors are redacted',async()=>{
 const f=fixture();f.store.putAttempt=async()=>{throw Error('secret filesystem credentials')};await assert.rejects(f.start(),e=>e.code==='unavailable'&&!e.message.includes('secret'))
 const g=fixture();g.response.expires_in=-1;await assert.rejects(g.callback(await g.start()),{code:'reconnect_required'})
})
test('canonical Google email scope accepted and pending flow survives core recreation with durable adapter',async()=>{
 const f=fixture();f.response.scope=calendarScopes.map(s=>s==='email'?'https://www.googleapis.com/auth/userinfo.email':s).join(' ')
 const url=await f.start(),restarted=createCalendarOAuth(f.options)
 assert.equal((await restarted.callback({owner:'synthetic-owner',session:'synthetic-session',state:url.searchParams.get('state'),code:'synthetic-code'})).status,'connected')
})
test('disconnect fences an OAuth exchange already in flight',async()=>{
 let resolve;const f=fixture({tokenExchange:()=>new Promise(r=>resolve=r)}),url=await f.start(),pending=f.callback(url)
 await new Promise(r=>setImmediate(r));f.fence();resolve({...f.response});await assert.rejects(pending,{code:'reconnect_required'});assert.equal(f.connection,undefined)
})
