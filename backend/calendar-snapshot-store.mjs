// SPDX-License-Identifier: Apache-2.0
// Collection manifests and bounded parts share one SQLite transaction. Planner
// baselines/history need the same bound as imported Calendar snapshots.
const kind=key=>key==='snapshot:primary'||key==='snapshot:managed'?'snapshot':key==='planner-sync'?'planner':null;
export function createCalendarSnapshotStore(store){
 function read(tx,key){
  const value=tx.get(key),type=kind(key);if(!type||!value||value._chunks===undefined)return value;
  const {_chunks,...meta}=value;if(!Number.isSafeInteger(_chunks)||_chunks<0||_chunks>200000)throw Error('invalid_snapshot');
  const events=[],expanded=[],mappings=[],conflicts=[];
  for(let i=0;i<_chunks;i++){
   const part=tx.get(key+':p'+i);if(!Array.isArray(part))throw Error('missing_snapshot_part');
   for(const [tag,id,item]of part){
    if(type==='snapshot'&&tag==='event')events.push([id,item]);
    else if(type==='snapshot'&&tag==='expanded')expanded.push(item);
    else if(type==='planner'&&tag==='mapping')mappings.push([id,item]);
    else if(type==='planner'&&tag==='conflict')conflicts.push([id,item]);
    else throw Error('invalid_snapshot_part');
   }
  }
  return type==='snapshot'?{...meta,events:Object.fromEntries(events),expanded}:{...meta,mappings:Object.fromEntries(mappings),conflicts:Object.fromEntries(conflicts)};
 }
 function write(tx,key,value){
  const type=kind(key);if(!type)return tx.set(key,value);
  const old=tx.get(key),{events={},expanded=[],mappings={},conflicts={},...meta}=value;let part=[],bytes=2,index=0;
  function flush(){if(part.length){tx.set(key+':p'+index++,part);part=[];bytes=2}}
  function append(entry){const size=Buffer.byteLength(JSON.stringify(entry))+1;if(size>2*1024*1024)throw Error('event_limit');if(bytes+size>2*1024*1024)flush();part.push(entry);bytes+=size}
  if(type==='snapshot'){for(const [id,e]of Object.entries(events))append(['event',id,e]);for(const e of expanded)append(['expanded','',e])}
  else {for(const [id,m]of Object.entries(mappings))append(['mapping',id,m]);for(const [id,c]of Object.entries(conflicts))append(['conflict',id,c])}
  flush();for(let i=index;i<(old?._chunks??0);i++)tx.delete(key+':p'+i);tx.set(key,{...meta,_chunks:index});
 }
 function remove(tx,key){if(kind(key)){const value=tx.get(key);for(let i=0;i<(value?._chunks??0);i++)tx.delete(key+':p'+i)}tx.delete(key)}
 return {get:key=>store.transaction(tx=>read(tx,key)),transaction:fn=>store.transaction(tx=>fn({get:key=>read(tx,key),set:(key,value)=>write(tx,key,value),delete:key=>remove(tx,key)}))};
}
