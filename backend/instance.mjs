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
