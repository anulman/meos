// SPDX-License-Identifier: Apache-2.0
import {createEmbeddingProvider,runEmbeddingBatch} from '../backend/search-worker.mjs'
const enabled=process.env.MEOS_SEARCH_ENABLED==='true'
if(!enabled){console.log('Search embedding worker disabled; keyword search remains available');process.exit(0)}
const origin=new URL(process.env.MEOS_PUBLIC_ORIGIN)
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('MEOS_PUBLIC_ORIGIN must be an HTTPS origin')
const token=process.env.MEOS_SEARCH_AGENT_TOKEN
if(!token)throw Error('Owner-bound search:index agent token required')
const embed=createEmbeddingProvider({apiKey:process.env.MEOS_OPENAI_API_KEY})
let sequence=0
async function call(name,args){
 const response=await fetch(new URL('/api/meos/v1/mcp',origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream','Content-Type':'application/json','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}})})
 if(!response.ok)throw Error('Search worker transport unavailable')
 const result=await response.json();if(result.error||result.result?.isError||!result.result?.structuredContent)throw Error('Search worker operation rejected')
 return result.result.structuredContent
}
if(process.argv.includes('--doctor')){const response=await call('search_index_status',{});console.log(JSON.stringify({authenticated:true,enabled:response.enabled,model:response.model,dimensions:response.dimensions,providerConfigured:true,providerContacted:false}));process.exit(0)}
// One bounded run per systemd timer activation; failures become eligible after lease expiry.
const result=await runEmbeddingBatch({call,embed});console.log(JSON.stringify(result));if(result.failed)process.exitCode=1
