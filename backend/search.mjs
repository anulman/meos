// SPDX-License-Identifier: Apache-2.0
import {DomainError} from './domain.mjs'
import {embeddingInput,EMBEDDING_INDEX,EMBEDDING_INPUT} from './embedding-input.mjs'
export const SEARCH_MODEL='text-embedding-3-small', SEARCH_DIMENSIONS=1536
const identity={model:SEARCH_MODEL,dimensions:SEARCH_DIMENSIONS,indexVersion:EMBEDDING_INDEX,inputVersion:EMBEDDING_INPUT}
const descriptor=r=>({id:r[0],revision:r[1],...embeddingInput(r[2]),attempt:r[3],type:r[4]===null?'query':'document',...identity,...(r[4]===null?{}:{source:{kind:r[5],id:r[6]}})})
const jobColumns='j.id,j.revision,j.text,j.attempts,j.document_id,d.kind,d.entity_id'
const kinds=['tasks','projects','routines','occurrences','periodNotes']
const blob=id=>Uint8Array.from(id.replaceAll('-','').match(/../g).map(x=>parseInt(x,16)))
const vector=value=>{if(!Array.isArray(value)||value.length!==SEARCH_DIMENSIONS||value.some(x=>typeof x!=='number'||!Number.isFinite(x))||!value.some(x=>x!==0))throw new DomainError('validation','Invalid embedding');return JSON.stringify(value)}
export function flushSearchIndex(db){
 for(const [id] of db.query('SELECT rowid FROM search_dirty',[])){
  db.execute('DELETE FROM search_fts WHERE rowid=?',[id]);db.execute('DELETE FROM search_vectors WHERE rowid=?',[id])
  db.execute('INSERT INTO search_fts(rowid,title,body) SELECT rowid,title,body FROM search_documents WHERE rowid=?',[id])
  db.execute('DELETE FROM search_dirty WHERE rowid=?',[id])
 }
}
export function searchOperation(db,owner,name,input,now){
 flushSearchIndex(db)
 const ownerId=blob(owner),config=db.query('SELECT enabled FROM search_config WHERE owner_id=?',[ownerId])[0],enabled=config?.[0]===1
 if(name==='search_index_status')return {enabled,model:SEARCH_MODEL,dimensions:SEARCH_DIMENSIONS,pending:db.query('SELECT count(*) FROM search_jobs WHERE owner_id=? AND embedding IS NULL',[ownerId])[0][0]}
 if(name==='configure_search'){
  db.execute('INSERT INTO search_config VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled',[ownerId,input.enabled?1:0,SEARCH_MODEL,SEARCH_DIMENSIONS]);return {enabled:input.enabled,model:SEARCH_MODEL,dimensions:SEARCH_DIMENSIONS}
 }
 if(name==='search_index_batch'){
  if(!enabled)return {items:[],enabled:false,model:SEARCH_MODEL,dimensions:SEARCH_DIMENSIONS}
  // Query jobs expire even if no subsequent search is performed.
  db.execute('DELETE FROM search_jobs WHERE owner_id=? AND query IS NOT NULL AND created_at<?',[ownerId,now-3600000])
  const clauses=['j.owner_id=?','j.embedding IS NULL','j.retry_at<=?'],params=[ownerId,now]
  if(input.id!==undefined){clauses.push('j.id=?');params.push(input.id)}
  if(input.source){clauses.push('d.kind=?','d.entity_id=?');params.push(input.source.kind,input.source.id)}
  const rows=db.query(`SELECT ${jobColumns} FROM search_jobs j LEFT JOIN search_documents d ON d.rowid=j.document_id WHERE ${clauses.join(' AND ')} ORDER BY j.query IS NULL,j.id LIMIT ?`,[...params,input.limit??8])
  // Lease expiry permits another claim; it does not execute a producer.
  for(const r of rows)db.execute('UPDATE search_jobs SET attempts=attempts+1,retry_at=? WHERE id=?',[now+Math.min(3600000,60000*2**Math.min(r[3],6)),r[0]])
  return {items:rows.map(r=>({...descriptor(r),attempt:r[3]+1})),enabled:true,model:SEARCH_MODEL,dimensions:SEARCH_DIMENSIONS}
 }
 if(name==='search_index_commit'||name==='search_query_commit'){
  if(!enabled)throw new DomainError('unavailable','Embedding generation disabled')
  db.execute('DELETE FROM search_jobs WHERE owner_id=? AND query IS NOT NULL AND created_at<?',[ownerId,now-3600000])
  const row=db.query('SELECT document_id,revision,embedding,text FROM search_jobs WHERE owner_id=? AND id=?',[ownerId,input.id])[0]
  if(!row||row[1]!==input.revision||name==='search_query_commit'&&row[0]!==null)return {accepted:false}
  if(Object.entries(identity).some(([key,value])=>input[key]!==value)||input.inputHash!==embeddingInput(row[3]).inputHash)return {accepted:false}
  const encoded=vector(input.embedding)
  if(row[2]!==null)return {accepted:true}
  if(row[0]!==null){
   const current=db.query('SELECT revision FROM search_documents WHERE rowid=? AND owner_id=?',[row[0],ownerId])[0]
   // Metadata-only edits retain immutable jobs. Text edits replace monotonic IDs.
   if(!current)return {accepted:false}
   db.execute('DELETE FROM search_vectors WHERE rowid=?',[row[0]])
   db.execute('INSERT INTO search_vectors(rowid,embedding) VALUES(?,?)',[row[0],encoded])
  }
  // Derived tables only: no source revision/outbox/lifecycle event changes.
  db.execute('UPDATE search_jobs SET embedding=? WHERE id=?',[encoded,input.id]);return {accepted:true}
 }
 if(name!=='search')throw new DomainError('validation','Unknown search operation')
 const query=input.query.trim();if(!query)throw new DomainError('validation','Search query required')
 const selected=input.kinds??kinds,limit=input.limit??20
 const filters=`d.owner_id=? AND d.kind IN (${selected.map(()=>'?').join(',')})${input.includeArchived?'':' AND d.archived=0'}`
 const params=[ownerId,...selected]
 // Quote every token: search text is never FTS grammar or SQL.
 const terms=query.match(/[\p{L}\p{N}_]+/gu)??[]
 const match=terms.slice(0,32).map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ')
 const lexical=match?db.query(`SELECT d.rowid,d.kind,d.entity_id,d.revision,d.title,substr(d.body,1,300),bm25(search_fts,5.0,1.0) FROM search_fts JOIN search_documents d ON d.rowid=search_fts.rowid WHERE search_fts MATCH ? AND ${filters} ORDER BY bm25(search_fts,5.0,1.0),d.rowid LIMIT 100`,[match,...params]):[]
 let semantic='disabled',semanticRows=[],queryJob
 if(input.mode!=='keyword'&&enabled){
  db.execute('DELETE FROM search_jobs WHERE owner_id=? AND query IS NOT NULL AND created_at<?',[ownerId,now-3600000])
  let cached=db.query('SELECT embedding FROM search_jobs WHERE owner_id=? AND query=?',[ownerId,query])[0]
  if(!cached){
   // Bound query retention per owner, including pending queries.
   db.execute('DELETE FROM search_jobs WHERE id IN (SELECT id FROM search_jobs WHERE owner_id=? AND query IS NOT NULL ORDER BY id DESC LIMIT -1 OFFSET 99)',[ownerId])
   db.execute('INSERT INTO search_jobs(owner_id,revision,text,query,created_at) VALUES(?,1,?,?,?) ON CONFLICT(owner_id,query) DO NOTHING',[ownerId,query,query,now])
  }
  if(!cached?.[0])queryJob=descriptor(db.query(`SELECT ${jobColumns} FROM search_jobs j LEFT JOIN search_documents d ON d.rowid=j.document_id WHERE j.owner_id=? AND j.query=?`,[ownerId,query])[0])
  semantic=cached?.[0]?'ready':'pending'
  if(cached?.[0])semanticRows=db.query(`SELECT d.rowid,d.kind,d.entity_id,d.revision,d.title,substr(d.body,1,300),vec_distance_cosine(v.embedding,?) AS distance FROM search_documents d JOIN search_vectors v ON v.rowid=d.rowid WHERE ${filters} ORDER BY distance,d.rowid LIMIT 100`,[cached[0],...params])
 }
 const found=new Map()
 for(const list of [lexical,semanticRows])list.forEach((r,i)=>{const item=found.get(r[0])??{kind:r[1],id:r[2],revision:r[3],title:r[4],excerpt:r[5],score:0};item.score+=1/(60+i+1);found.set(r[0],item)})
 const pending=enabled?db.query('SELECT count(*) FROM search_jobs WHERE owner_id=? AND document_id IS NOT NULL AND embedding IS NULL',[ownerId])[0][0]:0
 return {items:[...found.values()].sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)).slice(0,limit),semantic,pendingDocuments:pending,...(semantic==='pending'?{retryAfterMs:2000,queryJob}:{})}
}
