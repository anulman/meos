// SPDX-License-Identifier: Apache-2.0
// Stateless Streamable HTTP MCP. Native auth proves identity; DB grant binds scope/owner.
import {DomainError} from './domain.mjs'
import {operations,inlineSchema} from './contract.mjs'
const versions=['2025-11-25','2025-06-18','2025-03-26']
const json=(body,status=200)=>new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
const error=(id,code,message)=>json({jsonrpc:'2.0',id,error:{code,message}})
export function createMcpHandler({commands,origin,readText}){
 return (request,user)=>{
  let grant
  try{
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({error:'Invalid origin'},403)
   if(!user||!/^Bearer [A-Za-z0-9._~-]+$/.test(request.headers.get('Authorization')??'')||request.headers.get('Cookie')!==null)return json({error:'Bearer authentication required'},401)
   grant=commands.mcpGrant(user.id)
   if(!grant?.active)return json({error:'Delegated access denied'},403)
   if(request.method!=='POST')return json(null,405)
   const version=request.headers.get('MCP-Protocol-Version')??'2025-03-26'
   if(!versions.includes(version))return json({error:'Unsupported protocol version'},400)
   const accept=request.headers.get('Accept')??''
   if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return json({error:'Accept JSON and SSE required'},406)
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return json({error:'JSON required'},415)
   let message;try{message=JSON.parse(readText(request,150000))}catch{return error(null,-32700,'Parse error')}
   if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||message.id!==undefined&&!(typeof message.id==='string'||Number.isSafeInteger(message.id)))return error(null,-32600,'Invalid Request')
   if(message.id===undefined){if(['notifications/initialized','notifications/cancelled'].includes(message.method))return json(null,202);return json({error:'Unsupported notification'},400)}
   const id=message.id
   if(message.method==='initialize'){
    if(typeof message.params?.protocolVersion!=='string'||!message.params?.capabilities||!message.params?.clientInfo)return error(id,-32602,'Invalid initialization parameters')
    return json({jsonrpc:'2.0',id,result:{protocolVersion:versions.includes(message.params.protocolVersion)?message.params.protocolVersion:versions[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'meos',version:'0.2.0'}}})
   }
   if(message.method==='ping')return json({jsonrpc:'2.0',id,result:{}})
   if(message.method==='tools/list')return json({jsonrpc:'2.0',id,result:{tools:Object.entries(operations).filter(([,op])=>grant.scopes.includes(op.scope)).map(([name,op])=>({name,description:op.description,inputSchema:inlineSchema(op.input),outputSchema:inlineSchema(op.output),annotations:{readOnlyHint:!op.write,destructiveHint:name==='delete_task',idempotentHint:true,openWorldHint:false}}))}})
   if(message.method==='tools/call'){
    const name=message.params?.name,spec=Object.hasOwn(operations,name)?operations[name]:undefined
    if(!spec)return error(id,-32602,'Unknown tool')
    if(!grant.scopes.includes(spec.scope))return json({jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:'Scope denied'}]}})
    try{const result=commands.invoke(grant.owner,name,message.params.arguments);return json({jsonrpc:'2.0',id,result:{structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]}})}
    catch(e){if(!(e instanceof DomainError))throw e;return json({jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:JSON.stringify({error:{code:e.code,message:e.message,...(e.details?{details:e.details}:{})}})}]}})}
   }
   return error(id,-32601,'Method not found')
  }catch{return json({error:'Service unavailable'},503)}
 }
}
