// SPDX-License-Identifier: Apache-2.0
// Run behind a separately restricted egress boundary. This module accepts operations,
// never caller URLs; deployment must also prove network-level isolation.
import {createPublicKey,verify} from 'node:crypto';
const bounded = (v,max=16384) => {if(typeof v!=='string'||!v||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('invalid_input');return v};
export function createGoogleBroker({clientId,clientSecret,redirectUri,fetcher=fetch}) {
 bounded(clientId);bounded(clientSecret);bounded(redirectUri);
 async function request(url,{method='GET',body,accessToken,form=false,etag}={}) {
  const headers={Accept:'application/json'};
  if(etag)headers['If-Match']=bounded(etag);
  if(accessToken)headers.Authorization='Bearer '+bounded(accessToken);
  if(body)headers['Content-Type']=form?'application/x-www-form-urlencoded':'application/json';
  let response;try{response=await fetcher(url,{method,headers,body:body?(form?new URLSearchParams(body).toString():JSON.stringify(body)):undefined,redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw Error('google_unavailable')}
  let bytes=0,parts=[];const reader=response.body?.getReader();
  try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4*1024*1024)throw Error('google_response_limit');parts.push(Buffer.from(value))}}finally{await reader?.cancel().catch(()=>{})}
  // Preserve only known OAuth error codes, never provider descriptions or bodies.
  // Server/rate-limit failures cannot establish grant rejection.
  if(form&&[400,401].includes(response.status)){
   let code;try{code=JSON.parse(Buffer.concat(parts).toString('utf8')).error}catch{}
   if(['invalid_grant','invalid_client','unauthorized_client','temporarily_unavailable','server_error'].includes(code))return {error:code};
  }
  if(!response.ok){const error=Error('google_rejected');error.status=response.status;let reasons=[];try{reasons=JSON.parse(Buffer.concat(parts).toString('utf8')).error?.errors?.map(e=>e.reason)??[]}catch{}error.retryable=reasons.some(r=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded'].includes(r));throw error}
  try{return bytes?JSON.parse(Buffer.concat(parts).toString('utf8')):{}}catch{throw Error('google_invalid_response')}
 }
 const calendarPath=id=>'/calendars/'+encodeURIComponent(bounded(id,2048));
 const api=(path,options)=>request('https://www.googleapis.com/calendar/v3'+path,options);
 return {
  async tokenExchange(i){if(i.clientId!==clientId||i.redirectUri!==redirectUri||i.grantType!=='authorization_code')throw Error('invalid_exchange');return request('https://oauth2.googleapis.com/token',{method:'POST',form:true,body:{client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code',code:bounded(i.code),code_verifier:bounded(i.codeVerifier)}})},
  async refreshExchange(i){if(i.clientId!==clientId||i.grantType!=='refresh_token')throw Error('invalid_exchange');return request('https://oauth2.googleapis.com/token',{method:'POST',form:true,body:{client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:bounded(i.refreshToken)}})},
  async verifyIdentity({idToken,clientId:audience,nonce,now}){
   if(audience!==clientId||!Number.isSafeInteger(now))throw Error('invalid_identity');const parts=bounded(idToken).split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('invalid_identity');
   const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
   if(header.alg!=='RS256'||typeof header.kid!=='string'||header.crit!==undefined||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||claims.azp&&claims.azp!==clientId||!Number.isFinite(claims.exp)||claims.exp<=now/1000||!Number.isFinite(claims.iat)||claims.iat>now/1000+30||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now/1000+30)||claims.nonce!==nonce||claims.email_verified!==true||typeof claims.email!=='string'||typeof claims.sub!=='string'||!claims.sub)throw Error('invalid_identity');
   const bundle=await request('https://www.googleapis.com/oauth2/v3/certs');const keys=bundle.keys?.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');if(keys?.length!==1||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:keys[0],format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('invalid_identity');
   return {email:claims.email,emailVerified:true};
  },
  createCalendar:({accessToken,summary})=>{if(summary!=='MeOS')throw Error('invalid_calendar');return api('/calendars',{method:'POST',accessToken,body:{summary}})},
  getEvent:({calendarId,eventId,accessToken})=>api(calendarPath(calendarId)+'/events/'+encodeURIComponent(bounded(eventId)),{accessToken}),
  insertEvent:({calendarId,event,accessToken})=>{if(calendarId==='primary')throw Error('primary_read_only');return api(calendarPath(calendarId)+'/events',{method:'POST',accessToken,body:event})},
  patchEvent:({calendarId,eventId,event,etag,accessToken})=>{if(calendarId==='primary'||!etag)throw Error('invalid_write');return api(calendarPath(calendarId)+'/events/'+encodeURIComponent(bounded(eventId)),{method:'PATCH',accessToken,etag,body:event})},
  deleteEvent:({calendarId,eventId,etag,accessToken})=>{if(calendarId==='primary'||!etag)throw Error('invalid_write');return api(calendarPath(calendarId)+'/events/'+encodeURIComponent(bounded(eventId)),{method:'DELETE',accessToken,etag})},
  listWindow:({calendarId,accessToken,timeMin,timeMax,pageToken})=>{const q=new URLSearchParams({singleEvents:'true',showDeleted:'false',maxResults:'2500',timeMin:bounded(timeMin),timeMax:bounded(timeMax)});if(pageToken)q.set('pageToken',bounded(pageToken));return api(calendarPath(calendarId)+'/events?'+q,{accessToken})},
  listEvents:({calendarId,accessToken,syncToken,pageToken})=>{const q=new URLSearchParams({showDeleted:'true',singleEvents:'false',maxResults:'2500'});if(syncToken)q.set('syncToken',bounded(syncToken));if(pageToken)q.set('pageToken',bounded(pageToken));return api(calendarPath(calendarId)+'/events?'+q,{accessToken})},
 };
}
