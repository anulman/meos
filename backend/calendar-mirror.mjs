// SPDX-License-Identifier: Apache-2.0
// Piggybacks on the existing sync worker. SQLite snapshots remain the durable
// provider authority; this is only a credential-free projection into app storage.
import {createHash} from 'node:crypto';
export function createCalendarMirror({store,planner,snapshot,connection}){
 let queue=Promise.resolve(),published;
 async function publish(){
  if(!planner)return;
  const value=snapshot(),generation=connection().generation;
  const fingerprint=createHash('sha256').update(JSON.stringify({generation,...value})).digest('hex');
  if(fingerprint===published)return;
  const sequence=store.transaction(tx=>{const n=(tx.get('mirror-sequence')??0)+1;if(!Number.isSafeInteger(n))throw Error('mirror_sequence');tx.set('mirror-sequence',n);return n});
  const pages=[];let page={items:[],drafts:[],conflicts:[]},bytes=0;
  for(const field of ['items','drafts','conflicts'])for(const item of value[field]){
   const size=Buffer.byteLength(JSON.stringify(item))+1;
   if(size>120000)throw Error('mirror_record_limit');
   if(bytes+size>120000||page[field].length>=250){pages.push(page);page={items:[],drafts:[],conflicts:[]};bytes=0}
   page[field].push(item);bytes+=size;
  }
  pages.push(page);
  for(let i=0;i<pages.length;i++){
   if(connection().generation!==generation)throw Error('mirror_generation_changed');
   const receipt=await planner.invoke('calendar_cache_publish',{sequence,generation,page:i,pages:pages.length,...pages[i],...(i===0?{metadata:value.metadata}:{})});
   if(receipt.sequence!==sequence||receipt.committed!==(i===pages.length-1))throw Error('mirror_receipt');
  }
  if(connection().generation!==generation)throw Error('mirror_generation_changed');
  published=fingerprint;
 }
 return {publish(){const next=queue.catch(()=>{}).then(publish);queue=next;return next}};
}
