// SPDX-License-Identifier: Apache-2.0
// Dedicated native agent principal with sync:read/sync:write only, never owner
// credentials. The upstream is a fixed protected Unix socket, not caller URLs.
export function createCalendarPlannerClient({upstream,origin,credentials,now=Date.now}){
 if(!credentials||!/^[-0-9a-f]{36}$/.test(credentials.agentId??'')||typeof credentials.email!=='string'||typeof credentials.password!=='string'||credentials.password.length<32)throw Error('planner_credentials');
 let token,expires=0;
 async function login(){
  const r=await upstream(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:credentials.email,password:credentials.password})}));
  if(![200,303].includes(r.status))throw Error('planner_auth');
  const cookies=r.headers.getSetCookie(),raw=cookies.find(c=>c.startsWith('auth_token='));
  if(!raw)throw Error('planner_auth');token=raw.split(';')[0].slice(11);if(!/^[A-Za-z0-9._~-]+$/.test(token))throw Error('planner_auth');
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));if(![credentials.agentId,Buffer.from(credentials.agentId.replaceAll('-',''),'hex').toString('base64url'),Buffer.from(credentials.agentId.replaceAll('-',''),'hex').toString('base64url')+'=='].includes(claims.sub)||!Number.isFinite(claims.exp)||claims.exp*1000<=now())throw Error('planner_identity');expires=claims.exp*1000;
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
