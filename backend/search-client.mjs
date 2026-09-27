// SPDX-License-Identifier: Apache-2.0
import {unixUpstream} from './node-web-server.mjs'
const operations=new Set(['search_index_status','search_index_batch','search_index_commit','configure_search'])
/** A host-installed worker uses the admitted private socket, not the Access-
 * protected browser origin. The native backend still authenticates the bearer
 * identity and checks its owner-bound search:index grant on every request. */
export function createSearchClient({origin,socketPath,token}){
 const url=new URL(origin)
 if(url.protocol!=='https:'||url.origin!==origin)throw Error('Exact HTTPS origin required')
 if(typeof token!=='string'||! /^[A-Za-z0-9._~-]+$/.test(token))throw Error('Owner-bound search:index agent token required')
 const upstream=unixUpstream({origin,socketPath});let sequence=0
 return async (name,args)=>{
  if(!operations.has(name))throw Error('Unsupported search worker operation')
  const response=await upstream(new Request(origin+'/api/meos/v1/mcp',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream','Content-Type':'application/json','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}})}))
  if(!response.ok)throw Error('Search worker transport unavailable')
  const result=await response.json();if(result.error||result.result?.isError||!result.result?.structuredContent)throw Error('Search worker operation rejected')
  return result.result.structuredContent
 }
}
