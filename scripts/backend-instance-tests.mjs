// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {readInstance} from '../backend/instance.mjs'

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
