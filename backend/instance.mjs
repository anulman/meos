// SPDX-License-Identifier: Apache-2.0
import {DomainError} from './domain.mjs'
export function readInstance(database,expectedEnvironment) {
 if(!['acceptance','production'].includes(expectedEnvironment))throw new TypeError('Explicit runtime environment required')
 const tx=database.begin()
 try {
  const rows=tx.query('SELECT instance_id, environment FROM _meos_instance WHERE singleton=1',[])
  if(rows.length!==1||!/^[0-9a-f]{32}$/.test(rows[0][0])||rows[0][1]!==expectedEnvironment)throw new DomainError('unavailable','Instance identity mismatch')
  tx.commit()
  return {instanceId:rows[0][0],environment:rows[0][1]}
 }catch(error){try{tx.rollback()}catch{};throw error}
}

// Only trusted bootstrap writes this table. Never infer the trusted origin from
// Host/Origin headers, a user's preferences, or another owner-writable record.
export function readDeploymentOrigin(database) {
 const tx=database.begin()
 try {
  const rows=tx.query('SELECT origin FROM _meos_deployment WHERE singleton=1',[])
  if(rows.length!==1||typeof rows[0][0]!=='string')throw new DomainError('unavailable','Deployment origin is not configured')
  const origin=rows[0][0],parsed=new URL(origin)
  if(parsed.protocol!=='https:'||parsed.origin!==origin||parsed.username||parsed.password)throw new DomainError('unavailable','Invalid deployment origin')
  tx.commit()
  return origin
 }catch(error){try{tx.rollback()}catch{};throw error}
}
