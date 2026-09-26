// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('upgrade preservation covers occurrences/outcomes, detects tamper, and fails closed for absent required tables',()=>{
const source=new URL('./calendar-preservation.py',import.meta.url).pathname;
const result=spawnSync('/usr/bin/python3',['-c',`
import importlib.util,sqlite3,sys
spec=importlib.util.spec_from_file_location('proof',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
db=sqlite3.connect(':memory:')
for table in m.REQUIRED_TABLES:
 db.execute('CREATE TABLE "'+table+'"(id INTEGER PRIMARY KEY, doc TEXT)')
 db.execute('INSERT INTO "'+table+'" VALUES(1,?)',('synthetic-original',))
before=m.fingerprint(db)
assert 'occurrences' in before and 'outcomes' in before
for table in m.REQUIRED_TABLES:
 db.execute('SAVEPOINT test')
 db.execute('UPDATE "'+table+'" SET doc=?',('synthetic-tamper',))
 assert m.fingerprint(db)!=before,table
 db.execute('ROLLBACK TO test');db.execute('RELEASE test')
 assert m.fingerprint(db)==before
 db.execute('SAVEPOINT missing')
 db.execute('DROP TABLE "'+table+'"')
 try:m.fingerprint(db)
 except AssertionError:pass
 else:raise AssertionError('Absent required table accepted: '+table)
 db.execute('ROLLBACK TO missing');db.execute('RELEASE missing')
assert m.fingerprint(db)==before
`,source],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
