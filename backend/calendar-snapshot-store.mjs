// SPDX-License-Identifier: Apache-2.0
// Whole-collection commits remain atomic without storing a historical calendar
// in one size-limited JSON value. Part replacements and manifest share one SQLite
// transaction; readers never observe a partial generation.
const snapshot=key=>key==='snapshot:primary'||key==='snapshot:managed';
export function createCalendarSnapshotStore(store){
 function read(tx,key){const value=tx.get(key);if(!snapshot(key)||!value||value._chunks===undefined)return value;const {_chunks,...meta}=value;const events=[],expanded=[];if(!Number.isSafeInteger(_chunks)||_chunks<0||_chunks>200000)throw Error('invalid_snapshot');for(let i=0;i<_chunks;i++){const part=tx.get(key+':p'+i);if(!Array.isArray(part))throw Error('missing_snapshot_part');for(const [kind,id,event]of part){if(kind==='event')events.push([id,event]);else if(kind==='expanded')expanded.push(event);else throw Error('invalid_snapshot_part')}}return {...meta,events:Object.fromEntries(events),expanded}}
 function write(tx,key,value){if(!snapshot(key))return tx.set(key,value);const old=tx.get(key),{events={},expanded=[],...meta}=value;let part=[],bytes=2,index=0;function flush(){if(part.length){tx.set(key+':p'+index++,part);part=[];bytes=2}}for(const entry of [...Object.entries(events).map(([id,e])=>['event',id,e]),...expanded.map(e=>['expanded','',e])]){const size=Buffer.byteLength(JSON.stringify(entry))+1;if(size>2*1024*1024)throw Error('event_limit');if(bytes+size>2*1024*1024)flush();part.push(entry);bytes+=size}flush();for(let i=index;i<(old?._chunks??0);i++)tx.delete(key+':p'+i);tx.set(key,{...meta,_chunks:index})}
 return {get:key=>store.transaction(tx=>read(tx,key)),transaction:fn=>store.transaction(tx=>fn({get:key=>read(tx,key),set:(key,value)=>write(tx,key,value),delete:key=>tx.delete(key)}))};
}
