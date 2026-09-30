// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {readInstance,readDeploymentOrigin} from '../backend/instance.mjs'

test('instance fence denies unsealed/wrong environments and identity cannot be silently changed',()=>{
 const db=new DatabaseSync(':memory:')
 try {
  db.exec(readFileSync(new URL('../backend/migrations/U1790380802__instance.sql',import.meta.url),'utf8'))
  const port={begin(){db.exec('BEGIN');return {query:(sql,p)=>db.prepare(sql).all(...p).map(Object.values),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}}
  assert.throws(()=>readInstance(port,'acceptance'),{code:'unavailable'})
  db.prepare('INSERT INTO _meos_instance VALUES (1,?,?)').run('a'.repeat(32),'acceptance')
  assert.deepEqual(readInstance(port,'acceptance'),{instanceId:'a'.repeat(32),environment:'acceptance'})
  assert.throws(()=>readInstance(port,'production'),{code:'unavailable'})
  assert.throws(()=>db.exec("UPDATE _meos_instance SET environment='production'"),/sealed/)
  assert.throws(()=>db.exec('DELETE FROM _meos_instance'),/sealed/)
 }finally{db.close()}
})

test('trusted deployment origin is explicit, independent of owner preferences, and sealed',()=>{
 for(const origin of ['https://planner.second-owner.invalid','https://planner.third-owner.invalid:9443']) {
  const db=new DatabaseSync(':memory:')
  try {
   for(const migration of ['U1790380802__instance.sql','U1790380814__deployment_origin.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+migration,import.meta.url),'utf8'))
   db.prepare('INSERT INTO _meos_instance VALUES (1,?,?)').run('b'.repeat(32),'production')
   const port={begin(){db.exec('BEGIN');return {query:(sql,p)=>db.prepare(sql).all(...p).map(Object.values),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}}
   assert.throws(()=>readDeploymentOrigin(port),{code:'unavailable'})
   db.prepare('INSERT INTO _meos_deployment VALUES(1,?)').run(origin)
   assert.equal(readDeploymentOrigin(port),origin)
   assert.throws(()=>db.exec("UPDATE _meos_deployment SET origin='https://attacker.invalid'"),/sealed/)
   assert.throws(()=>db.exec('DELETE FROM _meos_deployment'),/sealed/)
   assert.equal(readDeploymentOrigin(port),origin)
  }finally{db.close()}
 }
})
test('malformed operator configuration fails closed, never guessing a request origin',()=>{
 for(const value of ['http://planner.invalid','https://planner.invalid/','https://user:pass@planner.invalid','https://planner.invalid/path','https://planner.invalid?next=foreign','not a URL']) {
  const db=new DatabaseSync(':memory:')
  try {
   db.exec('CREATE TABLE _meos_deployment(singleton INTEGER,origin TEXT)')
   db.prepare('INSERT INTO _meos_deployment VALUES(1,?)').run(value)
   const port={begin(){db.exec('BEGIN');return {query:(sql,p)=>db.prepare(sql).all(...p).map(Object.values),commit:()=>db.exec('COMMIT'),rollback:()=>db.exec('ROLLBACK')}}}
   assert.throws(()=>readDeploymentOrigin(port))
  }finally{db.close()}
 }
})
