// SPDX-License-Identifier: Apache-2.0
import {pathToFileURL} from 'node:url'
import {createEmbeddingProvider,runEmbeddingBatch} from '../backend/search-worker.mjs'
import {createSearchClient} from '../backend/search-client.mjs'
export async function runSearchWorker({env,doctor=false,embed}={env:process.env}){
 if(env.MEOS_SEARCH_ENABLED!=='true')return {enabled:false,providerContacted:false}
 const call=createSearchClient({origin:env.MEOS_PUBLIC_ORIGIN,socketPath:env.MEOS_SEARCH_SOCKET??'/run/meos-search/backend.sock',token:env.MEOS_SEARCH_AGENT_TOKEN})
 const provider=embed??createEmbeddingProvider({apiKey:env.MEOS_OPENAI_API_KEY})
 if(doctor){const status=await call('search_index_status',{});return {authenticated:true,...status,providerConfigured:true,providerContacted:false,transport:'private-native-socket'}}
 return runEmbeddingBatch({call,embed:provider})
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await runSearchWorker({env:process.env,doctor:process.argv.includes('--doctor')});console.log(JSON.stringify(result));if(result.failed)process.exitCode=1}
 catch{console.error('Search worker failed: check private socket, native grant and provider configuration');process.exitCode=1}
}
