// SPDX-License-Identifier: Apache-2.0
import { canonical, DomainError, uuid } from './domain.mjs'
const blob=value=>Uint8Array.from(uuid(value).replaceAll('-','').match(/../g).map(hex=>parseInt(hex,16)))
export function createWeatherStorage({begin}) {
 const tx=operation=>{const db=begin();try{const result=operation(db);db.commit();return result}catch(error){try{db.rollback()}catch{};throw error}}
 return {
  latest:owner=>tx(db=>{const row=db.query('SELECT doc FROM latest_location WHERE owner_id=?',[blob(owner)])[0];return row?JSON.parse(row[0]):undefined}),
  replaceLatest:(owner,value,expected)=>tx(db=>{
   const count=expected===undefined
    ?db.execute('INSERT INTO latest_location(owner_id,doc,observed_at) VALUES(?,?,?) ON CONFLICT DO NOTHING',[blob(owner),canonical(value),Date.parse(value.observedAt)])
    :db.execute('UPDATE latest_location SET doc=?,observed_at=? WHERE owner_id=? AND observed_at=?',[canonical(value),Date.parse(value.observedAt),blob(owner),Date.parse(expected)])
   if(count!==1)throw new DomainError('conflict','Location observation changed')
  }),
  cached:(owner,key)=>tx(db=>{const row=db.query('SELECT doc FROM weather_cache WHERE owner_id=? AND cache_key=?',[blob(owner),key])[0];return row?JSON.parse(row[0]):undefined}),
  save:(owner,key,value)=>tx(db=>db.execute('INSERT INTO weather_cache(owner_id,cache_key,doc,fetched_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,cache_key) DO UPDATE SET doc=excluded.doc,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at',[blob(owner),key,canonical(value),Date.parse(value.fetchedAt),Date.parse(value.expiresAt)])),
  purgeBefore:timestamp=>tx(db=>db.execute('DELETE FROM weather_cache WHERE fetched_at<=?',[timestamp]))
 }
}
