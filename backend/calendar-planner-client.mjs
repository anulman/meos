// SPDX-License-Identifier: Apache-2.0
// Dedicated native agent principal with sync:read/sync:write only, never owner
// credentials. The upstream is a fixed protected Unix socket, not caller URLs.
export function createCalendarPlannerClient({upstream,origin,credentials,saveCredentials,now=Date.now}){
 if(!credentials||!/^[-0-9a-f]{36}$/.test(credentials.agentId??'')||!(typeof credentials.refreshToken==='string'&&typeof credentials.authToken==='string'&&typeof saveCredentials==='function')&&!(typeof credentials.email==='string'&&typeof credentials.password==='string'&&credentials.password.length>=32))throw Error('planner_credentials');
 let token,expires=0;
 function accept(value){if(typeof value!=='string'||! /^[A-Za-z0-9._~-]+$/.test(value))throw Error('planner_auth');const claims=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));const encoded=Buffer.from(credentials.agentId.replaceAll('-',''),'hex').toString('base64url');if(![credentials.agentId,encoded,encoded+'=='].includes(claims.sub)||!Number.isFinite(claims.exp)||claims.exp*1000<=now())throw Error('planner_identity');token=value;expires=claims.exp*1000}
 if(credentials.authToken){try{accept(credentials.authToken)}catch{token=null}}
 async function login(){
  if(credentials.refreshToken){
   const r=await upstream(new Request(origin+'/api/auth/v1/refresh',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:credentials.refreshToken})}));
   if(!r.ok)throw Error('planner_auth');const body=await r.json();accept(body.auth_token);const next={...credentials,authToken:body.auth_token,refreshToken:body.refresh_token??credentials.refreshToken};await saveCredentials(next);credentials=next;return;
  }
  const r=await upstream(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:credentials.email,password:credentials.password})}));
  if(![200,303].includes(r.status))throw Error('planner_auth');
  const cookies=r.headers.getSetCookie(),raw=cookies.find(c=>c.startsWith('auth_token='));
  if(!raw)throw Error('planner_auth');accept(raw.split(';')[0].slice(11));
 }
 return {async invoke(name,input){
  if(!['calendar_inventory','calendar_changes','calendar_current','calendar_apply','calendar_materialize'].includes(name))throw Error('planner_operation');
  for(let attempt=0;attempt<2;attempt++){
   if(!token||expires<=now()+30000)await login();
   const r=await upstream(new Request(origin+'/api/meos/v1/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:input}})}));
   if(r.status===401&&attempt===0){token=null;continue}if(!r.ok)throw Error('planner_unavailable');
   const body=await r.json();if(body.result?.isError){let code;try{code=JSON.parse(body.result.content?.[0]?.text).error?.code}catch{}const e=Error('planner_rejected');e.code=code;throw e}if(!body.result?.structuredContent)throw Error('planner_response');return body.result.structuredContent;
  }
  throw Error('planner_auth');
 }};
}
