// SPDX-License-Identifier: Apache-2.0
// Optional host worker. No SQL/database mount; native grant is owner-bound.
export function createEmbeddingProvider({apiKey,fetcher=fetch}){
 if(!apiKey)throw Error('MEOS_OPENAI_API_KEY is required when embeddings are enabled')
 return async function embed(text){
  const response=await fetcher('https://api.openai.com/v1/embeddings',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'text-embedding-3-small',dimensions:1536,input:text,encoding_format:'float'})})
  if(!response.ok)throw Error('Embedding provider unavailable')
  const raw=await response.text();if(raw.length>100000)throw Error('Embedding response too large')
  const data=JSON.parse(raw),value=data.data?.[0]?.embedding
  if(data.model!=='text-embedding-3-small'||!Array.isArray(value)||value.length!==1536||value.some(x=>!Number.isFinite(x))||!value.some(x=>x!==0))throw Error('Invalid embedding response')
  return value
 }
}
export async function runEmbeddingBatch({call,embed}){
 const batch=await call('search_index_batch',{limit:8})
 if(!batch.enabled)return {enabled:false,completed:0,failed:0}
 let completed=0,failed=0
 for(const item of batch.items){try{const embedding=await embed(item.text);const result=await call('search_index_commit',{id:item.id,revision:item.revision,model:item.model,dimensions:item.dimensions,indexVersion:item.indexVersion,inputVersion:item.inputVersion,inputHash:item.inputHash,embedding});if(result.accepted)completed++}catch{failed++}}
 return {enabled:true,completed,failed}
}
