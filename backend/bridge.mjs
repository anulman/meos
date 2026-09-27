// SPDX-License-Identifier: Apache-2.0
import {DomainError,uuid} from './domain.mjs'
const blob=id=>Uint8Array.from(uuid(id).replaceAll('-','').match(/../g).map(v=>parseInt(v,16)))
const uuidFrom=bytes=>{const h=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');return uuid(`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`)}
export function createBridge({database,weather}) {
 return {
  ownerFor(identity) {
   const db=database.begin()
   try {const rows=db.query('SELECT owner_id FROM _meos_bridge_binding WHERE bridge_id=?',[blob(identity)]);db.commit();return rows.length?uuidFrom(rows[0][0]):undefined}
   catch(error){try{db.rollback()}catch{};throw error}
  },
  ingest(identity,observation) {
   const owner=this.ownerFor(identity)
   if(!owner)throw new DomainError('forbidden','Bridge identity required')
   if(observation?.source!=='bridge')throw new DomainError('validation','Bridge source required')
   return weather.ingest(owner,observation)
  }
 }
}
