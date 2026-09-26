// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createCommands } from '../backend/commands.mjs'
import { createDatabasePort, toSqlValue, fromSqlValue, decodeHostContext, sessionResponse } from '../backend/trailbase-port.mjs'

test('independent ABI conversions preserve blobs, nulls, text and numbers without integer loss',()=>{
 for(const value of [null,'text',new Uint8Array([0,255]),0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.deepEqual(fromSqlValue(toSqlValue(value)),value)
 for(const bad of [undefined,true,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,{},[]])assert.throws(()=>toSqlValue(bad))
 for(const bad of [{tag:'integer',val:1},{tag:'integer',val:2n**63n},{tag:'real',val:Infinity},{tag:'blob',val:[]}])assert.throws(()=>fromSqlValue(bad))
})

test('real commands run through independently encoded ABI-shaped resource against disposable SQLite',()=>{
 const db=new DatabaseSync(':memory:')
 try {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _user(id BLOB PRIMARY KEY NOT NULL) STRICT;')
  const owner=randomUUID();db.prepare('INSERT INTO _user VALUES (?)').run(Buffer.from(owner.replaceAll('-',''),'hex'))
  db.exec(readFileSync(new URL('../backend/migrations/U1790380800__planner.sql',import.meta.url),'utf8'))
  class SyntheticResource {
   constructor(){db.exec('BEGIN IMMEDIATE')}
   query(sql,values){return db.prepare(sql).all(...values.map(fromSqlValue)).map(row=>Object.values(row).map(toSqlValue))}
   execute(sql,values){return BigInt(db.prepare(sql).run(...values.map(fromSqlValue)).changes)}
   commit(){db.exec('COMMIT')}
   rollback(){db.exec('ROLLBACK')}
  }
  const port=createDatabasePort(SyntheticResource),commands=createCommands(port)
  const p={id:randomUUID(),title:'ABI project',notes:{type:'doc'}}
  const t={id:randomUUID(),title:'ABI task',notes:{type:'doc'},projectId:p.id,priority:'none',completed:false}
  commands.create(owner,'projects',p);commands.create(owner,'tasks',t)
  commands.archiveProject(owner,p.id,1)
  assert.equal(commands.get(owner,'tasks',t.id).value.projectId,undefined)
  assert.equal(commands.get(owner,'tasks',t.id).revision,2)
  assert.throws(()=>commands.update(owner,'tasks',t,1))
  assert.equal(commands.get(owner,'tasks',t.id).revision,2)
  const transaction=port.begin();transaction.rollback();assert.throws(()=>transaction.query('SELECT 1'))
 }finally{db.close()}
})

test('host identity conversion is canonical and safe session output contains no bearer credentials',async()=>{
 const id=randomUUID(),encoded=Buffer.from(id.replaceAll('-',''),'hex').toString('base64url')+'=='
 const host={kind:'Http',user:{id:encoded,csrf_token:'a'.repeat(20),auth_token:'must-not-leak',refresh_token:'must-not-leak'}}
 const user=decodeHostContext(JSON.stringify(host));assert.deepEqual(user,{id,csrf:'a'.repeat(20)})
 const response=sessionResponse(user);assert.equal(response.headers.get('Cache-Control'),'no-store')
 assert.deepEqual(await response.json(),{user:{id},csrf:'a'.repeat(20)})
 assert.equal(decodeHostContext(JSON.stringify({kind:'Job',user:host.user})),null)
 assert.equal(decodeHostContext(JSON.stringify({kind:'Http',user:null})),null)
 for(const raw of ['bad',JSON.stringify({kind:'Http',user:{...host.user,id}}),JSON.stringify({kind:'Http',user:{...host.user,csrf_token:''}})])assert.throws(()=>decodeHostContext(raw))
})

test('QuickJS numeric WIT adapter rejects unsafe SQL integers and preserves safe values',async()=>{
 const {quickJsTransactionClass}=await import('../backend/trailbase-port.mjs')
 let unsafe=false
 class Native {
  query(_sql,values){return unsafe?[[{tag:'integer',val:2**53}]]:[values]}
  execute(){return 1}
  commit(){} rollback(){}
 }
 const port=createDatabasePort(quickJsTransactionClass(Native)),tx=port.begin()
 assert.deepEqual(tx.query('echo',[Number.MAX_SAFE_INTEGER]),[[Number.MAX_SAFE_INTEGER]])
 assert.equal(tx.execute('x'),1)
 unsafe=true;assert.throws(()=>tx.query('bad'),{code:'unavailable'})
})
